// Tests the REAL src/data/sync.ts and the REAL Drive adapter in src/integrations/google-drive.ts (bundled with esbuild),
// against in-memory fakes. Run: node test-sync.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), "sn-sync-"));
const entry = join(out, "entry.ts");
writeFileSync(entry, `export { syncLibrary } from ${JSON.stringify(join(here, "../src/data/sync.ts"))};
export { GoogleDriveService } from ${JSON.stringify(join(here, "../src/integrations/google-drive.ts"))};`);
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: join(out, "bundle.mjs"), logLevel: "error" });
const { syncLibrary, GoogleDriveService } = await import(pathToFileURL(join(out, "bundle.mjs")).href);

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const bytes = (s) => new TextEncoder().encode(s);
const text = (u) => new TextDecoder().decode(u);

// ------------------------------------------------------------------ fakes for the sync engine
function makeWorld() {
  let clock = 1_000_000;
  const tick = () => (clock += 1000);
  const remoteFiles = new Map(); // id -> {id,name,modifiedTime,noteId,kind,data}
  let nextFile = 1, failList = false, failDownloadFor = null, onUpload = null;
  const FOLDER = "application/vnd.google-apps.folder";
  const live = (f, d = 0) => !f.trashed && (d > 20 || f.parentId === "ROOT" || !remoteFiles.get(f.parentId) || live(remoteFiles.get(f.parentId), d + 1)); // Drive hides what is under a trashed folder
  const remote = {
    async rootId() { return "ROOT"; },
    async list() {
      if (failList) throw new Error("Google Drive session expired.");
      return [...remoteFiles.values()].filter(live).map(({ data, ...f }) => f);
    },
    async trash(id) { const f = remoteFiles.get(id); if (f) f.trashed = true; },
    async upload({ name, data, fileId, noteId, kind, parentId, fromParentId }) {
      if (onUpload) await onUpload();
      let f = fileId ? remoteFiles.get(fileId) : undefined;
      if (fileId && !f) throw new Error("Drive 404");
      if (!f) { f = { id: `F${nextFile++}` }; remoteFiles.set(f.id, f); }
      if (fileId && fromParentId !== undefined && f.parentId !== fromParentId) throw new Error("the sync engine moved a file from a parent it is not in");
      Object.assign(f, { name, noteId, kind, parentId, data: data.slice(), modifiedTime: new Date(tick()).toISOString() });
      const { data: _d, ...meta } = f;
      return meta;
    },
    async createFolder({ name, noteId, parentId }) {
      const f = { id: `F${nextFile++}`, name, noteId, kind: "note", mime: FOLDER, parentId, modifiedTime: new Date(tick()).toISOString() };
      remoteFiles.set(f.id, f);
      return { ...f };
    },
    async update(id, { name, parentId }) {
      const f = remoteFiles.get(id);
      if (!f) throw new Error("Drive 404");
      if (name !== undefined) f.name = name;
      if (parentId !== undefined) f.parentId = parentId;
      f.modifiedTime = new Date(tick()).toISOString();
      const { data: _d, ...meta } = f;
      return meta;
    },
    async download(id) {
      if (failDownloadFor === id) throw new Error("boom");
      return remoteFiles.get(id).data.slice();
    },
  };
  const metas = new Map(), datas = new Map();
  const local = {
    list: async () => [...metas.values()].map((m) => ({ ...m })),
    getBytes: async (id) => datas.get(id)?.slice(),
    create: async (item, b) => { metas.set(item.id, { ...item }); if (b) datas.set(item.id, b.slice()); }, // a notebook has no bytes
    update: async (id, fields, b) => { if (!metas.has(id)) return false; metas.set(id, { ...metas.get(id), ...fields }); if (b) datas.set(id, b.slice()); return true; },
  };
  let idn = 0;
  const hooks = {
    isBusy: () => false,
    tombstones: new Set(),
    inspect: async (b) => { if (text(b).startsWith("CORRUPT")) throw new Error("corrupt archive"); return { thumb: "thumb:" + text(b) }; },
    newId: () => `new-${++idn}`,
    now: () => clock,
  };
  const addLocal = async (id, title, content, extra = {}) => {
    const t = tick();
    await local.create({ id, title, kind: "note", created: t, modified: t, trashed: false, ...extra }, bytes(content));
  };
  const addLocalFolder = async (id, title, parentId) => {
    const t = tick();
    await local.create({ id, title, kind: "folder", created: t, modified: t, trashed: false, ...(parentId ? { parentId } : {}) });
  };
  const addRemoteFolder = (id, name, parentId, noteId) => { remoteFiles.set(id, { id, name, noteId, kind: "note", mime: FOLDER, parentId, modifiedTime: new Date(tick()).toISOString() }); };
  const addRemoteNote = (id, name, content, parentId, noteId) => { remoteFiles.set(id, { id, name, noteId, kind: "note", parentId, data: bytes(content), modifiedTime: new Date(tick()).toISOString() }); };
  const editLocal = async (id, content) => { await local.update(id, { modified: tick() }, bytes(content)); };
  const editRemote = (id, content, name) => {
    const f = remoteFiles.get(id);
    f.data = bytes(content); if (name) f.name = name; f.modifiedTime = new Date(tick()).toISOString();
  };
  return { remote, local, hooks, remoteFiles, metas, datas, addLocal, addLocalFolder, addRemoteFolder, addRemoteNote, editLocal, editRemote, tick,
    set failList(v) { failList = v; }, set failDownloadFor(v) { failDownloadFor = v; }, set onUpload(v) { onUpload = v; } };
}
const run = (w) => syncLibrary(w.remote, w.local, w.hooks);

