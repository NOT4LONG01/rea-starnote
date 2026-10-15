/**
 * rea-starnote command line: inspect, validate, convert and create StarNote (.note) files without a browser.
 * It runs the same loader / serializer / PDF writer as the app (src/model, src/render/pdf-export).
 */
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import JSZip from "jszip";
import pkg from "../../package.json";
import { loadStarNoteArchive, StarNoteDocument } from "../model/note-loader";
import { dropShapeRecords, exportCanvasAsSvg, exportStarNoteArchive } from "../model/note-serializer";
import { parseStarNotePointsBinary } from "../model/stroke-interpolator";
import { PAPERS, TEMPLATES, newPageTile, nextPageTag, pageFormat, relayout, sizeOfPage, PageTemplate } from "../model/pages";
import { exportAnnotatedPdf } from "../render/pdf-export";

const HELP = `rea-starnote ${pkg.version}: work with StarNote (.note) files from the command line

Usage: rea-starnote <command> [options]

Commands:
  info <file.note>        title, layout, pages (size, style), strokes and text boxes per page      [--json]
  text <file.note>        print every text box (LaTeX math is shown as its $$source$$)             [--json]
  validate <file.note>    check the archive: ZIP, point streams, shape records, page file. Exit 1 on problems
  export <file.note>      convert:  --format svg | pdf | json   [-o <out>]   (-o - writes svg/json to stdout)
  new -o <file.note>      create a note: [--title T] [--paper a4|a5|a6|b5|letter|slide|square] [--landscape]
                          [--template blank|ruled|grid|dots] [--pages N]

Options:
  -h, --help              show this help          -v, --version   show the version

Notes: page backgrounds of PDF-based notes are bitmaps and are not drawn by "export" (the command line has no image
decoder); strokes, text and page layout are exported in full.`;

class UsageError extends Error {}

const out = (s: string) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");
const warn = (s: string) => process.stderr.write(s + "\n");

async function load(file: string | undefined): Promise<StarNoteDocument> {
  if (!file) throw new UsageError("missing <file.note>");
  const bytes = await readFile(file);
  return loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

const pagesOf = (doc: StarNoteDocument) =>
  [...doc.tiles.values()].map((t, i) => ({
    page: i + 1,
    tag: t.pageTag,
    width: Math.round(sizeOfPage(t).w),
    height: Math.round(sizeOfPage(t).h),
    template: t.template ?? "ruled",
    strokes: t.strokes.length,
    textBoxes: t.textBoxes?.length ?? 0,
  }));

async function cmdInfo(file: string | undefined, json: boolean) {
  const doc = await load(file);
  const pages = pagesOf(doc);
  const info = {
    title: doc.title,
    id: doc.uuid,
    layout: doc.layout === "stack" ? "pages" : "free-form canvas",
    pages: pages.length,
    strokes: pages.reduce((n, p) => n + p.strokes, 0),
    textBoxes: pages.reduce((n, p) => n + p.textBoxes, 0),
    pageList: pages,
  };
  if (json) return out(JSON.stringify(info, null, 2));
  out(`${info.title}  (${info.layout})`);
  out(`id ${info.id}`);
  out(`pages: ${info.pages}, strokes: ${info.strokes}, text boxes: ${info.textBoxes}`);
  for (const p of info.pageList) if (p.strokes || p.textBoxes || info.pages <= 30) out(`  ${String(p.page).padStart(3)}  ${p.tag.padEnd(14)} ${p.width}x${p.height}  ${p.template.padEnd(6)}  ${p.strokes} strokes, ${p.textBoxes} text`);
}

async function cmdText(file: string | undefined, json: boolean) {
  const doc = await load(file);
  const boxes = [...doc.tiles.values()].flatMap((t, i) => (t.textBoxes ?? []).map((b) => ({ page: i + 1, text: b.text, math: /^\$\$[\s\S]*\$\$$/.test(b.text.trim()) })));
  if (json) return out(JSON.stringify(boxes, null, 2));
  if (!boxes.length) return out("(no text boxes)");
  for (const b of boxes) out(`[page ${b.page}]${b.math ? " (LaTeX)" : ""} ${b.text.replace(/\n/g, "\n          ")}`);
}

async function cmdValidate(file: string | undefined): Promise<number> {
  if (!file) throw new UsageError("missing <file.note>");
  const problems: string[] = [];
  const bytes = await readFile(file);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch (e: any) { out(`FAIL  not a readable ZIP archive: ${e.message}`); return 1; }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (!names.some((n) => n.endsWith("/note/pb/note_info"))) problems.push("note/pb/note_info is missing");
  let points = 0, segments = 0, shapeFiles = 0;
  for (const n of names.filter((n) => n.endsWith("#points") && !n.includes("/stash/"))) {
    try {
      const p = parseStarNotePointsBinary(await zip.files[n].async("uint8array"));
      points++;
      segments += p.segments.length;
      if (p.segments.some((s) => s.points.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y)))) problems.push(`${n}: a point is not a number`);
    } catch (e: any) { problems.push(`${n}: unreadable point stream (${e.message})`); }
  }
  for (const n of names.filter((n) => /\/shape\/[^/]+\.zip$/.test(n))) {
    shapeFiles++;
    try {
      const inner = await JSZip.loadAsync(await zip.files[n].async("uint8array"));
      const first = Object.keys(inner.files)[0];
      if (!first || dropShapeRecords(await inner.files[first].async("uint8array"), new Set()) === null) problems.push(`${n}: the shape records cannot be read`);
    } catch (e: any) { problems.push(`${n}: not a readable ZIP (${e.message})`); }
  }
  const side = names.find((n) => n.endsWith("/interop/pages.json"));
  if (side) { try { JSON.parse(await zip.files[side].async("string")); } catch { problems.push("interop/pages.json is not valid JSON"); } }
  try { await loadStarNoteArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer); } catch (e: any) { problems.push(`the note does not load: ${e.message}`); }
  out(`${problems.length ? "FAIL" : "OK  "}  ${names.length} files, ${points} point streams (${segments} segments), ${shapeFiles} shape files`);
  for (const p of problems) out(`  - ${p}`);
  return problems.length ? 1 : 0;
}

