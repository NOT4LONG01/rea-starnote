// Tests erasing strokes that are already SAVED in a .note: the REAL loader + serializer on the real sample note.
// Erased strokes must leave the point files and shape records; everything else must stay byte-identical.
// Run: node test-erase-saved.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-erase-"));
writeFileSync(join(tmp, "entry.ts"), `
export * from ${JSON.stringify(join(here, "src/note-loader.ts"))};
export * from ${JSON.stringify(join(here, "src/note-serializer.ts"))};
export * from ${JSON.stringify(join(here, "src/stroke-interpolator.ts"))};
export { default as JSZip } from ${JSON.stringify(join(here, "node_modules/jszip"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error" });
const m = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);
const { loadStarNoteArchive, exportStarNoteArchive, dropShapeRecords, parseStarNotePointsBinary, serializeStarNotePointsMultiSegment, JSZip } = m;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const sample = readFileSync(join(here, "../samples/test.note"));
const load = () => loadStarNoteArchive(sample.buffer.slice(sample.byteOffset, sample.byteOffset + sample.byteLength));
const dump = async (zip) => { // every file, with the shape zips opened up so records can be compared
  const out = new Map();
  for (const [name, f] of Object.entries(zip.files)) {
    if (f.dir) continue;
    const bytes = await f.async("uint8array");
    if (name.endsWith(".zip")) { const inner = await JSZip.loadAsync(bytes); const k = Object.keys(inner.files)[0]; out.set(name, await inner.file(k).async("uint8array")); }
    else out.set(name, bytes);
  }
  return out;
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const allStrokes = (doc) => [...doc.tiles.values()].flatMap((t) => t.strokes);
const erase = (doc, st) => { // what the canvas does
  const t = doc.tiles.get(st.src.tag); t.strokes = t.strokes.filter((x) => x !== st); (doc.removedStrokes ??= []).push(st);
};
const grepAll = async (zip, id) => { // live files (shape zips opened) mentioning an id; stash/ is StarNote's own history of replaced shapes
  const hits = [];
  for (const [n, b] of await dump(zip)) if (!n.includes("/stash/") && Buffer.from(b).includes(id)) hits.push(n);
  return hits;
};

await test("rewriting an untouched #points file reproduces the original bytes (serializer is faithful)", async () => {
  const doc = await load();
  let files = 0;
  for (const [name, f] of Object.entries(doc.rawZip.files)) {
    if (!name.endsWith("#points")) continue;
    const orig = await f.async("uint8array");
    const p = parseStarNotePointsBinary(orig);
    assert.ok(same(serializeStarNotePointsMultiSegment(p.pageTag, p.shapeUuid, p.segments, p.version), orig), `byte-identical: ${name}`);
    files++;
  }
  assert.ok(files > 3, `checked ${files} point files`);
});

await test("erasing a single-segment and a multi-segment saved stroke removes exactly those from the archive", async () => {
  const doc = await load();
  const before = await dump(doc.rawZip);
  const n0 = allStrokes(doc).length;
  const single = allStrokes(doc).find((s) => s.src.tag === "Page[0-0]" && s.parentUuid === "414c6fd3-6295-4d74-96ae-77ce718f11f5");
  const multi = allStrokes(doc).find((s) => s.parentUuid === "63952357-5828-4463-8110-fb984e0aab72"); // segment 1 of a 2-segment file
  assert.ok(single && multi && multi.src.seg === 1);
  // segment 0 of that file is a text-box anchor: not a stroke, so it must survive together with its shape record
  const sibling = { parentUuid: "200569b3-916c-417f-95d8-909124256fb1" };
  erase(doc, single); erase(doc, multi);

  const bytes = await exportStarNoteArchive(doc, []);
  assert.equal(doc.removedStrokes.length, 0, "queue is empty after the save");
  const reloaded = await loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(allStrokes(reloaded).length, n0 - 2);
  assert.ok(!allStrokes(reloaded).some((s) => s.parentUuid === single.parentUuid || s.parentUuid === multi.parentUuid));

  const after = await dump(reloaded.rawZip);
  assert.ok(!after.has(single.src.file), "single-segment point file deleted");
  assert.ok(after.has(multi.src.file), "multi-segment point file kept");
  const left = parseStarNotePointsBinary(after.get(multi.src.file));
  assert.deepEqual(left.segments.map((s) => s.parentUuid), [sibling.parentUuid]);
  for (const id of [single.parentUuid, multi.parentUuid]) assert.deepEqual(await grepAll(reloaded.rawZip, id), [], `id ${id} appears nowhere any more`);
  assert.ok((await grepAll(reloaded.rawZip, sibling.parentUuid)).length >= 2, "the surviving anchor keeps its point file and shape record(s)");

  // nothing else changed: same file list minus the deleted one, identical bytes except the files we edited
  const edited = new Set([single.src.file, multi.src.file]);
  for (const [name, b] of before) {
    if (name.includes("/note/pb/") || name.includes("/virtual/")) continue; // metadata is regenerated on every save
    if (name.includes("/shape/")) continue;                                  // checked record by record below
    if (edited.has(name)) continue;
    assert.ok(after.has(name), `kept ${name}`);
    assert.ok(same(after.get(name), b), `unchanged ${name}`);
  }
  // shape records: only the two erased ids are gone; every other record is preserved verbatim
  for (const [name, b] of before) {
    if (!name.includes("/shape/")) continue;
    const kept = dropShapeRecords(b, new Set([single.parentUuid, multi.parentUuid]));
    const now = after.get(name);
    if (kept.dropped === 0) assert.ok(!now || same(now, b), `shape zip untouched ${name}`);
    else assert.ok(!now || same(now, kept.out), `shape zip lost only the erased records ${name}`);
  }
  // every surviving stroke still points at a valid file + segment index
  for (const s of allStrokes(reloaded)) assert.ok(s.src.file && s.src.seg >= 0);
});

await test("erased strokes of an untouched note leave all other strokes with identical points", async () => {
  const doc = await load();
  const keep = allStrokes(doc).map((s) => s.parentUuid + JSON.stringify(s.points));
  const victim = allStrokes(doc)[2];
  erase(doc, victim);
  const bytes = await exportStarNoteArchive(doc, []);
  const re = await loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const now = allStrokes(re).map((s) => s.parentUuid + JSON.stringify(s.points));
  assert.deepEqual(now.sort(), keep.filter((k) => !k.startsWith(victim.parentUuid + JSON.stringify(victim.points))).sort());
});

await test("a stroke saved this session can be erased again; strokes left in a rewritten file are renumbered", async () => {
  const doc = await load();
  const s1 = { shapeUuid: "x", parentUuid: crypto.randomUUID(), color: "#ff0000", width: 4, durationMs: 100, points: [{ dt: 0, x: 100, y: 100, pressure: 30000 }, { dt: 10, x: 300, y: 300, pressure: 30000 }] };
  await exportStarNoteArchive(doc, [s1]);
  const saved = allStrokes(doc).find((s) => s.parentUuid === s1.parentUuid);
  assert.ok(saved?.src?.file, "a stroke saved this session knows its point file");

  // a hand-made 3-segment file A,B,C (as StarNote writes chained strokes)
  const seg = (id, x) => ({ parentUuid: id, totalDurationMs: 50, points: [{ dt: 0, x, y: 50, pressure: 20000 }, { dt: 5, x: x + 40, y: 90, pressure: 20000 }] });
  const [A, B, C] = [seg(crypto.randomUUID(), 500), seg(crypto.randomUUID(), 800), seg(crypto.randomUUID(), 1100)];
  const path = `${doc.uuid}/point/Page[0-0]/Page[0-0]#${crypto.randomUUID()}#points`;
  doc.rawZip.file(path, serializeStarNotePointsMultiSegment("Page[0-0]", crypto.randomUUID(), [A, B, C]));
  const bytes0 = await doc.rawZip.generateAsync({ type: "uint8array" });
  const d2 = await loadStarNoteArchive(bytes0.buffer.slice(bytes0.byteOffset, bytes0.byteOffset + bytes0.byteLength));
  const [a, b, c] = [A, B, C].map((x) => allStrokes(d2).find((s) => s.parentUuid === x.parentUuid));
  assert.deepEqual([a.src.seg, b.src.seg, c.src.seg], [0, 1, 2]);

  erase(d2, a);
  await exportStarNoteArchive(d2, []);
  assert.deepEqual([b.src.seg, c.src.seg], [0, 1], "survivors renumbered");
  erase(d2, c);                                   // erase using the renumbered index
  const out = await exportStarNoteArchive(d2, []);
  const re = await loadStarNoteArchive(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  const left = parseStarNotePointsBinary(await re.rawZip.file(path).async("uint8array"));
  assert.deepEqual(left.segments.map((x) => x.parentUuid), [B.parentUuid], "only B remains");
  assert.deepEqual(left.segments[0].points, B.points);

  erase(re, allStrokes(re).find((s) => s.parentUuid === B.parentUuid));
  erase(re, allStrokes(re).find((s) => s.parentUuid === s1.parentUuid)); // the one saved earlier
  const fin = await exportStarNoteArchive(re, []);
  const z = await JSZip.loadAsync(fin);
  assert.ok(!z.file(path), "emptied point file deleted");
  for (const id of [A.parentUuid, B.parentUuid, C.parentUuid, s1.parentUuid]) assert.deepEqual(await grepAll(z, id), []);
});