console.log("sync engine");

await test("first sync uploads every local note and links it", async () => {
  const w = makeWorld();
  await w.addLocal("a", "Alpha", "A1"); await w.addLocal("b", "Beta", "B1");
  const r = await run(w);
  assert.deepEqual([r.uploaded, r.pulled, r.imported, r.conflicts], [2, 0, 0, 0]);
  assert.equal(w.remoteFiles.size, 2);
  const f = [...w.remoteFiles.values()].find((x) => x.noteId === "a");
  assert.equal(f.name, "Alpha.note");
  assert.equal(text(f.data), "A1");
  const m = w.metas.get("a");
  assert.equal(m.syncId, f.id); assert.equal(m.syncRemote, f.modifiedTime); assert.equal(m.syncLocal, m.modified);
});

await test("a second sync with no changes does nothing", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const r = await run(w);
  assert.deepEqual([r.uploaded, r.pulled, r.imported, r.conflicts, r.errors.length], [0, 0, 0, 0, 0]);
});

await test("a local edit is uploaded to the same Drive file", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const id = w.metas.get("a").syncId;
  await w.editLocal("a", "A2");
  const r = await run(w);
  assert.equal(r.uploaded, 1);
  assert.equal(w.remoteFiles.size, 1);
  assert.equal(text(w.remoteFiles.get(id).data), "A2");
});

await test("a Drive-side edit is pulled down (title from the file name)", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const id = w.metas.get("a").syncId;
  w.editRemote(id, "A-remote", "Alpha renamed.note");
  const r = await run(w);
  assert.equal(r.pulled, 1);
  assert.equal(text(w.datas.get("a")), "A-remote");
  assert.equal(w.metas.get("a").title, "Alpha renamed");
  assert.equal(w.metas.get("a").thumb, "thumb:A-remote");
  assert.equal((await run(w)).pulled, 0); // settled
});

await test("an edit on both sides keeps BOTH versions (Drive copy saved as a conflict note)", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const id = w.metas.get("a").syncId;
  await w.editLocal("a", "A-local"); w.editRemote(id, "A-remote");
  const r = await run(w);
  assert.equal(r.conflicts, 1); assert.equal(r.uploaded, 1);
  const copy = [...w.metas.values()].find((m) => m.title === "Alpha (conflict)");
  assert.ok(copy, "conflict copy exists");
  assert.equal(text(w.datas.get(copy.id)), "A-remote");
  assert.equal(text(w.datas.get("a")), "A-local");
  assert.equal(text(w.remoteFiles.get(id).data), "A-local");
  assert.equal(copy.syncId, undefined); // starts unlinked; uploads as its own file next round
  const r2 = await run(w);
  assert.equal(r2.uploaded, 1);
  assert.equal(w.remoteFiles.size, 2);
});

await test("a file that exists only on Drive is downloaded and linked", async () => {
  const w = makeWorld();
  w.remoteFiles.set("R1", { id: "R1", name: "From phone.note", noteId: "phone-1", kind: "note", data: bytes("P1"), modifiedTime: new Date(w.tick()).toISOString() });
  const r = await run(w);
  assert.equal(r.imported, 1);
  const m = w.metas.get("phone-1");
  assert.equal(m.title, "From phone"); assert.equal(m.syncId, "R1"); assert.equal(text(w.datas.get("phone-1")), "P1");
  assert.deepEqual([(await run(w)).uploaded, (await run(w)).imported], [0, 0]);
});

await test("a PDF-kind file keeps its kind", async () => {
  const w = makeWorld();
  w.remoteFiles.set("R1", { id: "R1", name: "Paper.note", noteId: "p1", kind: "pdf", data: bytes("PDF"), modifiedTime: new Date(w.tick()).toISOString() });
  await run(w);
  assert.equal(w.metas.get("p1").kind, "pdf");
});

await test("a note deleted locally on purpose is not re-imported (tombstone)", async () => {
  const w = makeWorld();
  w.remoteFiles.set("R1", { id: "R1", name: "Old.note", noteId: "o1", kind: "note", data: bytes("O"), modifiedTime: new Date(w.tick()).toISOString() });
  w.hooks.tombstones = new Set(["R1"]);
  const r = await run(w);
  assert.equal(r.imported, 0); assert.equal(w.metas.size, 0);
});

await test("trashing a note here moves its Drive file to Drive's trash (never a permanent delete)", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const fid = w.metas.get("a").syncId;
  await w.local.update("a", { trashed: true, modified: w.tick() });
  const r = await run(w);
  assert.equal(r.trashedRemote, 1);
  assert.equal(w.remoteFiles.get(fid).trashed, true);
  assert.ok(w.remoteFiles.has(fid), "file still exists (in Drive's trash), not erased");
  assert.equal(w.metas.get("a").syncId, undefined, "unlinked so a restore starts fresh");
  assert.deepEqual([(await run(w)).trashedRemote, (await run(w)).uploaded], [0, 0]);
  // restore -> uploaded again as a new file
  await w.local.update("a", { trashed: false, modified: w.tick() });
  const r2 = await run(w);
  assert.equal(r2.uploaded, 1); assert.equal(r2.removedLocal, 0);
  assert.notEqual(w.metas.get("a").syncId, fid);
  assert.equal(w.metas.get("a").trashed, false);
});

