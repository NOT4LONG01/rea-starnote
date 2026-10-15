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
  const remote = {
    async list() {
      if (failList) throw new Error("Google Drive session expired.");
      return [...remoteFiles.values()].filter((f) => !f.trashed).map(({ data, ...f }) => f);
    },
    async trash(id) { const f = remoteFiles.get(id); if (f) f.trashed = true; },
    async upload({ name, data, fileId, noteId, kind }) {
      if (onUpload) await onUpload();
      let f = fileId ? remoteFiles.get(fileId) : undefined;
      if (fileId && !f) throw new Error("Drive 404");
      if (!f) { f = { id: `F${nextFile++}` }; remoteFiles.set(f.id, f); }
      Object.assign(f, { name, noteId, kind, data: data.slice(), modifiedTime: new Date(tick()).toISOString() });
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
    create: async (item, b) => { metas.set(item.id, { ...item }); datas.set(item.id, b.slice()); },
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
  const editLocal = async (id, content) => { await local.update(id, { modified: tick() }, bytes(content)); };
  const editRemote = (id, content, name) => {
    const f = remoteFiles.get(id);
    f.data = bytes(content); if (name) f.name = name; f.modifiedTime = new Date(tick()).toISOString();
  };
  return { remote, local, hooks, remoteFiles, metas, datas, addLocal, editLocal, editRemote, tick,
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

// ------------------------------------------------------------------ the real Drive adapter against a fake REST server
console.log("Drive adapter (fake REST)");

function fakeDrive() {
  const files = new Map(); // id -> {id,name,mimeType,parents,appProperties,modifiedTime,data}
  const log = [];
  let n = 1, clock = 5_000_000, status401 = false;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const pub = ({ data, ...f }) => f;
  const handler = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
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
      const parent = q.match(/'([^']+)' in parents/);
      if (parent) list = list.filter((f) => f.parents?.includes(parent[1]));
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
      if (method === "PATCH") { f = files.get(id); if (!f) return new Response("nf", { status: 404 }); Object.assign(f, meta); }
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
  const r = svc.syncRemote();
  assert.deepEqual(await r.list(), []);
  const f = await r.upload({ name: "Alpha.note", data: bytes("A1\r\nA2 \x00\xff"), noteId: "a", kind: "pdf" });
  assert.equal(f.noteId, "a"); assert.equal(f.kind, "pdf"); assert.ok(f.modifiedTime);
  const folders = [...d.files.values()].filter((x) => x.mimeType === "application/vnd.google-apps.folder");
  assert.equal(folders.length, 1); assert.equal(folders[0].name, "StarNote");
  const stored = d.files.get(f.id);
  assert.deepEqual(stored.parents, [folders[0].id]);
  assert.deepEqual(stored.appProperties, { starnoteId: "a", kind: "pdf" });
  assert.deepEqual([...stored.data], [...bytes("A1\r\nA2 \x00\xff")]); // binary-safe
  await r.list(); await r.upload({ name: "B.note", data: bytes("B"), noteId: "b", kind: "note" });
  assert.equal([...d.files.values()].filter((x) => x.mimeType === "application/vnd.google-apps.folder").length, 1);
});

await test("updating an existing file uses PATCH and does not move it", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote();
  const f = await r.upload({ name: "A.note", data: bytes("1"), noteId: "a", kind: "note" });
  const f2 = await r.upload({ name: "A renamed.note", data: bytes("22"), fileId: f.id, noteId: "a", kind: "note" });
  assert.equal(f2.id, f.id); assert.equal(f2.name, "A renamed.note"); assert.notEqual(f2.modifiedTime, f.modifiedTime);
  const patch = d.log.filter((x) => x.method === "PATCH");
  assert.equal(patch.length, 1); assert.ok(patch[0].path.endsWith(`/${f.id}`));
  assert.equal(d.files.get(f.id).parents.length, 1);
  assert.equal(text(await r.download(f.id)), "22");
});

await test("list pages through more than one page of files", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote();
  for (let i = 0; i < 5; i++) await r.upload({ name: `N${i}.note`, data: bytes("x"), noteId: `n${i}`, kind: "note" });
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
  const r = svc.syncRemote();
  await r.list();
  const folderId = store.get("starnote_gdrive_sync_folder");
  d.files.delete(folderId);                 // user deleted it in Drive
  assert.deepEqual(await r.list(), []);
  assert.notEqual(store.get("starnote_gdrive_sync_folder"), folderId);
});

await test("trash() PATCHes trashed:true (never DELETE), hides the file from list, and tolerates a missing file", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote();
  const f = await r.upload({ name: "A.note", data: bytes("1"), noteId: "a", kind: "note" });
  await r.trash(f.id);
  assert.equal(d.files.get(f.id).trashed, true);
  assert.ok(d.files.has(f.id), "still exists in Drive (trash), not erased");
  assert.deepEqual(await r.list(), []);
  assert.ok(!d.log.some((x) => x.method === "DELETE"), "no DELETE call was ever made");
  const p = d.log.filter((x) => x.method === "PATCH" && x.path.endsWith(`/${f.id}`) && !x.path.includes("upload")).at(-1);
  assert.ok(p);
  await r.trash("does-not-exist"); // 404 is fine
});

await test("an expired token logs out and reports a clear message", async () => {
  const d = fakeDrive(); const { svc } = await connected(d);
  const r = svc.syncRemote();
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