await test("pen look (opacity + pressure response) is saved in the shape record's brush JSON and survives a reload", async () => {
  const doc = await load();
  const hl = { shapeUuid: "x", parentUuid: crypto.randomUUID(), color: "#e6a817", width: 26, alpha: 0.35, sens: 0, durationMs: 50, points: [{ dt: 0, x: 200, y: 300, pressure: 20000 }, { dt: 9, x: 700, y: 300, pressure: 20000 }] };
  const bytes = await exportStarNoteArchive(doc, [hl]);
  const re = await loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const got = allStrokes(re).find((s) => s.parentUuid === hl.parentUuid);
  assert.ok(got);
  assert.equal(got.alpha, 0.35); assert.equal(got.sens, 0); assert.equal(got.color.toLowerCase(), "#e6a817");
  // the original strokes keep what StarNote wrote for them (alphaFactor 1, pressureSensitivity 0.375)
  const old = allStrokes(re).find((s) => s.parentUuid === "414c6fd3-6295-4d74-96ae-77ce718f11f5");
  assert.equal(old.alpha, 1); assert.equal(old.sens, 0.375);
  // the stroke that is exported again after a move/recolor (new object, same look) keeps it too
  const again = await exportStarNoteArchive(re, [{ ...got, parentUuid: crypto.randomUUID(), src: undefined }]);
  const re2 = await loadStarNoteArchive(again.buffer.slice(again.byteOffset, again.byteOffset + again.byteLength));
  assert.equal(allStrokes(re2).filter((s) => s.alpha === 0.35).length, 2);
});