await test("deleting a note forever here also trashes its Drive copy (tombstone)", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const fid = w.metas.get("a").syncId;
  w.hooks.tombstones = new Set([fid]); w.metas.delete("a"); w.datas.delete("a");
  const r = await run(w);
  assert.equal(r.trashedRemote, 1); assert.equal(w.remoteFiles.get(fid).trashed, true);
  assert.equal(w.metas.size, 0, "not re-imported");
  w.hooks.tombstones = new Set();
});

await test("a note trashed in Drive moves to the app's Trash (recoverable), and is not re-uploaded", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await w.addLocal("b", "Beta", "B1"); await run(w);
  w.remoteFiles.get(w.metas.get("a").syncId).trashed = true;       // deleted on drive.google.com
  const r = await run(w);
  assert.equal(r.removedLocal, 1); assert.equal(r.uploaded, 0);
  assert.equal(w.metas.get("a").trashed, true);
  assert.equal(text(w.datas.get("a")), "A1", "data kept, only moved to Trash");
  assert.equal(w.metas.get("b").trashed, false);
  assert.deepEqual([(await run(w)).removedLocal, (await run(w)).uploaded], [0, 0]); // settled
  await w.local.update("a", { trashed: false, modified: w.tick() });  // user restores it
  assert.equal((await run(w)).uploaded, 1);
});

await test("a note trashed in Drive but EDITED here since is kept and re-uploaded (edit wins)", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  w.remoteFiles.get(w.metas.get("a").syncId).trashed = true;
  await w.editLocal("a", "A-edited");
  const r = await run(w);
  assert.equal(r.removedLocal, 0); assert.equal(r.uploaded, 1);
  assert.equal(w.metas.get("a").trashed, false);
  assert.equal(text([...w.remoteFiles.values()].find((f) => !f.trashed).data), "A-edited");
});

await test("a few notes deleted in Drive are mirrored (below the mass-disappearance guard)", async () => {
  const w = makeWorld(); for (const id of ["a", "b", "c", "d"]) await w.addLocal(id, id.toUpperCase(), id); await run(w);
  for (const id of ["a", "b"]) w.remoteFiles.get(w.metas.get(id).syncId).trashed = true;
  const r = await run(w);
  assert.deepEqual([r.removedLocal, r.restored], [2, 0]);
});

await test("a whole emptied/recreated Drive folder is RESTORED, never mirrored into local trash", async () => {
  const w = makeWorld(); for (const id of ["a", "b", "c", "d"]) await w.addLocal(id, id.toUpperCase(), id); await run(w);
  for (const f of w.remoteFiles.values()) f.trashed = true;        // folder wiped
  const r = await run(w);
  assert.equal(r.removedLocal, 0); assert.equal(r.restored, 4); assert.equal(r.uploaded, 4);
  for (const id of ["a", "b", "c", "d"]) assert.equal(w.metas.get(id).trashed, false);
  assert.equal([...w.remoteFiles.values()].filter((f) => !f.trashed).length, 4);
});

await test("a note open in the editor is not trashed from under the user when Drive deletes it", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  w.remoteFiles.get(w.metas.get("a").syncId).trashed = true;
  w.hooks.isBusy = (id) => id === "a";
  const r = await run(w);
  assert.equal(r.skippedBusy, 1); assert.equal(w.metas.get("a").trashed, false);
  w.hooks.isBusy = () => false;
  assert.equal((await run(w)).removedLocal, 1);
});

await test("trashed notes are not uploaded, and not re-imported either", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  await w.local.update("a", { trashed: true, modified: w.tick() });
  const r = await run(w);
  assert.deepEqual([r.uploaded, r.imported, r.trashedRemote], [0, 0, 1]);
  await w.addLocal("t", "Never synced", "T", { trashed: true });
  assert.equal((await run(w)).uploaded, 0);
});

await test("a note open in the editor is not replaced from Drive until it is closed", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  w.editRemote(w.metas.get("a").syncId, "A-remote");
  w.hooks.isBusy = (id) => id === "a";
  const r = await run(w);
  assert.equal(r.skippedBusy, 1); assert.equal(text(w.datas.get("a")), "A1");
  w.hooks.isBusy = () => false;
  assert.equal((await run(w)).pulled, 1);
  assert.equal(text(w.datas.get("a")), "A-remote");
});

await test("a clean cached editor tab is released right before its data is replaced", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  w.editRemote(w.metas.get("a").syncId, "A-remote");
  const released = [];
  w.hooks.release = (id) => released.push(id);
  const r = await run(w);
  assert.equal(r.pulled, 1); assert.deepEqual(released, ["a"]);
  w.hooks.release = undefined;
});

