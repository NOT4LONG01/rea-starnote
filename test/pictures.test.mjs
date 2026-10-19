// Pictures in a .note (StarNote shape type 19, bytes in resource/data): the REAL loader + serializer on the real sample note.
// A picture added, saved and reloaded comes back where it was with the same bytes; moved, it stays one picture; deleted, its
// record and its file leave the archive, and everything else of the note stays. Run: node test/pictures.test.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-pictures-"));
writeFileSync(join(tmp, "entry.ts"), `
export * from ${JSON.stringify(join(here, "../src/model/note-loader.ts"))};
export * from ${JSON.stringify(join(here, "../src/model/note-serializer.ts"))};
export { default as JSZip } from ${JSON.stringify(join(here, "../node_modules/jszip"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error" });
const { loadStarNoteArchive, exportStarNoteArchive, JSZip } = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const sample = readFileSync(join(here, "../public/samples/test.note"));
const toAB = (u) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
const load = (bytes) => loadStarNoteArchive(toAB(bytes));
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]); // bytes are kept as they are
const pictures = (doc) => [...doc.tiles.values()].flatMap((t) => (t.images ?? []).map((i) => ({ ...i, tag: t.pageTag })));
const strokeCount = (doc) => [...doc.tiles.values()].reduce((k, t) => k + t.strokes.length, 0);
const fileNames = async (bytes) => Object.keys((await JSZip.loadAsync(bytes)).files);

const doc0 = await load(sample);
const tag = [...doc0.tiles.keys()][0];
const strokes0 = strokeCount(doc0);

let saved1;
await test("a new picture is saved as a type-19 record with its file in resource/data, and comes back where it was", async () => {
  const doc = await load(sample);
  const img = { tag, saved: false, shapeUuid: "pic-1", resId: "res-1", ext: "png", bytes: png, rect: { left: 100, top: 200, right: 500, bottom: 440 } };
  (doc.tiles.get(tag).images ??= []).push(img);
  doc.addedImages = [img];
  saved1 = await exportStarNoteArchive(doc, []);
  assert.ok((await fileNames(saved1)).includes(`${doc.uuid}/resource/data/res-1.png`), "the bytes are in resource/data");
  const back = await load(saved1);
  const got = pictures(back);
  assert.equal(got.length, 1);
  assert.deepEqual([got[0].tag, got[0].shapeUuid, got[0].resId, got[0].ext, got[0].rect], [tag, "pic-1", "res-1", "png", { left: 100, top: 200, right: 500, bottom: 440 }]);
  assert.deepEqual([...got[0].bytes], [...png]);
  assert.equal(strokeCount(back), strokes0, "the note's strokes are untouched");
});

let saved2;
await test("moving a saved picture (the old record out, a new one in) leaves one picture, at the new place, with its file", async () => {
  const doc = await load(saved1);
  const old = doc.tiles.get(tag).images[0];
  const moved = { ...old, saved: false, shapeUuid: "pic-2", rect: { left: 300, top: 600, right: 700, bottom: 840 } };
  doc.tiles.get(tag).images = [moved];
  doc.removedImages = [old];
  doc.addedImages = [moved];
  saved2 = await exportStarNoteArchive(doc, []);
  const got = pictures(await load(saved2));
  assert.deepEqual(got.map((p) => [p.shapeUuid, p.rect.left, p.rect.top]), [["pic-2", 300, 600]]);
  assert.deepEqual([...got[0].bytes], [...png], "the file survived the move");
});

await test("deleting a picture removes its record and its file; the rest of the note stays", async () => {
  const doc = await load(saved2);
  const old = doc.tiles.get(tag).images[0];
  doc.tiles.get(tag).images = [];
  doc.removedImages = [old];
  const saved3 = await exportStarNoteArchive(doc, []);
  const back = await load(saved3);
  assert.equal(pictures(back).length, 0);
  assert.ok(!(await fileNames(saved3)).some((n) => n.includes("/resource/data/res-1")), "the file is gone");
  assert.equal(strokeCount(back), strokes0);
});

console.log(`\n${passed} picture tests passed`);