const reload = async (bytes) => loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const addBox = (doc, tag, tb) => { const b = { saved: false, tag, isBold: false, isItalic: false, ...tb }; doc.tiles.get(tag).textBoxes.push(b); (doc.addedTextBoxes ??= []).push(b); return b; };
const dropBox = (doc, b) => { const t = doc.tiles.get(b.tag); t.textBoxes = t.textBoxes.filter((x) => x !== b); if (b.saved) (doc.removedTextBoxes ??= []).push(b); else doc.addedTextBoxes = doc.addedTextBoxes.filter((x) => x !== b); };

await test("a new text box is written as a type-16 record + anchor, reloads with its text/size/colour, and can be edited and deleted", async () => {
  const doc = await load();
  const id = crypto.randomUUID();
  const text = 'Line one "quoted" & <tag>\nsecond line – ünïcode ✓';
  const box = addBox(doc, "Page[0-0]", { shapeUuid: id, text, color: "#2f4fd0", fontSize: 48, isBold: true, rect: { left: 300, top: 800, right: 1100, bottom: 960 } });
  const strokesBefore = allStrokes(doc).length;
  let bytes = await exportStarNoteArchive(doc, []);
  assert.equal(box.saved, true); assert.equal(doc.addedTextBoxes.length, 0);
  let re = await reload(bytes);
  let got = re.tiles.get("Page[0-0]").textBoxes.find((b) => b.shapeUuid === id);
  assert.ok(got, "text box reloaded");
  assert.equal(got.text, text); assert.equal(got.color, "#2f4fd0"); assert.equal(got.fontSize, 48); assert.equal(got.isBold, true);
  assert.deepEqual(got.rect, box.rect); assert.equal(got.saved, true); assert.equal(got.tag, "Page[0-0]");
  assert.equal(allStrokes(re).length, strokesBefore, "the anchor is not mistaken for a stroke");
  // the anchor segment is in a point file, its parent is the box id; the record is in a shape zip
  const hits = await grepAll(re.rawZip, id);
  assert.equal(hits.filter((h) => h.includes("/point/")).length, 1); assert.equal(hits.filter((h) => h.includes("/shape/")).length, 1);

  // edit = delete old + add new
  dropBox(re, got);
  const edited = addBox(re, "Page[0-0]", { shapeUuid: crypto.randomUUID(), text: "edited", color: "#000000", fontSize: 60, rect: { left: 300, top: 800, right: 700, bottom: 900 } });
  bytes = await exportStarNoteArchive(re, []);
  re = await reload(bytes);
  assert.deepEqual(await grepAll(re.rawZip, id), [], "old box fully gone");
  assert.equal(re.tiles.get("Page[0-0]").textBoxes.filter((b) => b.text === "edited").length, 1);
  // delete
  dropBox(re, re.tiles.get("Page[0-0]").textBoxes.find((b) => b.shapeUuid === edited.shapeUuid));
  bytes = await exportStarNoteArchive(re, []);
  re = await reload(bytes);
  assert.deepEqual(await grepAll(re.rawZip, edited.shapeUuid), []);
  assert.equal(allStrokes(re).length, strokesBefore);
});

