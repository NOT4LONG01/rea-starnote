// Tests the REAL src/zotero.ts against an in-memory fake of the Zotero Web API v3 and its file-storage server.
// Run: node test-zotero.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), "sn-zot-"));
writeFileSync(join(out, "entry.ts"), `export * from ${JSON.stringify(join(here, "src/zotero.ts"))};`);

// --- browser globals the client touches
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

await build({ entryPoints: [join(out, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(out, "bundle.mjs"), logLevel: "error" });
const { ZoteroClient, md5 } = await import(pathToFileURL(join(out, "bundle.mjs")).href);

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const bytes = (s) => new TextEncoder().encode(s);
const hex = (u8) => createHash("md5").update(u8).digest("hex");

// ------------------------------------------------------------------ fake Zotero
const UID = 12345;
function fakeZotero() {
  const items = new Map(); // key -> {key, data, meta, file?}
  const files = new Map(); // key -> Uint8Array (stored)
  const uploads = new Map(); // uploadKey -> {key, md5, size, filename}
  const log = [];
  const tokens = new Set();
  let n = 1;
  const add = (key, data, meta = {}, file) => { items.set(key, { key, data, meta, version: 1 }); if (file) files.set(key, file); };
  const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...h } });

  const handler = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "GET").toUpperCase();
    const hdr = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    log.push({ method, host: url.host, path: url.pathname, query: Object.fromEntries(url.searchParams), hdr, body: init.body });

    if (url.host === "storage.test") { // Zotero's file storage (S3-like)
      const m = url.pathname.match(/\/up\/(.+)$/);
      const body = Buffer.from(init.body);
      const boundaryPrefix = Buffer.from(uploads.get(m[1])?.prefix ?? "");
      const suffix = Buffer.from(uploads.get(m[1])?.suffix ?? "");
      if (!body.subarray(0, boundaryPrefix.length).equals(boundaryPrefix) || !body.subarray(body.length - suffix.length).equals(suffix)) return new Response("bad framing", { status: 400 });
      uploads.get(m[1]).data = new Uint8Array(body.subarray(boundaryPrefix.length, body.length - suffix.length));
      return new Response("", { status: 201 });
    }

    const key = hdr["zotero-api-key"];
    if (url.pathname === "/keys/current") {
      if (key === "GOODKEY" || key === "READONLY") {
        const w = key === "GOODKEY";
        return json({ key, userID: UID, username: "tester", access: { user: { library: true, files: w, notes: true, write: w } } });
      }
      return new Response("Forbidden", { status: 403 });
    }
    if (key !== "GOODKEY" && key !== "READONLY") return new Response("Forbidden", { status: 403 });
    const m = url.pathname.match(new RegExp(`^/users/${UID}(/.*)$`));
    if (!m) return new Response("nf", { status: 404 });
    const p = m[1];

    if (p === "/collections") {
      const all = [...Array(130)].map((_, i) => ({ key: `C${String(i).padStart(3, "0")}`, data: { name: `Coll ${i}`, parentCollection: i % 10 === 0 ? false : "C000" } }));
      const start = Number(url.searchParams.get("start") || 0), limit = Number(url.searchParams.get("limit") || 25);
      return json(all.slice(start, start + limit));
    }
    let mm;
    if ((mm = p.match(/^(?:\/collections\/([^/]+))?\/items\/top$/))) {
      let list = [...items.values()].filter((i) => !i.data.parentItem);
      if (mm[1]) list = list.filter((i) => (i.data.collections || []).includes(mm[1]));
      const q = url.searchParams.get("q");
      if (q) list = list.filter((i) => (i.data.title || "").toLowerCase().includes(q.toLowerCase()));
      const start = Number(url.searchParams.get("start") || 0), limit = Number(url.searchParams.get("limit") || 25);
      return json(list.slice(start, start + limit), 200, { "Total-Results": String(list.length) });
    }
    if ((mm = p.match(/^\/items\/([^/]+)\/children$/))) return json([...items.values()].filter((i) => i.data.parentItem === mm[1]));
    if (method === "GET" && (mm = p.match(/^\/items\/([^/]+)\/file$/))) {
      const f = files.get(mm[1]);
      return f ? new Response(f, { status: 200, headers: { "Content-Type": "application/pdf" } }) : new Response("nf", { status: 404 });
    }
    if (method === "POST" && p === "/items") {
      if (key === "READONLY") return new Response("Forbidden", { status: 403 });
      const tok = hdr["zotero-write-token"];
      if (!tok || !/^[0-9a-f]{32}$/.test(tok) || tokens.has(tok)) return new Response("bad write token", { status: 400 });
      tokens.add(tok);
      const body = JSON.parse(init.body);
      const k = `NEW${n++}AAAA`.slice(0, 8);
      add(k, { ...body[0], version: 0 }, {});
      return json({ success: { 0: k }, successful: { 0: { key: k, data: body[0] } }, unchanged: {}, failed: {} });
    }
    if (method === "POST" && (mm = p.match(/^\/items\/([^/]+)\/file$/))) {
      const k = mm[1];
      if (!items.has(k)) return new Response("nf", { status: 404 });
      if (hdr["if-none-match"] !== "*") return new Response("precondition required", { status: 428 });
      const form = new URLSearchParams(init.body);
      if (form.has("upload")) { // register
        const u = uploads.get(form.get("upload"));
        if (!u?.data || hex(u.data) !== u.md5 || u.data.length !== u.size) return new Response("md5 mismatch", { status: 400 });
        files.set(k, u.data); items.get(k).data.md5 = u.md5;
        return new Response(null, { status: 204 });
      }
      const m5 = form.get("md5");
      if (!/^[0-9a-f]{32}$/.test(m5 || "")) return new Response("bad md5", { status: 400 });
      for (const f of files.values()) if (hex(f) === m5) { items.get(k).data.md5 = m5; return json({ exists: 1 }); }
      const uk = `UK${n++}`;
      uploads.set(k, { prefix: "--BOUND\r\nContent-Disposition: form-data; name=\"key\"\r\n\r\nabc\r\n--BOUND\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\n", suffix: "\r\n--BOUND--", md5: m5, size: Number(form.get("filesize")), filename: form.get("filename"), uploadKey: uk });
      uploads.set(uk, uploads.get(k)); // register looks the upload up by uploadKey
      return json({ url: `https://storage.test/up/${k}`, contentType: "multipart/form-data; boundary=BOUND", prefix: uploads.get(k).prefix, suffix: uploads.get(k).suffix, uploadKey: uk });
    }
    return new Response("unhandled " + method + " " + p, { status: 500 });
  };
  return { items, files, uploads, log, handler, add };
}

