// Tests finite pages: stacks of pages with sizes/templates/order survive save + reload, strokes land on the right page
// whatever the order, and a deleted page leaves nothing behind. Real loader/serializer/pages modules. Run: node test-pages.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-pages-"));
writeFileSync(join(tmp, "entry.ts"), `
export * from ${JSON.stringify(join(here, "../src/model/note-loader.ts"))};
export * from ${JSON.stringify(join(here, "../src/model/note-serializer.ts"))};
export * from ${JSON.stringify(join(here, "../src/model/pages.ts"))};
export { default as JSZip } from ${JSON.stringify(join(here, "../node_modules/jszip"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error" });
const m = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);
const { loadStarNoteArchive, exportStarNoteArchive, newPageTile, relayout, nextPageTag, pageFormat, PAGE_GAP, isPageStack, JSZip } = m;

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const reload = (bytes) => loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const stack = (formats) => {
  const doc = { uuid: crypto.randomUUID(), title: "t", tiles: new Map(), layout: "stack" };
  formats.forEach((f) => { const tag = nextPageTag(doc); doc.tiles.set(tag, newPageTile(tag, f)); });
  relayout(doc);
  return doc;
};
const stroke = (x, y, color = "#112233") => ({ shapeUuid: "s", parentUuid: crypto.randomUUID(), color, width: 6, durationMs: 40, points: [{ dt: 0, x, y, pressure: 20000 }, { dt: 5, x: x + 100, y: y + 60, pressure: 20000 }] });
const tags = (doc) => [...doc.tiles.keys()];
const files = (zip) => Object.keys(zip.files).filter((n) => !zip.files[n].dir);

await test("pages are stacked top to bottom with a gap, centred, and the tile frame moves with the page", () => {
  const doc = stack([pageFormat("a4", false, "ruled"), pageFormat("a4", true, "grid"), pageFormat("a5", false, "dots")]);
  const [a, b, c] = [...doc.tiles.values()];
  assert.deepEqual([a.pageRect.right - a.pageRect.left, a.pageRect.bottom - a.pageRect.top], [1485, 2100]);
  assert.deepEqual([b.pageRect.right - b.pageRect.left, b.pageRect.bottom - b.pageRect.top], [2100, 1485]);
  assert.equal(b.pageRect.top, a.pageRect.bottom + PAGE_GAP);
  assert.equal(c.pageRect.top, b.pageRect.bottom + PAGE_GAP);
  assert.equal(a.pageRect.left, (2100 - 1485) / 2, "narrower pages are centred on the widest");
  for (const t of [a, b, c]) assert.equal(t.rect.left, t.pageRect.left, "tile origin = page top-left for blank pages");
  assert.equal(isPageStack(tags(doc)), true);
  assert.equal(isPageStack(["Page[0-0]", "Page[2-0]"]), false, "a gap in the rows is not a stack");
  assert.equal(isPageStack(["Page[0-0]", "Page[0-1]"]), false);
});

await test("sizes, templates and order survive save and reload; the note is a stack again", async () => {
  const doc = stack([pageFormat("a4", false, "ruled"), pageFormat("a5", true, "grid"), pageFormat("letter", false, "blank"), pageFormat("a6", false, "dots")]);
  const re = await reload(await exportStarNoteArchive(doc, []));
  assert.equal(re.layout, "stack");
  assert.deepEqual(tags(re), tags(doc));
  for (const [tag, t] of re.tiles) {
    const o = doc.tiles.get(tag);
    assert.deepEqual(t.pageRect, o.pageRect, `${tag} geometry`);
    assert.equal(t.template, o.template, `${tag} template`);
  }
});

await test("a stroke drawn in world space lands on the page under it (tile-local), also after the order changed", async () => {
  const doc = stack([pageFormat("a4", false, "blank"), pageFormat("a4", false, "blank"), pageFormat("a4", false, "blank")]);
  const third = [...doc.tiles.values()][2].pageRect;
  const s1 = stroke(third.left + 300, third.top + 400);
  let re = await reload(await exportStarNoteArchive(doc, [s1]));
  const t3 = [...re.tiles.values()][2];
  assert.equal(t3.strokes.length, 1);
  assert.deepEqual([t3.strokes[0].points[0].x, t3.strokes[0].points[0].y], [300, 400]);
  // move the last page to the top (the tags stay): the stroke must follow its page
  const entries = [...re.tiles.entries()]; entries.unshift(entries.pop()); re.tiles = new Map(entries); relayout(re);
  re = await reload(await exportStarNoteArchive(re, []));
  const first = [...re.tiles.values()][0];
  assert.equal(first.strokes.length, 1, "the stroke is on the page that moved to the top");
  assert.deepEqual(tags(re), ["Page[2-0]", "Page[0-0]", "Page[1-0]"]);
  // now draw on the (new) second page using world coordinates
  const second = [...re.tiles.values()][1].pageRect;
  re = await reload(await exportStarNoteArchive(re, [stroke(second.left + 50, second.top + 70)]));
  assert.equal([...re.tiles.values()][1].strokes.length, 1);
  assert.deepEqual([...re.tiles.values()][1].strokes[0].points[0].x, 50);
  // a stroke crossing the gap between two pages is split in two, each part on its own page
  const p1 = [...re.tiles.values()][0].pageRect, p2 = [...re.tiles.values()][1].pageRect;
  const cross = { ...stroke(0, 0), points: [{ dt: 0, x: p1.left + 200, y: p1.bottom - 20, pressure: 9000 }, { dt: 4, x: p1.left + 210, y: p1.bottom - 5, pressure: 9000 }, { dt: 8, x: p2.left + 220, y: p2.top + 8, pressure: 9000 }, { dt: 12, x: p2.left + 230, y: p2.top + 30, pressure: 9000 }] };
  re = await reload(await exportStarNoteArchive(re, [cross]));
  const tl = [...re.tiles.values()];
  assert.equal(tl[0].strokes.length, 2, "page 1 holds its part (plus the moved stroke)");
  assert.equal(tl[1].strokes.length, 2, "page 2 holds the other part (plus the earlier stroke)");
});

await test("deleting a page removes its ink, text, shapes, template and page record; neighbours are untouched", async () => {
  const doc = stack([pageFormat("a4", false, "ruled"), pageFormat("a4", false, "ruled"), pageFormat("a4", false, "ruled")]);
  const [p0, p1, p2] = [...doc.tiles.values()];
  const keep0 = stroke(p0.pageRect.left + 100, p0.pageRect.top + 100), gone = stroke(p1.pageRect.left + 120, p1.pageRect.top + 90), keep2 = stroke(p2.pageRect.left + 140, p2.pageRect.top + 80);
  const box = { saved: false, tag: p1.pageTag, shapeUuid: crypto.randomUUID(), text: "doomed", color: "#000000", fontSize: 40, rect: { left: 100, top: 300, right: 400, bottom: 360 } };
  p1.textBoxes.push(box); doc.addedTextBoxes = [box];
  let re = await reload(await exportStarNoteArchive(doc, [keep0, gone, keep2]));
  const doomedTag = [...re.tiles.keys()][1];
  const withPage = files(re.rawZip).filter((n) => n.includes(doomedTag));
  assert.ok(withPage.length >= 4, `the page owns files: ${withPage.length}`);
  // delete page 2 of 3
  re.tiles.delete(doomedTag); (re.removedPages ??= []).push(doomedTag); relayout(re);
  re = await reload(await exportStarNoteArchive(re, []));
  assert.deepEqual(tags(re), ["Page[0-0]", "Page[2-0]"]);
  assert.deepEqual(files(re.rawZip).filter((n) => n.includes(doomedTag)), [], "no file of the deleted page is left");
  const pbText = Buffer.from(await re.rawZip.file(files(re.rawZip).find((n) => n.includes("/virtual/page/pb/"))).async("uint8array")).toString("latin1");
  assert.equal(pbText.includes(doomedTag), false, "page record gone");
  assert.ok(pbText.includes("Page[0-0]") && pbText.includes("Page[2-0]"), "neighbours' page records stay");
  assert.equal([...re.tiles.values()].map((t) => t.strokes.length).join(), "1,1", "the other pages keep their ink");
  const info = Buffer.from(await re.rawZip.file(`${re.uuid}/note/pb/note_info`).async("uint8array")).toString("latin1");
  assert.equal(info.includes(doomedTag), false, "note_info no longer lists it");
  // a new page after the delete must not reuse the deleted tag's files
  const tag = nextPageTag({ tiles: new Map(re.tiles), removedPages: [doomedTag] });
  assert.notEqual(tag, doomedTag);
});

await test("a real free-form StarNote canvas (the sample) is left as it is: not a stack, geometry from the tags", async () => {
  const b = readFileSync(join(here, "../public/samples/test.note"));
  const doc = await loadStarNoteArchive(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(doc.layout, undefined);
  const t = doc.tiles.get("Page[-5--1]");
  assert.deepEqual(t.rect, { left: -2100, top: -10500, right: 0, bottom: -8400 });
  // saving it adds no sidecar and doesn't touch other tiles
  const re = await reload(await exportStarNoteArchive(doc, []));
  assert.equal(files(re.rawZip).some((n) => n.includes("/interop/")), false);
  assert.equal(re.layout, undefined);
});

await test("the format is recorded natively too: note_info carries each page's width/height", async () => {
  const doc = stack([pageFormat("a5", false, "ruled"), pageFormat("a4", true, "ruled")]);
  const z = await JSZip.loadAsync(await exportStarNoteArchive(doc, []));
  const text = Buffer.from(await z.file(`${doc.uuid}/note/pb/note_info`).async("uint8array")).toString("utf8");
  const json = JSON.parse(text.slice(text.indexOf('{"canvasExpandType"'), text.indexOf('{"pageNameList"')).replace(/[^}]*$/, ""));
  assert.deepEqual([json.pageInfoMap["Page[0-0]"].width, json.pageInfoMap["Page[0-0]"].height], [1046, 1485]);
  assert.deepEqual([json.pageInfoMap["Page[1-0]"].width, json.pageInfoMap["Page[1-0]"].height], [2100, 1485]);
  // without the sidecar the sizes still come back from note_info
  z.remove(`${doc.uuid}/interop/pages.json`);
  const re = await reload(await z.generateAsync({ type: "uint8array" }));
  assert.equal(re.layout, "stack");
  assert.deepEqual([...re.tiles.values()].map((t) => [t.pageRect.right - t.pageRect.left, t.pageRect.bottom - t.pageRect.top]), [[1046, 1485], [2100, 1485]]);
});

console.log(`${passed} tests passed`);
