// Tests the command line end to end: builds the bundle, runs it on the sample note and on notes it creates itself.
// Run: node test/cli.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "sn-cli-"));
const bin = join(tmp, "rea-starnote.mjs");
const sample = join(root, "public/samples/test.note");
assert.equal(spawnSync(process.execPath, [join(root, "scripts/build-cli.mjs"), bin], { stdio: "inherit" }).status, 0, "build");
const run = (...args) => { const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test("--version matches package.json", () => {
  assert.equal(run("--version").out.trim(), JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);
});
test("info --json reads the sample", () => {
  const i = JSON.parse(run("info", sample, "--json").out);
  assert.equal(i.pages, 12); assert.equal(i.strokes, 4); assert.equal(i.textBoxes, 1);
});
test("text prints the sample's text box", () => assert.match(run("text", sample).out, /HELLO_INTEROP_TEST/));
test("validate passes on the sample", () => assert.equal(run("validate", sample).code, 0));
test("export svg / pdf / json", () => {
  const svg = join(tmp, "a.svg"), pdf = join(tmp, "a.pdf");
  assert.equal(run("export", sample, "-f", "svg", "-o", svg).code, 0);
  assert.match(readFileSync(svg, "utf8"), /^<\?xml[\s\S]*<svg/);
  assert.equal(run("export", sample, "-f", "pdf", "-o", pdf).code, 0);
  assert.equal(readFileSync(pdf).subarray(0, 5).toString(), "%PDF-");
  assert.equal(JSON.parse(run("export", sample, "-f", "json", "-o", "-").out).pages.flatMap((p) => p.strokes).length, 4);
});
test("new creates a valid note that info reads back", () => {
  const n = join(tmp, "n.note");
  assert.equal(run("new", "-o", n, "--pages", "3", "--paper", "a5", "--landscape", "--template", "grid", "--title", "Demo").code, 0);
  const i = JSON.parse(run("info", n, "--json").out);
  assert.equal(i.title, "Demo"); assert.equal(i.pages, 3);
  assert.ok(i.pageList.every((p) => p.template === "grid" && p.width > p.height));
  assert.equal(run("validate", n).code, 0);
});
test("new --kind infinite, --spacing, and the app's names for templates", () => {
  const nb = join(tmp, "nb.note"), inf = join(tmp, "inf.note");
  assert.equal(run("new", "-o", nb, "--pages", "3", "--template", "lined", "--spacing", "wide").code, 0);
  const i = JSON.parse(run("info", nb, "--json").out);
  assert.equal(i.layout, "pages"); assert.equal(i.pages, 3);
  assert.ok(i.pageList.every((p) => p.template === "ruled" && p.spacing === 70));
  assert.equal(run("validate", nb).code, 0);
  assert.equal(run("new", "-o", inf, "--kind", "infinite", "--template", "dotted", "--spacing", "narrow").code, 0);
  const j = JSON.parse(run("info", inf, "--json").out);
  assert.equal(j.layout, "infinite canvas"); assert.equal(j.pageList[0].template, "dots"); assert.equal(j.pageList[0].spacing, 42);
  assert.equal(run("validate", inf).code, 0);
  assert.equal(run("new", "-o", join(tmp, "x.note"), "--kind", "nope").code, 2);
});
test("validate fails on a file that is not a note", () => {
  const bad = join(tmp, "bad.note"); writeFileSync(bad, "hello");
  assert.equal(run("validate", bad).code, 1);
});
test("usage errors exit 2, missing files exit 1", () => {
  assert.equal(run("bogus").code, 2);
  assert.equal(run("new").code, 2);
  assert.equal(run("new", "-o", join(tmp, "x.note"), "--paper", "nope").code, 2);
  assert.equal(run("info", join(tmp, "missing.note")).code, 1);
});

console.log(`${passed} tests passed`);