await test("a PDF (or .note) dropped into the folder from drive.google.com is imported once, as a new note", async () => {
  const w = makeWorld();
  const mk = (id, name, mime) => w.remoteFiles.set(id, { id, name, mime, data: bytes("PDF-DATA"), modifiedTime: new Date(w.tick()).toISOString() });
  mk("P1", "Lecture.pdf", "application/pdf"); mk("P2", "exported.note", "application/octet-stream");
  mk("X1", "photo.png", "image/png"); mk("S1", "sub", "application/vnd.google-apps.folder");
  const got = [], done = new Set();
  w.hooks.sourceDone = (id) => done.has(id);
  w.hooks.importSource = async (f, d) => { got.push([f.name, text(d)]); done.add(f.id); };
  const r = await run(w);
  assert.equal(r.importedSources, 2); assert.deepEqual(got.map((g) => g[0]).sort(), ["Lecture.pdf", "exported.note"]);
  assert.equal(r.errors.length, 0, "png and sub-folder are ignored silently");
  assert.equal(w.metas.size, 0, "engine itself creates nothing: the hook owns import");
  const r2 = await run(w);
  assert.equal(r2.importedSources, 0); assert.equal(got.length, 2, "never imported twice");
  assert.equal(text(w.remoteFiles.get("P1").data), "PDF-DATA", "original untouched");
  w.hooks.sourceDone = undefined; w.hooks.importSource = undefined;
});

await test("without an import hook, foreign files are ignored (no error spam)", async () => {
  const w = makeWorld();
  w.remoteFiles.set("P1", { id: "P1", name: "Lecture.pdf", mime: "application/pdf", data: bytes("x"), modifiedTime: new Date(w.tick()).toISOString() });
  const r = await run(w);
  assert.deepEqual([r.importedSources, r.errors.length], [0, 0]);
});

await test("a save that lands DURING an upload is not lost (re-uploaded next round)", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  await w.editLocal("a", "A2");
  w.onUpload = async () => { await w.editLocal("a", "A3"); w.onUpload = null; };
  await run(w);
  assert.equal(text(w.datas.get("a")), "A3");           // local keeps the newer save
  const m = w.metas.get("a");
  assert.ok(m.modified > m.syncLocal, "still flagged as changed");
  const r = await run(w);
  assert.equal(r.uploaded, 1);
  assert.equal(text(w.remoteFiles.get(m.syncId).data), "A3");
});

await test("two Drive files claiming one note id never overwrite a local note", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1"); await run(w);
  const real = w.metas.get("a").syncId;
  w.remoteFiles.set("DUP", { id: "DUP", name: "Alpha dup.note", noteId: "a", kind: "note", data: bytes("DUP"), modifiedTime: new Date(w.tick()).toISOString() });
  await run(w);
  assert.equal(text(w.datas.get("a")), "A1");
  const copies = [...w.metas.values()].filter((m) => m.id !== "a");
  assert.ok(copies.length >= 1 && copies.every((m) => m.id.startsWith("new-")), "extra file imported under a fresh id");
  assert.equal(w.metas.get("a").syncId, real);
});

await test("one bad note does not stop the rest, and its error is reported", async () => {
  const w = makeWorld();
  w.remoteFiles.set("BAD", { id: "BAD", name: "Bad.note", noteId: "bad", kind: "note", data: bytes("CORRUPT"), modifiedTime: new Date(w.tick()).toISOString() });
  w.remoteFiles.set("OK", { id: "OK", name: "Good.note", noteId: "good", kind: "note", data: bytes("fine"), modifiedTime: new Date(w.tick()).toISOString() });
  await w.addLocal("a", "Alpha", "A1");
  const r = await run(w);
  assert.equal(r.imported, 1); assert.equal(r.uploaded, 1);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /Bad\.note/);
  assert.ok(w.metas.has("good") && !w.metas.has("bad"));
});

await test("an auth/list failure aborts the round without touching anything", async () => {
  const w = makeWorld(); await w.addLocal("a", "Alpha", "A1");
  w.failList = true;
  await assert.rejects(run(w), /session expired/);
  assert.equal(w.remoteFiles.size, 0); assert.equal(w.metas.get("a").syncId, undefined);
});

// ------------------------------------------------------------------ notebooks (folders)
console.log("notebooks");
const folderOf = (w, id) => [...w.remoteFiles.values()].find((f) => f.noteId === id);

await test("a notebook becomes a Drive folder, its note goes inside, and a second sync is quiet", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "Physics"); await w.addLocal("a", "Alpha", "A1", { parentId: "fa" }); await w.addLocal("b", "Beta", "B1");
  const r = await run(w);
  assert.deepEqual([r.folders, r.uploaded, r.errors.length], [1, 2, 0]);
  const dir = folderOf(w, "fa");
  assert.equal(dir.name, "Physics"); assert.equal(dir.parentId, "ROOT"); assert.equal(dir.mime, "application/vnd.google-apps.folder");
  assert.equal(folderOf(w, "a").parentId, dir.id, "the note is inside the notebook's folder");
  assert.equal(folderOf(w, "b").parentId, "ROOT");
  assert.equal(w.metas.get("fa").syncId, dir.id); assert.equal(w.metas.get("a").syncParent, dir.id);
  const again = await run(w);
  assert.deepEqual([again.folders, again.uploaded, again.pulled, again.moved, again.errors.length], [0, 0, 0, 0, 0]);
});

await test("notebooks nest: the Drive folders mirror the tree, parents created before children", async () => {
  const w = makeWorld();
  await w.addLocalFolder("child", "Lab", "top"); await w.addLocalFolder("top", "Physics"); await w.addLocal("n", "Note", "N1", { parentId: "child" }); // the child is listed before its parent on purpose
  const r = await run(w);
  assert.deepEqual([r.folders, r.errors.length], [2, 0]);
  const top = folderOf(w, "top"), child = folderOf(w, "child");
  assert.equal(top.parentId, "ROOT"); assert.equal(child.parentId, top.id); assert.equal(folderOf(w, "n").parentId, child.id);
});

