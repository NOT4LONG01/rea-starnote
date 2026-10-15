// The notebook (folder) model: nesting, paths, what can be moved where, what the Trash shows. Pure functions, no browser.
// Run: node test/folders.test.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-folders-"));
writeFileSync(join(tmp, "entry.ts"), `export * from ${JSON.stringify(join(here, "../src/data/folders.ts"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error" });
const f = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const item = (id, kind, parentId, extra = {}) => ({ id, title: id, kind, parentId, created: 1, modified: 1, trashed: false, ...extra });
// top: A (folder: n1, B (folder: n2, C (folder: n3))), n0 ; D (folder, empty)
const items = [item("A", "folder"), item("B", "folder", "A"), item("C", "folder", "B"), item("D", "folder"),
  item("n0", "note"), item("n1", "note", "A"), item("n2", "note", "B"), item("n3", "pdf", "C")];

test("children of the top level and of a folder", () => {
  assert.deepEqual(f.childrenOf(items, null).map((i) => i.id).sort(), ["A", "D", "n0"]);
  assert.deepEqual(f.childrenOf(items, "A").map((i) => i.id).sort(), ["B", "n1"]);
});
test("descendants go any depth down and never include the folder itself", () => {
  assert.deepEqual(f.descendantsOf(items, "A").map((i) => i.id).sort(), ["B", "C", "n1", "n2", "n3"]);
  assert.deepEqual(f.descendantsOf(items, "D"), []);
});
test("a path runs from the top level down; the top level has an empty path", () => {
  assert.deepEqual(f.pathOf(items, "C").map((i) => i.id), ["A", "B", "C"]);
  assert.deepEqual(f.pathOf(items, null), []);
  assert.deepEqual(f.pathOf(items, "missing"), []);
});
test("a cycle in broken data can't hang the path or the descendants", () => {
  const loop = [item("X", "folder", "Y"), item("Y", "folder", "X")];
  assert.ok(f.pathOf(loop, "X").length <= 64);
  assert.ok(f.descendantsOf(loop, "X").length <= 2);
});
test("what can be moved where: not into itself or into its own contents, only into live folders or the top level", () => {
  assert.equal(f.canMoveTo(items, "A", "A"), false);
  assert.equal(f.canMoveTo(items, "A", "C"), false, "A into its own sub-folder");
  assert.equal(f.canMoveTo(items, "C", "A"), true);
  assert.equal(f.canMoveTo(items, "n1", "D"), true);
  assert.equal(f.canMoveTo(items, "n1", null), true);
  assert.equal(f.canMoveTo(items, "n1", "n0"), false, "a note is not a destination");
  assert.equal(f.canMoveTo(items, "n1", "gone"), false);
  assert.equal(f.canMoveTo(items.map((i) => (i.id === "D" ? { ...i, trashed: true } : i)), "n1", "D"), false, "a trashed folder is not a destination");
});
test("the note count of a folder counts notes at every depth, not folders or trashed ones", () => {
  assert.equal(f.noteCount(items, "A"), 3);
  assert.equal(f.noteCount(items.map((i) => (i.id === "n2" ? { ...i, trashed: true } : i)), "A"), 2);
  assert.equal(f.noteCount(items, "D"), 0);
});
test("the Trash shows a trashed folder as one card, not everything inside it", () => {
  const t = items.map((i) => (["A", "B", "C", "n1", "n2", "n3"].includes(i.id) ? { ...i, trashed: true } : i));
  assert.deepEqual(f.visibleTrash(t).map((i) => i.id), ["A"]);
  const alone = items.map((i) => (i.id === "n2" ? { ...i, trashed: true } : i)); // a note trashed from a live folder stands alone
  assert.deepEqual(f.visibleTrash(alone).map((i) => i.id), ["n2"]);
});
test("an item in a missing or trashed folder is shown at the top level", () => {
  assert.equal(f.liveParent(items, items.find((i) => i.id === "n2")), "B");
  assert.equal(f.liveParent(items, item("z", "note", "gone")), null);
  assert.equal(f.liveParent(items.map((i) => (i.id === "B" ? { ...i, trashed: true } : i)), items.find((i) => i.id === "n2")), null);
});

test("page order: unset means creation time, a move takes the midpoint of its new neighbours, nothing else changes", () => {
  const pages = [item("p1", "note", "S", { created: 100 }), item("p2", "note", "S", { created: 200 }), item("p3", "note", "S", { created: 300, order: 150 })];
  assert.deepEqual([...pages].sort(f.byPlace).map((p) => p.id), ["p1", "p3", "p2"], "p3's manual order puts it between");
  const rest = pages.filter((p) => p.id !== "p2").sort(f.byPlace); // move p2 to the top
  assert.equal(f.orderAt(rest, 0), 100 - 1000);
  assert.equal(f.orderAt(rest, 1), 125, "between p1 (100) and p3 (150)");
  assert.equal(f.orderAt(rest, 2), 1150, "after the last");
  assert.ok(f.orderAt([], 0) > 0);
});
test("the notebook at the top of a path and the depth below it", () => {
  assert.deepEqual([f.rootNotebookOf(items, "C").root.id, f.rootNotebookOf(items, "C").depth], ["A", 2]);
  assert.deepEqual([f.rootNotebookOf(items, "A").root.id, f.rootNotebookOf(items, "A").depth], ["A", 0]);
  assert.equal(f.rootNotebookOf(items, null).root, null);
});

console.log(`${passed} tests passed`);