await test("deleting the REAL text box from the sample (it shares a point file with a stroke) keeps that stroke intact", async () => {
  const doc = await load();
  const box = [...doc.tiles.values()].flatMap((t) => t.textBoxes ?? []).find((b) => b.text.includes("HELLO_INTEROP_TEST"));
  assert.ok(box && box.saved && box.tag === "Page[-5--1]");
  const stroke = allStrokes(doc).find((s) => s.parentUuid === "63952357-5828-4463-8110-fb984e0aab72");
  const pts = JSON.stringify(stroke.points);
  dropBox(doc, box);
  const re = await reload(await exportStarNoteArchive(doc, []));
  assert.deepEqual(await grepAll(re.rawZip, box.shapeUuid), [], "text box record + anchor removed");
  const still = allStrokes(re).find((s) => s.parentUuid === stroke.parentUuid);
  assert.ok(still, "the stroke sharing the file survives"); assert.equal(JSON.stringify(still.points), pts);
  assert.equal(still.src.seg, 0, "and was renumbered to segment 0");
  assert.equal([...re.tiles.values()].flatMap((t) => t.textBoxes ?? []).some((b) => b.text.includes("HELLO_INTEROP_TEST")), false);
});

await test("dropShapeRecords refuses a stream it cannot parse and never edits it", () => {
  assert.equal(dropShapeRecords(new Uint8Array([0x0b, 0x01]), new Set(["x"])), null); // varint field, not a record
  assert.equal(dropShapeRecords(new Uint8Array([0x0a, 0x7f, 1, 2]), new Set(["x"])), null); // length runs past the end
});

console.log(`${passed} tests passed`);