await test("moving a note to another notebook moves the same Drive file (no copy)", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocalFolder("fb", "B"); await w.addLocal("n", "Note", "N1", { parentId: "fa" });
  await run(w);
  const id = w.metas.get("n").syncId;
  await w.local.update("n", { parentId: "fb", modified: w.tick() });
  const r = await run(w);
  assert.equal(r.moved, 1); assert.equal(r.errors.length, 0);
  assert.equal(w.metas.get("n").syncId, id, "same file");
  assert.equal(w.remoteFiles.get(id).parentId, folderOf(w, "fb").id);
  assert.equal([...w.remoteFiles.values()].filter((f) => !f.mime).length, 1);
  assert.equal((await run(w)).moved, 0);
});

await test("renaming and moving a notebook updates its Drive folder in place", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocalFolder("fb", "B"); await w.addLocal("n", "Note", "N1", { parentId: "fa" });
  await run(w);
  const dirA = folderOf(w, "fa").id;
  await w.local.update("fa", { title: "A renamed", parentId: "fb", modified: w.tick() });
  const r = await run(w);
  assert.equal(r.errors.length, 0);
  assert.equal(folderOf(w, "fa").id, dirA); assert.equal(folderOf(w, "fa").name, "A renamed"); assert.equal(folderOf(w, "fa").parentId, folderOf(w, "fb").id);
  assert.equal(folderOf(w, "n").parentId, dirA, "its note stays inside it");
});

await test("a notebook made on another device arrives with its notes in the right place", async () => {
  const w = makeWorld();
  w.addRemoteFolder("RD", "From phone", "ROOT", "phone-nb"); w.addRemoteFolder("RS", "Sub", "RD", "phone-sub");
  w.addRemoteNote("RN", "Deep.note", "D1", "RS", "deep"); w.addRemoteNote("RT", "Top.note", "T1", "ROOT", "top");
  const r = await run(w);
  assert.deepEqual([r.folders, r.imported, r.errors.length], [2, 2, 0]);
  assert.equal(w.metas.get("phone-nb").kind, "folder"); assert.equal(w.metas.get("phone-nb").title, "From phone"); assert.equal(w.metas.get("phone-nb").parentId, undefined);
  assert.equal(w.metas.get("phone-sub").parentId, "phone-nb");
  assert.equal(w.metas.get("deep").parentId, "phone-sub"); assert.equal(w.metas.get("top").parentId, undefined);
  assert.deepEqual([...await run(w).then((x) => [x.folders, x.imported, x.pulled, x.uploaded])], [0, 0, 0, 0]);
});

await test("a note moved in Drive follows locally without downloading it again", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocal("n", "Note", "N1");
  await run(w);
  let downloads = 0; const real = w.remote.download; w.remote.download = async (id) => { downloads++; return real(id); };
  w.remoteFiles.get(w.metas.get("n").syncId).parentId = folderOf(w, "fa").id; // moved in drive.google.com (content and modifiedTime untouched)
  const r = await run(w);
  assert.equal(r.moved, 1); assert.equal(downloads, 0);
  assert.equal(w.metas.get("n").parentId, "fa");
  assert.equal((await run(w)).moved, 0);
});

await test("a note edited AND moved in Drive is pulled and moved", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocal("n", "Note", "N1");
  await run(w);
  const id = w.metas.get("n").syncId;
  w.editRemote(id, "N-remote"); w.remoteFiles.get(id).parentId = folderOf(w, "fa").id;
  const r = await run(w);
  assert.deepEqual([r.pulled, r.moved], [1, 1]);
  assert.equal(text(w.datas.get("n")), "N-remote"); assert.equal(w.metas.get("n").parentId, "fa");
});

await test("trashing a notebook here trashes its Drive folder; restoring it re-creates it and puts the notes back", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocal("n", "Note", "N1", { parentId: "fa" });
  await run(w);
  const dir = folderOf(w, "fa");
  await w.local.update("fa", { trashed: true }); await w.local.update("n", { trashed: true });
  const r = await run(w);
  assert.ok(r.trashedRemote >= 1);
  assert.equal(dir.trashed, true); assert.equal(folderOf(w, "n").trashed ?? false, true);
  assert.equal(w.metas.get("fa").syncId, undefined);
  await w.local.update("fa", { trashed: false, modified: w.tick() }); await w.local.update("n", { trashed: false, modified: w.tick() });
  const back = await run(w);
  assert.equal(back.errors.length, 0);
  const fresh = [...w.remoteFiles.values()].filter((f) => f.noteId === "fa" && !f.trashed);
  assert.equal(fresh.length, 1);
  assert.equal([...w.remoteFiles.values()].find((f) => f.noteId === "n" && !f.trashed).parentId, fresh[0].id);
});

await test("a notebook trashed in Drive goes to the app's Trash with its notes (never deleted)", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocal("n", "Note", "N1", { parentId: "fa" }); await w.addLocal("keep", "Keep", "K1");
  await run(w);
  await w.remote.trash(folderOf(w, "fa").id); // Drive hides the notebook and everything inside
  const r = await run(w);
  assert.equal(r.errors.length, 0);
  assert.equal(w.metas.get("fa").trashed, true); assert.equal(w.metas.get("n").trashed, true);
  assert.equal(w.metas.get("keep").trashed, false);
  assert.equal(w.metas.has("fa") && w.datas.has("n"), true, "still in the library, in the Trash");
});