function world() {
  const z = fakeZotero();
  store.clear();
  globalThis.fetch = z.handler;
  const pdf = bytes("%PDF-1.4 fake-a\n" + "x".repeat(500));
  z.add("PAPER001", { itemType: "journalArticle", title: "Quantum Error Correction Review", collections: ["C001"] }, { creatorSummary: "Gong et al.", parsedDate: "2024-05-01", numChildren: 3 });
  z.add("ATT00001", { itemType: "attachment", parentItem: "PAPER001", linkMode: "imported_file", contentType: "application/pdf", title: "Full Text PDF", filename: "gong2024.pdf", md5: hex(pdf), mtime: 1 }, {}, pdf);
  // an imported_file whose file never reached Zotero's cloud (file sync off): real Zotero omits md5 and /file answers 404
  z.add("ATT00004", { itemType: "attachment", parentItem: "PAPER001", linkMode: "imported_file", contentType: "application/pdf", title: "Local-only PDF", filename: "local.pdf" });
  z.add("ATT00002", { itemType: "attachment", parentItem: "PAPER001", linkMode: "linked_file", contentType: "application/pdf", title: "Linked (local path)", filename: "x.pdf" });
  z.add("ATT00003", { itemType: "attachment", parentItem: "PAPER001", linkMode: "imported_url", contentType: "text/html", title: "Snapshot", filename: "s.html" });
  z.add("NOTE0001", { itemType: "note", title: "ignore me" });
  z.add("BOOK0001", { itemType: "book", title: "Notes on Surface Codes" }, { creatorSummary: "Fowler", parsedDate: "2012", numChildren: 0 });
  z.add("LONEPDF1", { itemType: "attachment", linkMode: "imported_file", contentType: "application/pdf", title: "standalone.pdf", filename: "standalone.pdf", md5: hex(bytes("%PDF-1.4 standalone")), mtime: 1 }, {}, bytes("%PDF-1.4 standalone"));
  return { z, pdf, client: new ZoteroClient() };
}

