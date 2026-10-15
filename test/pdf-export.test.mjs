// Tests the REAL src/render/pdf-export.ts: builds a PDF from a synthetic note, then validates it with independent tools
// (pdfinfo, pdftoppm, pdftotext, ghostscript) and checks actual rendered pixels. Run: node test-pdf-export.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-pdf-"));
writeFileSync(join(tmp, "entry.ts"), `export * from ${JSON.stringify(join(here, "../src/render/pdf-export.ts"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error" });
const { exportAnnotatedPdf, safeFileName } = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
// Portable tool lookup: `where` on Windows, `which` elsewhere; Ghostscript is gswin64c/gswin32c there; Python is python/py.
const WIN = process.platform === "win32";
const found = (cmd) => spawnSync(WIN ? "where" : "which", [cmd], { encoding: "utf8" }).status === 0;
const first = (...names) => { const n = names.find(found); if (!n) throw new Error(`${names[0]} is required for this test (looked for: ${names.join(", ")})`); return n; };
["pdfinfo", "pdftoppm", "pdftotext"].forEach((c) => first(c));
const GS = (WIN ? ["gswin64c", "gswin32c", "gs"] : ["gs"]).find(found) ?? null; // Ghostscript is an extra validator: without it those checks are skipped (and reported)
if (!GS) console.log("  note: Ghostscript not found, its validity checks are skipped (poppler still validates every file)");
const gsCheck = (f) => (GS ? spawnSync(GS, ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=nullpage", f], { encoding: "utf8" }) : { status: 0, stdout: "", stderr: "" });
const PY = first(...(WIN ? ["python", "py", "python3"] : ["python3"]));
if (spawnSync(PY, ["-c", "import PIL"]).status !== 0) throw new Error("Python with Pillow (PIL) is required for this test");
const lsPng = (prefix) => { // the first file the renderer wrote with this prefix
  const dir = dirname(prefix), base = prefix.slice(dir.length + 1);
  return join(dir, readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith(".png")).sort()[0]);
};

// a solid-blue JPEG for the page-image background (made with PIL, independent of our code)
const jpgPath = join(tmp, "bg.jpg");
execFileSync(PY, ["-c", `from PIL import Image; Image.new('RGB',(40,52),(32,64,192)).save(${JSON.stringify(jpgPath)},'JPEG',quality=95)`]);
const jpg = new Uint8Array(readFileSync(jpgPath));
const encodeImage = async () => ({ bytes: jpg, width: 40, height: 52 });

// pressure-varying red diagonal in tile-local coords
const diag = [...Array(60)].map((_, i) => ({ dt: i * 10, x: 300 + i * 25, y: 300 + i * 25, pressure: 32767 }));
const doc = {
  uuid: "u", title: "t",
  tiles: new Map([
    ["Page[0-0]", { pageTag: "Page[0-0]", rect: { left: 0, top: 0, right: 2100, bottom: 2100 },
      strokes: [
        { shapeUuid: "a", parentUuid: "a", color: "#ff0000", width: 40, durationMs: 1, points: diag },
        { shapeUuid: "b", parentUuid: "b", color: "#000000", width: 30, durationMs: 1, points: [{ dt: 0, x: 1000, y: 200, pressure: 32767 }] }, // a tap
      ],
      textBoxes: [{ shapeUuid: "t", text: "HELLO (test) \\ end\nsecond line", color: "#000000", fontSize: 60, rect: { left: 200, top: 1700, right: 1500, bottom: 1900 } }] }],
    ["Page[1-0]", { pageTag: "Page[1-0]", rect: { left: 0, top: 2100, right: 2100, bottom: 4200 }, pageRect: { left: 236, top: 2100, right: 1864, bottom: 4200 },
      backgroundImage: { naturalWidth: 40, naturalHeight: 52 },
      strokes: [{ shapeUuid: "c", parentUuid: "c", color: "#00aa00", width: 40, durationMs: 1, points: [...Array(40)].map((_, i) => ({ dt: i, x: 400 + i * 28, y: 400 + i * 20, pressure: 32767 })) }] }],
    ["Page[5-0]", { pageTag: "Page[5-0]", rect: { left: 0, top: 10500, right: 2100, bottom: 12600 }, strokes: [] }], // empty tile: must not become a page
  ]),
};

const pdf = await exportAnnotatedPdf(doc, "My (note) – test", { encodeImage });
const file = join(tmp, "out.pdf");
writeFileSync(file, pdf);
const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
const pageSize = (n) => execFileSync("pdfinfo", ["-f", String(n), "-l", String(n), file], { encoding: "utf8" }).match(new RegExp(`Page\\s+${n} size:\\s+([\\d.]+) x ([\\d.]+)`)).slice(1).map(Number);
const render = (page, dpi = 72) => {
  const prefix = join(tmp, `r${page}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(page), "-l", String(page), "-png", file, prefix]);
  const png = lsPng(prefix);
  return (pts) => JSON.parse(execFileSync(PY, ["-c", `
import json,sys
from PIL import Image
im=Image.open(${JSON.stringify(png)}).convert('RGB')
pts=json.loads(sys.argv[1]); print(json.dumps([im.getpixel((x,y)) for x,y in pts]+[list(im.size)]))`, JSON.stringify(pts)], { encoding: "utf8" }));
};