await test("a note edited here inside a notebook that was trashed in Drive is rescued to the top level", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocal("n", "Note", "N1", { parentId: "fa" });
  await run(w);
  await w.remote.trash(folderOf(w, "fa").id);
  await w.editLocal("n", "N-edited");
  const r = await run(w);
  assert.equal(r.errors.length, 0);
  assert.equal(w.metas.get("fa").trashed, true); assert.equal(w.metas.get("n").trashed, false);
  const fresh = [...w.remoteFiles.values()].filter((f) => f.noteId === "n").at(-1); // the old file is still under the trashed folder
  assert.equal(fresh.parentId, "ROOT", "re-uploaded at the root of the Drive folder");
  assert.equal(text(fresh.data), "N-edited");
});

await test("a Drive move that would put a notebook inside itself is ignored", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A"); await w.addLocalFolder("fb", "B", "fa");
  await run(w);
  folderOf(w, "fa").parentId = folderOf(w, "fb").id; // A into its own child, from another device
  folderOf(w, "fa").modifiedTime = new Date(w.tick()).toISOString();
  const r = await run(w);
  assert.equal(r.errors.length, 0);
  assert.equal(w.metas.get("fa").parentId, undefined, "A stays at the top level");
});

await test("deleting a notebook forever here trashes the Drive folder once (tombstone) and never re-imports it", async () => {
  const w = makeWorld();
  await w.addLocalFolder("fa", "A");
  await run(w);
  const dirId = w.metas.get("fa").syncId;
  w.metas.delete("fa"); w.hooks.tombstones.add(dirId);
  const r = await run(w);
  assert.equal(r.trashedRemote, 1); assert.equal(w.remoteFiles.get(dirId).trashed, true);
  assert.equal(w.metas.has("fa"), false);
});

await test("a note whose notebook failed to sync is reported, the rest still sync", async () => {
  const w = makeWorld();
  const real = w.remote.createFolder; w.remote.createFolder = async () => { throw new Error("Drive 500"); };
  await w.addLocalFolder("fa", "A"); await w.addLocal("n", "Note", "N1", { parentId: "fa" }); await w.addLocal("ok", "Ok", "O1");
  const r = await run(w);
  assert.equal(r.errors.length, 2); assert.equal(r.uploaded, 1);
  assert.ok(folderOf(w, "ok") && !folderOf(w, "n"));
  w.remote.createFolder = real;
  const again = await run(w);
  assert.equal(again.errors.length, 0); assert.equal(folderOf(w, "n").parentId, folderOf(w, "fa").id);
});

// ------------------------------------------------------------------ the real Drive adapter against a fake REST server
console.log("Drive adapter (fake REST)");

function fakeDrive() {
  const files = new Map(); // id -> {id,name,mimeType,parents,appProperties,modifiedTime,data}
  const log = [];
  let n = 1, clock = 5_000_000, status401 = false;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const pub = ({ data, ...f }) => f;
  let url;
  const moveParams = (f) => { const add = url.searchParams.get("addParents"), rem = url.searchParams.get("removeParents"); if (add) f.parents = [...(f.parents || []).filter((p) => p !== rem), add]; };
  const handler = async (input, init = {}) => {
    url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    log.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: init.headers });
    if (status401) return new Response("expired", { status: 401 });
    const upload = url.pathname.startsWith("/upload/drive/v3/files");
    const m = url.pathname.match(/\/files(?:\/([^/]+))?$/);
    const id = m?.[1];
    if (!upload && method === "GET" && id) {
      const f = files.get(id);
      if (!f) return new Response("not found", { status: 404 });
      if (url.searchParams.get("alt") === "media") return new Response(f.data);
      return json(pub(f));
    }
    if (!upload && method === "GET") {
      const q = url.searchParams.get("q");
      let list = [...files.values()];
      const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((x) => x[1]);
      if (parents.length) list = list.filter((f) => f.parents?.some((p) => parents.includes(p)));
      if (q.includes("application/vnd.google-apps.folder")) list = list.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
      if (q.includes("trashed = false")) list = list.filter((f) => !f.trashed);
      const size = Number(url.searchParams.get("pageSize")) || 100;
      const start = Number(url.searchParams.get("pageToken") || 0);
      const page = list.slice(start, start + size);
      return json({ files: page.map(pub), ...(start + size < list.length ? { nextPageToken: String(start + size) } : {}) });
    }
    if (!upload && method === "PATCH" && id) {
      const f = files.get(id);
      if (!f) return new Response("not found", { status: 404 });
      Object.assign(f, JSON.parse(init.body));
      moveParams(f);
      return json(pub(f));
    }
    if (!upload && method === "POST") {
      const meta = JSON.parse(init.body);
      const f = { id: `D${n++}`, trashed: false, modifiedTime: new Date(clock += 1000).toISOString(), ...meta };
      files.set(f.id, f);
      return json(pub(f));
    }
    if (upload) {
      const body = Buffer.from(init.body);
      const boundary = /boundary=(.+)$/.exec(init.headers["Content-Type"])[1];
      const parts = body.toString("latin1").split(`--${boundary}`).filter((p) => p.trim() && p.trim() !== "--");
      const meta = JSON.parse(parts[0].split("\r\n\r\n")[1].replace(/\r\n$/, ""));
      const data = Buffer.from(parts[1].split("\r\n\r\n")[1].replace(/\r\n$/, ""), "latin1");
      let f;
      if (method === "PATCH") { f = files.get(id); if (!f) return new Response("nf", { status: 404 }); Object.assign(f, meta); moveParams(f); }
      else { f = { id: `D${n++}`, trashed: false, ...meta }; files.set(f.id, f); }
      f.data = new Uint8Array(data); f.modifiedTime = new Date(clock += 1000).toISOString();
      return json(pub(f));
    }
    return new Response("unhandled", { status: 500 });
  };
  return { files, log, handler, set expired(v) { status401 = v; } };
}

