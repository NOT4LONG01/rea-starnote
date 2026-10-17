// Handwriting search: cutting ink into lines, fingerprints, and matching (pure functions; the recognizers are platform code).
// Run: node test/handwriting.test.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-ink-"));
writeFileSync(join(tmp, "entry.ts"), `export * from ${JSON.stringify(join(here, "../src/integrations/handwriting.ts"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error" });
const h = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
// a "letter": a small zig-zag in a box
const letter = (x, y, w = 40, hh = 50) => ({ points: [{ x, y }, { x: x + w / 2, y: y + hh }, { x: x + w, y }] });

test("strokes on one baseline form one line; a second baseline a second line", () => {
  const ink = [letter(100, 100), letter(150, 105), letter(200, 98), letter(100, 300), letter(160, 302)];
  const lines = h.groupIntoLines(ink);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].strokes.length, 3); assert.equal(lines[1].strokes.length, 2);
  assert.ok(lines[0].box.t < lines[1].box.t);
});
test("a wide horizontal gap splits a row into two pieces (two columns, a margin note)", () => {
  const ink = [letter(100, 100), letter(150, 100), letter(1200, 100), letter(1250, 100)];
  assert.equal(h.groupIntoLines(ink).length, 2);
});
test("a very long line is cut into pieces of at most 300 strokes (the Windows recognizer refuses ~1000)", () => {
  const ink = Array.from({ length: 700 }, (_, i) => letter(100 + i * 20, 100, 15, 50));
  const lines = h.groupIntoLines(ink);
  assert.ok(lines.length === 3 && lines.every((l) => l.strokes.length <= 300), lines.map((l) => l.strokes.length).join(","));
});
test("a dot above a letter stays in its line", () => {
  const dot = { points: [{ x: 120, y: 80 }, { x: 122, y: 82 }] };
  const lines = h.groupIntoLines([letter(100, 100), letter(150, 100), dot]);
  assert.equal(lines.length, 1); assert.equal(lines[0].strokes.length, 3);
});
test("superscripts and subscripts stay in their line (x², a₁), not lines of their own", () => {
  const sup = letter(145, 75, 20, 22), sub = letter(195, 140, 20, 22);
  const lines = h.groupIntoLines([letter(100, 100), letter(150, 100), sup, letter(170, 100), sub]);
  assert.equal(lines.length, 1, lines.map((l) => l.strokes.length).join(","));
});
test("on close lines, a superscript joins its own line, not the one above", () => {
  const sup = letter(145, 165, 20, 22); // just above line 2 (180..230), 15 below line 1 (100..150)
  const lines = h.groupIntoLines([letter(100, 100), letter(150, 100), letter(100, 180), letter(150, 180), sup]);
  assert.deepEqual(lines.map((l) => l.strokes.length), [2, 3]);
});
test("small writing away from the text (a diagram label) stays one line, not one line per stroke", () => {
  const label = [letter(600, 400, 20, 25), letter(660, 404, 20, 25), letter(720, 398, 20, 25)]; // spaced wider than its height
  const lines = h.groupIntoLines([letter(100, 100), letter(150, 100), letter(200, 100), letter(100, 200), letter(150, 200), ...label]);
  assert.deepEqual(lines.map((l) => l.strokes.length), [3, 2, 3]);
});
test("the fingerprint changes when the ink does, not otherwise", () => {
  const a = [letter(100, 100)], b = [letter(100, 100)], c = [letter(100, 100), letter(200, 100)];
  assert.equal(h.inkSignature(a), h.inkSignature(b));
  assert.notEqual(h.inkSignature(a), h.inkSignature(c));
});
test("matching ignores case and spaces, also in Korean, and says where in the line", () => {
  assert.deepEqual(h.findIn("Hello World", "lowor").length, 1);
  assert.equal(h.findIn("안녕 하세요", "녕하").length, 1, "a space the recognizer put in does not matter");
  const [m] = h.findIn("abcdef", "cd");
  assert.ok(Math.abs(m.from - 2 / 6) < 1e-9 && Math.abs(m.to - 4 / 6) < 1e-9);
  assert.equal(h.findIn("abcabc", "abc").length, 2);
  assert.deepEqual(h.findIn("abc", "  "), []);
});

console.log(`${passed} tests passed`);