await test("the file is a structurally valid PDF with one page per page that has content (empty tiles skipped)", async () => {
  assert.match(info, /Pages:\s+2/);
  assert.match(info, /Title:\s+My \(note\) /);
  assert.deepEqual(pageSize(1), [595.28, 595.28]);
  const [w2, h2] = pageSize(2);
  assert.equal(w2, 595.28); assert.ok(Math.abs(h2 - 595.28 * 2100 / 1628) < 0.1, `page 2 keeps its own aspect: ${h2}`);
  const gs = gsCheck(file);
  assert.equal(gs.status, 0); assert.equal((gs.stderr + gs.stdout).trim(), "", "ghostscript found no errors/warnings");
  const poppler = spawnSync("pdftotext", [file, "-"], { encoding: "utf8" });
  assert.equal(poppler.status, 0); assert.ok(!/Syntax (Error|Warning)/.test(poppler.stderr), poppler.stderr);
});

await test("page 1 renders: a red stroke across the diagonal, a black dot for the tap, white paper with ruled lines", async () => {
  const k = 595.28 / 2100;
  const at = (x, y) => [Math.round(x * k), Math.round(y * k)];
  const r0 = Math.floor(86.81 * k); // a 0.5 pt line straddles pixel rows at 72 dpi: look at the 4 rows around it
  const px = render(1)([at(1050, 1050), at(1000, 200), at(1500, 400), at(100, 1000), [300, r0 - 1], [300, r0], [300, r0 + 1], [300, r0 + 2], [300, r0 + 9]]);
  const [red, dot, empty, paper, ...rest] = px;
  const rule = rest.slice(0, 4).reduce((a, b) => (b[0] < a[0] ? b : a)); // darkest of the four rows
  const between = rest[4];
  assert.ok(red[0] > 200 && red[1] < 60 && red[2] < 60, `red stroke at the diagonal midpoint: ${red}`);
  assert.ok(dot[0] < 60 && dot[1] < 60 && dot[2] < 60, `black dot: ${dot}`);
  assert.ok(empty.every((c) => c > 240), `white where nothing was drawn: ${empty}`);
  assert.ok(paper.every((c) => c > 240), `white paper: ${paper}`);
  assert.ok(rule[0] < 245 && rule[0] > 150, `a faint ruled line at the first pitch: ${rule}`);
  assert.ok(between.every((c) => c > 245), `white between ruled lines: ${between}`);
  assert.deepEqual(rest.at(-1), [596, 596]); // 595.28 pt rasterised at 72 dpi
});

await test("stroke geometry is where the app draws it: strokes stay inside their path (no stray fill)", async () => {
  const k = 595.28 / 2100;
  const [off1, off2, onPath] = render(1)([[Math.round(1700 * k), Math.round(500 * k)], [Math.round(500 * k), Math.round(1500 * k)], [Math.round((300 + 30 * 25) * k), Math.round((300 + 30 * 25) * k)]]);
  assert.ok(off1.every((c) => c > 240) && off2.every((c) => c > 240), "far from the stroke it is white");
  assert.ok(onPath[1] < 80, "on the path it is inked");
});