async function cmdExport(file: string | undefined, format: string | undefined, output: string | undefined) {
  const doc = await load(file);
  const fmt = (format ?? "").toLowerCase();
  if (!["svg", "pdf", "json"].includes(fmt)) throw new UsageError("export needs --format svg, pdf or json");
  const target = output ?? `${basename(file!, extname(file!))}.${fmt}`;
  let data: string | Uint8Array;
  if (fmt === "svg") data = exportCanvasAsSvg(doc, [], { smoothLevel: 0.2, pressureSensitivity: 0.375 });
  else if (fmt === "pdf") data = await exportAnnotatedPdf(doc, doc.title);
  else data = JSON.stringify({ title: doc.title, id: doc.uuid, layout: doc.layout === "stack" ? "pages" : "canvas", pages: [...doc.tiles.values()].map((t, i) => ({ page: i + 1, tag: t.pageTag, ...sizeOfPage(t), template: t.template ?? "ruled", strokes: t.strokes.map((s) => ({ color: s.color, width: s.width, alpha: s.alpha ?? 1, points: s.points.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, p.pressure]) })), textBoxes: (t.textBoxes ?? []).map((b) => ({ text: b.text, color: b.color, fontSize: b.fontSize, rect: b.rect })) })) }, null, 2);
  if (target === "-") {
    if (typeof data !== "string") throw new UsageError("a PDF can't go to stdout: give -o <file>");
    return out(data);
  }
  await writeFile(target, data);
  warn(`wrote ${target}`);
}

async function cmdNew(values: { output?: string; title?: string; paper?: string; landscape?: boolean; template?: string; pages?: string }) {
  if (!values.output) throw new UsageError("new needs -o <file.note>");
  const paper = String(values.paper ?? "a4");
  if (!PAPERS.some((p) => p.id === paper)) throw new UsageError(`unknown paper "${paper}" (${PAPERS.map((p) => p.id).join(", ")})`);
  const template = String(values.template ?? "ruled") as PageTemplate;
  if (!TEMPLATES.some((t) => t.id === template)) throw new UsageError(`unknown template "${template}" (${TEMPLATES.map((t) => t.id).join(", ")})`);
  const count = Number(values.pages ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new UsageError("--pages must be a whole number from 1 to 500");
  const doc: StarNoteDocument = { uuid: crypto.randomUUID(), title: String(values.title ?? basename(values.output, extname(values.output))), tiles: new Map(), layout: "stack" };
  for (let i = 0; i < count; i++) { const tag = nextPageTag(doc); doc.tiles.set(tag, newPageTile(tag, pageFormat(paper, !!values.landscape, template))); }
  relayout(doc);
  await writeFile(values.output, await exportStarNoteArchive(doc, []));
  warn(`wrote ${values.output} (${count} page${count === 1 ? "" : "s"}, ${paper.toUpperCase()}${values.landscape ? " landscape" : ""}, ${template})`);
}

async function main(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" }, json: { type: "boolean" },
        format: { type: "string", short: "f" }, output: { type: "string", short: "o" },
        title: { type: "string" }, paper: { type: "string" }, landscape: { type: "boolean" }, template: { type: "string" }, pages: { type: "string" },
      },
    });
    const [command, file] = positionals;
    if (values.version) { out(pkg.version); return 0; }
    if (values.help || !command) { out(HELP); return command || values.help ? 0 : 2; }
    switch (command) {
      case "info": await cmdInfo(file, !!values.json); break;
      case "text": await cmdText(file, !!values.json); break;
      case "validate": return await cmdValidate(file);
      case "export": await cmdExport(file, values.format, values.output); break;
      case "new": await cmdNew(values); break;
      default: throw new UsageError(`unknown command "${command}"`);
    }
    return 0;
  } catch (e: any) {
    if (e instanceof UsageError || e?.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") { warn(`rea-starnote: ${e.message}\nTry: rea-starnote --help`); return 2; }
    if (e?.code === "ENOENT") { warn(`rea-starnote: no such file: ${e.path}`); return 1; }
    warn(`rea-starnote: ${e?.message ?? e}`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