console.log("md5");
await test("md5 matches Node's crypto for edge sizes and random data", async () => {
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 65536, 300001]) {
    const b = new Uint8Array(randomBytes(n));
    assert.equal(md5(b), hex(b), `size ${n}`);
  }
  assert.equal(md5(bytes("")), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5(bytes("The quick brown fox jumps over the lazy dog")), "9e107d9d372bb6826bd81d3542a419d6");
});

console.log("connect");
await test("a valid key finds the user id and reports permissions; it is remembered", async () => {
  const { client } = world();
  assert.equal(client.isConnected(), false);
  const info = await client.connect("  GOODKEY ");
  assert.deepEqual([info.userID, info.username, info.canRead, info.canWrite, info.canFiles], [12345, "tester", true, true, true]);
  assert.equal(client.isConnected(), true);
  assert.equal(new ZoteroClient().isConnected(), true, "survives a reload (localStorage)");
});
await test("a read-only key is detected; an unknown key is rejected with a clear message and stores nothing", async () => {
  let { client } = world();
  assert.equal((await client.connect("READONLY")).canWrite, false);
  ({ client } = world());
  await assert.rejects(client.connect("WRONG"), /does not recognise that API key/);
  assert.equal(client.isConnected(), false); assert.equal(store.size, 0);
  await assert.rejects(client.connect("   "), /Paste your Zotero API key/);
});
await test("disconnect forgets the key", async () => {
  const { client } = world(); await client.connect("GOODKEY"); client.disconnect();
  assert.equal(client.isConnected(), false); assert.equal(store.size, 0);
});

console.log("browse");
await test("collections are fetched across pages (130 -> 130) with parents", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  const cols = await client.listCollections();
  assert.equal(cols.length, 130); assert.equal(cols[0].parent, null); assert.equal(cols[1].parent, "C000");
  assert.ok(z.log.filter((l) => l.path.endsWith("/collections")).length >= 2, "followed the pages");
});
await test("top-level items: notes hidden, summary + year + children count, total from the header", async () => {
  const { client } = world(); await client.connect("GOODKEY");
  const { items, total } = await client.listItems();
  assert.deepEqual(items.map((i) => i.key).sort(), ["BOOK0001", "LONEPDF1", "PAPER001"]);
  const paper = items.find((i) => i.key === "PAPER001");
  assert.deepEqual([paper.title, paper.creators, paper.year, paper.numChildren, paper.isPdfAttachment], ["Quantum Error Correction Review", "Gong et al.", "2024", 3, false]);
  assert.equal(items.find((i) => i.key === "LONEPDF1").isPdfAttachment, true);
  assert.equal(total, 4); // Zotero counts the note too; we only hide it from the list
});
await test("search and collection filters reach the API as q/qmode and the collection route", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  assert.deepEqual((await client.listItems({ query: "surface" })).items.map((i) => i.key), ["BOOK0001"]);
  const q = z.log.at(-1); assert.equal(q.query.q, "surface"); assert.equal(q.query.qmode, "titleCreatorYear");
  assert.deepEqual((await client.listItems({ collection: "C001" })).items.map((i) => i.key), ["PAPER001"]);
  assert.ok(z.log.at(-1).path.includes("/collections/C001/items/top"));
});
await test("only STORED pdf attachments are offered (not linked files, not html snapshots)", async () => {
  const { client } = world(); await client.connect("GOODKEY");
  const { items } = await client.listItems();
  const pdfs = await client.listPdfs(items.find((i) => i.key === "PAPER001"));
  assert.deepEqual(pdfs.map((p) => [p.key, p.filename, p.parentKey, p.stored]), [["ATT00001", "gong2024.pdf", "PAPER001", true], ["ATT00004", "local.pdf", "PAPER001", false]]);
  const lone = await client.listPdfs(items.find((i) => i.key === "LONEPDF1"));
  assert.deepEqual(lone.map((p) => [p.key, p.parentKey, p.stored]), [["LONEPDF1", null, true]]);
  assert.deepEqual(await client.listPdfs(items.find((i) => i.key === "BOOK0001")), []);
});
await test("downloadPdf returns the exact bytes", async () => {
  const { client, pdf } = world(); await client.connect("GOODKEY");
  assert.deepEqual([...new Uint8Array(await client.downloadPdf("ATT00001"))], [...pdf]);
});
await test("a PDF with no file in Zotero's cloud is flagged up front, and a 404 explains why (real-account finding)", async () => {
  const { client } = world(); await client.connect("GOODKEY");
  const { items } = await client.listItems();
  assert.equal(items.find((i) => i.key === "LONEPDF1").fileStored, true);
  const pdfs = await client.listPdfs(items.find((i) => i.key === "PAPER001"));
  assert.deepEqual(pdfs.map((p) => p.stored), [true, false]);
  await assert.rejects(client.downloadPdf("ATT00004"), /no stored copy of this PDF.*file syncing/);
  await assert.rejects(client.downloadPdf("NOPE0000"), /no stored copy/);
});