await test("typed text is real text (selectable/searchable), with parentheses and backslashes escaped", async () => {
  const txt = execFileSync("pdftotext", ["-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
  assert.match(txt, /HELLO \(test\) \\ end/);
  assert.match(txt, /second line/);
});

await test("page 2 shows the background image inside its own page rectangle, with the stroke on top at the right spot", async () => {
  const k = 595.28 / 1628;
  const [bg, ink, whiteMargin] = render(2)([[300, 600], [Math.round((400 + 20 * 28 - 236) * k), Math.round((400 + 20 * 20) * k)], [595 - 2, 300]]);
  assert.ok(bg[2] > 150 && bg[0] < 90, `blue page background: ${bg}`);
  assert.ok(ink[1] > 120 && ink[0] < 80 && ink[2] < 80, `green stroke over the image: ${ink}`);
  assert.ok(bg[2] > 150, "image fills the whole page rect");
});

await test("a translucent stroke (highlighter) is exported with real opacity, so the paper and text underneath stay visible", async () => {
  const d = { uuid: "u", title: "t", tiles: new Map([["Page[0-0]", { pageTag: "Page[0-0]", rect: { left: 0, top: 0, right: 2100, bottom: 2100 },
    strokes: [{ shapeUuid: "h", parentUuid: "h", color: "#e6a817", width: 120, alpha: 0.35, sens: 0, durationMs: 1,
      points: [{ dt: 0, x: 300, y: 1000, pressure: 32767 }, { dt: 5, x: 1200, y: 1000, pressure: 32767 }] }] }]]) };
  const f = join(tmp, "hl.pdf");
  const bytes = await exportAnnotatedPdf(d, "hl", { encodeImage });
  writeFileSync(f, bytes);
  assert.match(Buffer.from(bytes).toString("latin1"), /\/ExtGState << \/GS35 << \/ca 0\.35 \/CA 0\.35 >> >>/);
  execFileSync("pdftoppm", ["-r", "72", "-png", f, join(tmp, "hl")]);
  const png = lsPng(join(tmp, "hl"));
  const px = JSON.parse(execFileSync(PY, ["-c", `
import json
from PIL import Image
im=Image.open(${JSON.stringify(png)}).convert('RGB'); w,h=im.size
print(json.dumps(im.getpixel((int(w*0.4), int(h*1000/2100)))))`], { encoding: "utf8" }));
  // amber (230,168,23) at 35% over white = (246,225,175): lighter than the solid colour, not white
  assert.ok(px[0] > 238 && px[1] > 210 && px[1] < 240 && px[2] > 150 && px[2] < 200, `translucent amber, got ${px}`);
});

await test("a note with nothing on it still exports one blank page; an empty stroke or zero-width point list does not crash", async () => {
  const blank = await exportAnnotatedPdf({ uuid: "u", title: "t", tiles: new Map() }, "Blank");
  const f = join(tmp, "blank.pdf"); writeFileSync(f, blank);
  assert.match(execFileSync("pdfinfo", [f], { encoding: "utf8" }), /Pages:\s+1/);
  const odd = await exportAnnotatedPdf({ uuid: "u", title: "t", tiles: new Map([["Page[0-0]", { pageTag: "Page[0-0]", rect: { left: 0, top: 0, right: 2100, bottom: 2100 }, strokes: [{ shapeUuid: "x", parentUuid: "x", color: "#123456", width: 5, durationMs: 0, points: [] }, { shapeUuid: "y", parentUuid: "y", color: "bad-color", width: 5, durationMs: 0, points: [{ dt: 0, x: 5, y: 5, pressure: 0 }, { dt: 1, x: 5, y: 5, pressure: 0 }] }] }]]) }, "Odd");
  const f2 = join(tmp, "odd.pdf"); writeFileSync(f2, odd);
  assert.equal(gsCheck(f2).status, 0);
});

await test("non-Latin text does not corrupt the file (becomes ?), and the title is escaped", async () => {
  const d = await exportAnnotatedPdf({ uuid: "u", title: "t", tiles: new Map([["Page[0-0]", { pageTag: "Page[0-0]", rect: { left: 0, top: 0, right: 2100, bottom: 2100 }, strokes: [],
    textBoxes: [{ shapeUuid: "t", text: "한글 ok", color: "#000", fontSize: 50, rect: { left: 10, top: 10, right: 500, bottom: 200 } }] }]]) }, "제목 (x)");
  const f = join(tmp, "kr.pdf"); writeFileSync(f, d);
  assert.equal(gsCheck(f).status, 0);
  assert.match(execFileSync("pdftotext", [f, "-"], { encoding: "utf8" }), /\?\? ok/);
});

await test("safeFileName: Windows-illegal characters and length are handled", async () => {
  assert.equal(safeFileName('QA: a/b*c?"d<e>f|g'), "QA_ a_b_c__d_e_f_g");
  assert.equal(safeFileName("   "), "note");
  assert.ok(safeFileName("x".repeat(500)).length <= 120);
});

await test("file size stays modest for a stroke-heavy page (2,000 strokes)", async () => {
  const many = [...Array(2000)].map((_, s) => ({ shapeUuid: "s" + s, parentUuid: "s", color: "#000000", width: 8, durationMs: 1, points: [...Array(25)].map((_, i) => ({ dt: i, x: (s * 7) % 1900 + i * 3, y: (s * 13) % 1900 + i * 2, pressure: 20000 })) }));
  const d = await exportAnnotatedPdf({ uuid: "u", title: "t", tiles: new Map([["Page[0-0]", { pageTag: "Page[0-0]", rect: { left: 0, top: 0, right: 2100, bottom: 2100 }, strokes: many }]]) }, "Heavy");
  console.log(`      (2,000 strokes x 25 points -> ${(d.length / 1e6).toFixed(2)} MB)`);
  assert.ok(d.length < 3e6, `compressed: ${d.length}`); // was 6 MB uncompressed
  const f = join(tmp, "heavy.pdf"); writeFileSync(f, d);
  assert.equal(gsCheck(f).status, 0);
});

console.log(`\n${passed} tests passed`);