function newService(drive) {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.window = { location: { origin: "http://localhost:1420" } };
  globalThis.fetch = drive.handler;
  const svc = new GoogleDriveService();
  return { svc, store };
}
async function connected(drive) {
  const { svc, store } = newService(drive);
  globalThis.fetch = async (u, i) => (String(u).includes("userinfo") ? new Response(JSON.stringify({ name: "T", email: "t@x" })) : drive.handler(u, i));
  await svc.setAccessToken("tok");
  globalThis.fetch = drive.handler;
  return { svc, store };
}

await test("creates the StarNote folder once and uploads into it with appProperties", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  assert.deepEqual(await r.list(), []);
  const f = await r.upload({ name: "Alpha.note", data: bytes("A1\r\nA2 \x00\xff"), noteId: "a", kind: "pdf", parentId: root });
  assert.equal(f.noteId, "a"); assert.equal(f.kind, "pdf"); assert.ok(f.modifiedTime);
  const folders = [...d.files.values()].filter((x) => x.mimeType === "application/vnd.google-apps.folder");
  assert.equal(folders.length, 1); assert.equal(folders[0].name, "StarNote");
  const stored = d.files.get(f.id);
  assert.deepEqual(stored.parents, [folders[0].id]);
  assert.deepEqual(stored.appProperties, { starnoteId: "a", kind: "pdf" });
  assert.deepEqual([...stored.data], [...bytes("A1\r\nA2 \x00\xff")]); // binary-safe
  await r.list(); await r.upload({ name: "B.note", data: bytes("B"), noteId: "b", kind: "note", parentId: root });
  assert.equal([...d.files.values()].filter((x) => x.mimeType === "application/vnd.google-apps.folder").length, 1);
});

await test("updating an existing file uses PATCH and does not move it", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  const f = await r.upload({ name: "A.note", data: bytes("1"), noteId: "a", kind: "note", parentId: root });
  const f2 = await r.upload({ name: "A renamed.note", data: bytes("22"), fileId: f.id, noteId: "a", kind: "note", parentId: root });
  assert.equal(f2.id, f.id); assert.equal(f2.name, "A renamed.note"); assert.notEqual(f2.modifiedTime, f.modifiedTime);
  const patch = d.log.filter((x) => x.method === "PATCH");
  assert.equal(patch.length, 1); assert.ok(patch[0].path.endsWith(`/${f.id}`));
  assert.equal(d.files.get(f.id).parents.length, 1);
  assert.equal(text(await r.download(f.id)), "22");
});

await test("list pages through more than one page of files", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  for (let i = 0; i < 5; i++) await r.upload({ name: `N${i}.note`, data: bytes("x"), noteId: `n${i}`, kind: "note", parentId: root });
  const folder = [...d.files.values()].find((x) => x.mimeType.endsWith("folder")).id;
  // Force tiny pages to prove the loop follows nextPageToken
  const real = d.handler;
  globalThis.fetch = (u, i) => { const url = new URL(u); if (url.searchParams.has("pageSize") && url.searchParams.get("q")?.includes(folder)) url.searchParams.set("pageSize", "2"); return real(url.toString(), i); };
  const all = await r.list();
  assert.equal(all.length, 5);
  assert.ok(d.log.filter((x) => x.query.q?.includes(`'${folder}' in parents`)).length >= 3);
});

await test("a deleted/trashed folder is recreated instead of failing", async () => {
  const d = fakeDrive(); const { svc, store } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  await r.list();
  const folderId = store.get("starnote_gdrive_sync_folder");
  d.files.delete(folderId);                 // user deleted it in Drive
  assert.deepEqual(await r.list(), []);
  assert.notEqual(store.get("starnote_gdrive_sync_folder"), folderId);
});

await test("trash() PATCHes trashed:true (never DELETE), hides the file from list, and tolerates a missing file", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  const f = await r.upload({ name: "A.note", data: bytes("1"), noteId: "a", kind: "note", parentId: root });
  await r.trash(f.id);
  assert.equal(d.files.get(f.id).trashed, true);
  assert.ok(d.files.has(f.id), "still exists in Drive (trash), not erased");
  assert.deepEqual(await r.list(), []);
  assert.ok(!d.log.some((x) => x.method === "DELETE"), "no DELETE call was ever made");
  const p = d.log.filter((x) => x.method === "PATCH" && x.path.endsWith(`/${f.id}`) && !x.path.includes("upload")).at(-1);
  assert.ok(p);
  await r.trash("does-not-exist"); // 404 is fine
});