console.log("write back");
await test("uploadPdf runs the full flow: create child item -> authorize -> storage -> register; bytes and md5 survive", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  const data = new Uint8Array(randomBytes(70000)); // binary-safe, bigger than one chunk
  const { key } = await client.uploadPdf({ parentKey: "PAPER001", title: "Review (annotated)", filename: "Review (annotated).pdf", bytes: data });
  const item = z.items.get(key);
  assert.equal(item.data.parentItem, "PAPER001"); assert.equal(item.data.contentType, "application/pdf"); assert.equal(item.data.linkMode, "imported_file");
  assert.deepEqual([...z.files.get(key)], [...data]);
  assert.equal(item.data.md5, hex(data));
  const post = z.log.find((l) => l.method === "POST" && l.path.endsWith("/items"));
  assert.match(post.hdr["zotero-write-token"], /^[0-9a-f]{32}$/);
  const steps = z.log.filter((l) => l.method === "POST").map((l) => (l.host === "storage.test" ? "storage" : l.path.endsWith("/file") ? (new URLSearchParams(l.body).has("upload") ? "register" : "authorize") : "create"));
  assert.deepEqual(steps, ["create", "authorize", "storage", "register"]);
});
await test("a standalone PDF is uploaded as a top-level attachment (no parentItem)", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  const { key } = await client.uploadPdf({ parentKey: null, title: "t", filename: "t.pdf", bytes: bytes("%PDF-1.4 one") });
  assert.equal(z.items.get(key).data.parentItem, undefined);
});
await test("each upload uses a fresh write token, so two uploads create two attachments", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  const a = await client.uploadPdf({ parentKey: "PAPER001", title: "a", filename: "a.pdf", bytes: bytes("%PDF aaa") });
  const b = await client.uploadPdf({ parentKey: "PAPER001", title: "b", filename: "b.pdf", bytes: bytes("%PDF bbb") });
  assert.notEqual(a.key, b.key);
});
await test("a file Zotero already has (same md5) is not uploaded twice", async () => {
  const { client, z, pdf } = world(); await client.connect("GOODKEY");
  const before = z.log.filter((l) => l.host === "storage.test").length;
  await client.uploadPdf({ parentKey: "PAPER001", title: "dup", filename: "gong2024.pdf", bytes: pdf });
  assert.equal(z.log.filter((l) => l.host === "storage.test").length, before);
});
await test("a read-only key cannot write: clear message, nothing created", async () => {
  const { client, z } = world(); await client.connect("READONLY");
  const n = z.items.size;
  await assert.rejects(client.uploadPdf({ parentKey: null, title: "t", filename: "t.pdf", bytes: bytes("x") }), /may not do that \(403\)/);
  assert.equal(z.items.size, n);
});
await test("if file storage blocks the browser, the error names the orphan attachment so the user can delete it", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  const real = z.handler;
  globalThis.fetch = (u, i) => (String(u).includes("storage.test") ? Promise.reject(new TypeError("Failed to fetch")) : real(u, i));
  await assert.rejects(client.uploadPdf({ parentKey: "PAPER001", title: "My annotated", filename: "m.pdf", bytes: bytes("%PDF zzz") }), /could not be sent to Zotero's file storage.*"My annotated"/);
});
await test("a download blocked by CORS says so and suggests the fallbacks", async () => {
  const { client, z } = world(); await client.connect("GOODKEY");
  const real = z.handler;
  globalThis.fetch = (u, i) => (String(u).includes("/file") ? Promise.reject(new TypeError("Failed to fetch")) : real(u, i));
  await assert.rejects(client.downloadPdf("ATT00001"), /cross-origin block.*desktop app/);
});
await test("rate limiting (429) is reported with the wait Zotero asked for", async () => {
  const { client } = world(); await client.connect("GOODKEY");
  globalThis.fetch = async () => new Response("slow down", { status: 429, headers: { "Retry-After": "7" } });
  await assert.rejects(client.listCollections(), /rate-limiting.*7 seconds/);
});

console.log(`\n${passed} tests passed`);