await test("notebooks on Drive: folders are created with appProperties, listing walks the whole tree, parents are reported", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  const top = await r.createFolder({ name: "Physics", noteId: "n-top", parentId: root });
  const sub = await r.createFolder({ name: "Lab", noteId: "n-sub", parentId: top.id });
  await r.upload({ name: "Deep.note", data: bytes("D"), noteId: "deep", kind: "note", parentId: sub.id });
  await r.upload({ name: "Top.note", data: bytes("T"), noteId: "t", kind: "note", parentId: root });
  assert.deepEqual(d.files.get(top.id).appProperties, { starnoteId: "n-top", kind: "folder" });
  assert.deepEqual(d.files.get(top.id).parents, [root]);
  const all = await r.list();
  assert.equal(all.length, 4);
  assert.equal(all.find((f) => f.name === "Deep.note").parentId, sub.id);
  assert.equal(all.find((f) => f.name === "Lab").parentId, top.id);
  assert.equal(all.find((f) => f.name === "Top.note").parentId, root);
  assert.ok(all.filter((f) => f.mime === "application/vnd.google-apps.folder").length === 2);
});

await test("update() renames and moves a folder with addParents/removeParents (never a copy); upload() moves a file the same way", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  const a = await r.createFolder({ name: "A", noteId: "a", parentId: root });
  const b = await r.createFolder({ name: "B", noteId: "b", parentId: root });
  const moved = await r.update(a.id, { name: "A2", parentId: b.id, fromParentId: root });
  assert.equal(moved.name, "A2"); assert.equal(moved.parentId, b.id);
  const call = d.log.filter((x) => x.method === "PATCH").at(-1);
  assert.equal(call.query.addParents, b.id); assert.equal(call.query.removeParents, root);
  const f = await r.upload({ name: "N.note", data: bytes("1"), noteId: "n", kind: "note", parentId: root });
  const f2 = await r.upload({ name: "N.note", data: bytes("2"), fileId: f.id, noteId: "n", kind: "note", parentId: a.id, fromParentId: root });
  assert.equal(f2.id, f.id); assert.equal(f2.parentId, a.id);
  assert.deepEqual(d.files.get(f.id).parents, [a.id]);
  const noMove = await r.update(a.id, { name: "A3" });
  assert.equal(noMove.parentId, b.id);
  assert.equal(d.log.filter((x) => x.method === "PATCH").at(-1).query.addParents, undefined, "a rename alone does not touch parents");
});

await test("an expired token logs out and reports a clear message", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote(); const root = await r.rootId();
  await r.list();
  d.expired = true;
  await assert.rejects(r.list(), /session expired/i);
  assert.equal(svc.isConnected(), false);
});

await test("a local edit right after a pull still uploads even if this clock is behind Drive's", async () => {
  const w = makeWorld();
  // Drive's timestamps are far in the FUTURE relative to the local clock
  w.remoteFiles.set("R1", { id: "R1", name: "Skew.note", noteId: "s1", kind: "note", data: bytes("S1"), modifiedTime: new Date(w.tick() + 3_600_000).toISOString() });
  await run(w);
  await w.editLocal("s1", "S2");              // edit with the (behind) local clock
  const r = await run(w);
  assert.equal(r.uploaded, 1, "edit was uploaded despite clock skew");
  assert.equal(text(w.remoteFiles.get("R1").data), "S2");
});

await test("engine + adapter together: two devices converge", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const remote = svc.syncRemote();
  const mkLocal = () => {
    const metas = new Map(), datas = new Map();
    return { metas, datas, local: {
      list: async () => [...metas.values()].map((m) => ({ ...m })), getBytes: async (id) => datas.get(id)?.slice(),
      create: async (i, b) => { metas.set(i.id, { ...i }); datas.set(i.id, b.slice()); },
      update: async (id, f, b) => { if (!metas.has(id)) return false; metas.set(id, { ...metas.get(id), ...f }); if (b) datas.set(id, b.slice()); return true; } } };
  };
  let t0 = Date.now();
  const hooks = { isBusy: () => false, tombstones: new Set(), inspect: async () => ({}), newId: () => "x" + Math.random(), now: () => (t0 += 10) };
  const A = mkLocal(), B = mkLocal();
  await A.local.create({ id: "n1", title: "Shared", kind: "note", created: 1, modified: t0, trashed: false }, bytes("v1"));
  await syncLibrary(remote, A.local, hooks);          // device A uploads
  await syncLibrary(remote, B.local, hooks);          // device B downloads
  assert.equal(text(B.datas.get("n1")), "v1");
  await B.local.update("n1", { modified: t0 + 1000 }, bytes("v2-from-B"));
  await syncLibrary(remote, B.local, hooks);          // B uploads edit
  await syncLibrary(remote, A.local, hooks);          // A pulls it
  assert.equal(text(A.datas.get("n1")), "v2-from-B");
  assert.equal([...d.files.values()].filter((f) => f.appProperties).length, 1); // still ONE file in Drive
  // deletion travels too: A trashes it -> Drive trash -> B's copy goes to B's Trash
  await A.local.update("n1", { trashed: true, modified: t0 + 5000 });
  await syncLibrary(remote, A.local, hooks);
  await syncLibrary(remote, B.local, hooks);
  assert.equal(B.metas.get("n1").trashed, true);
  assert.equal(text(B.datas.get("n1")), "v2-from-B", "B keeps the data in its Trash");
});

console.log(`\n${passed} tests passed`);
