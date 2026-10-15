import type { StarNoteDocument, ParsedTile, ParsedStroke } from "./note-loader";
import { interpolateStrokePoints, generateRibbonGeometry } from "./stroke-interpolator";
import { TEMPLATE_SPACING } from "./pages";

/**
 * Annotated-PDF export: one PDF page per note page. The page background (a PDF page image or ruled paper) is drawn first,
 * then every stroke as a filled vector shape (crisp at any zoom), then typed text boxes.
 * Dependency-free writer: JPEG backgrounds, Helvetica text, Flate-compressed page contents (CompressionStream; plain
 * streams where the runtime lacks it).
 */

export interface EncodedImage { bytes: Uint8Array; width: number; height: number }
export interface PdfExportOptions {
  /** Turns a page background into JPEG bytes. Default: browser canvas (downscaled to 2480 px wide, quality 0.85). */
  encodeImage?: (src: NonNullable<ParsedTile["backgroundImage"]>) => Promise<EncodedImage>;
}

const PAGE_W = 595.28; // A4 width in PDF points; height follows the page's own aspect ratio

async function browserEncodeJpeg(src: NonNullable<ParsedTile["backgroundImage"]>): Promise<EncodedImage> {
  const s = src as any;
  const sw: number = s.naturalWidth ?? s.width, sh: number = s.naturalHeight ?? s.height;
  const k = Math.min(1, 2480 / sw);
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG has no alpha
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("could not encode the page image");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
}

/** zlib-compress (PDF /FlateDecode). Returns null where CompressionStream does not exist. */
async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Pages worth exporting, in reading order. A note with nothing on it exports one blank page. */
function selectPages(doc: StarNoteDocument): ParsedTile[] {
  if (doc.layout === "stack") return [...doc.tiles.values()]; // a notebook keeps its blank pages, in page order
  const used = [...doc.tiles.values()].filter((t) => t.strokes.length || t.textBoxes?.length || t.backgroundImage);
  used.sort((a, b) => (a.pageRect ?? a.rect).top - (b.pageRect ?? b.rect).top || (a.pageRect ?? a.rect).left - (b.pageRect ?? b.rect).left);
  if (used.length) return used;
  return [{ pageTag: "Page[0-0]", rect: { left: 0, top: 0, right: 2100, bottom: 2100 }, strokes: [] }];
}

/** PDF operators for a page template: ruled lines, grid, or dots (dots are zero-length dashes with round caps). */
function templateOps(kind: string, pr: { left: number; top: number; right: number; bottom: number }, k: number, H: number): string {
  if (kind === "blank") return "";
  const step = TEMPLATE_SPACING * k, w = (pr.right - pr.left) * k, h = (pr.bottom - pr.top) * k;
  let ops = "";
  if (kind === "dots") {
    ops += `0.8 0.84 0.88 RG 1 J ${num(3.2 * k * 1.6)} w [0 ${num(step)}] ${num(0)} d\n`;
    for (let y = step; y < h - step / 2; y += step) ops += `${num(step)} ${num(H - y)} m ${num(w - step / 2)} ${num(H - y)} l S\n`;
    return ops + "[] 0 d 0 J\n";
  }
  ops += "0.89 0.9 0.92 RG 0.5 w\n";
  for (let y = step; y < h; y += step) ops += `0 ${num(H - y)} m ${num(w)} ${num(H - y)} l S\n`;
  if (kind === "grid") for (let x = step; x < w; x += step) ops += `${num(x)} 0 m ${num(x)} ${num(H)} l S\n`;
  return ops;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

function rgb(color: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(color);
  const v = m ? parseInt(m[1], 16) : 0;
  return `${num(((v >> 16) & 255) / 255)} ${num(((v >> 8) & 255) / 255)} ${num((v & 255) / 255)}`;
}

/** WinAnsi-safe literal string for Helvetica; characters outside Latin-1 become "?". */
function pdfString(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += "\\" + ch;
    else if (c < 32 || c > 255) out += "?";
    else if (c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += ch;
  }
  return out;
}

/** Opacity states a page needs: /GS<n> in its resources. */
const gsName = (alpha: number) => `GS${Math.round(alpha * 100)}`;

function strokePath(stroke: ParsedStroke, toX: (x: number) => number, toY: (y: number) => number, alphas: Set<number>): string {
  const brush = { baseWidth: stroke.width, color: stroke.color, alpha: stroke.alpha ?? 1, pressureSensitivity: stroke.sens ?? 0.375, smoothLevel: 0.2 };
  const smoothed = interpolateStrokePoints(stroke.points, brush, 4);
  if (smoothed.length === 0) return "";
  const translucent = stroke.alpha !== undefined && stroke.alpha < 1;
  if (translucent) alphas.add(stroke.alpha!);
  const fill = `${translucent ? `q /${gsName(stroke.alpha!)} gs ` : ""}${rgb(stroke.color)} rg\n`;
  const end = translucent ? "Q\n" : "";
  if (smoothed.length === 1) { // a tap: a filled circle (4 Bezier arcs)
    const p = smoothed[0], r = Math.max(0.3, (p.width / 2) * (toX(1) - toX(0))), cx = toX(p.x), cy = toY(p.y), c = 0.5523 * r;
    return `${fill}${num(cx + r)} ${num(cy)} m ${num(cx + r)} ${num(cy + c)} ${num(cx + c)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c ` +
      `${num(cx - c)} ${num(cy + r)} ${num(cx - r)} ${num(cy + c)} ${num(cx - r)} ${num(cy)} c ` +
      `${num(cx - r)} ${num(cy - c)} ${num(cx - c)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c ` +
      `${num(cx + c)} ${num(cy - r)} ${num(cx + r)} ${num(cy - c)} ${num(cx + r)} ${num(cy)} c f\n${end}`;
  }
  const ribbon = generateRibbonGeometry(smoothed, stroke.color);
  if (ribbon.leftPoints.length === 0 || ribbon.rightPoints.length === 0) return "";
  const pts = [...ribbon.leftPoints, ...[...ribbon.rightPoints].reverse()];
  let d = `${num(toX(pts[0][0]))} ${num(toY(pts[0][1]))} m`;
  for (let i = 1; i < pts.length; i++) d += ` ${num(toX(pts[i][0]))} ${num(toY(pts[i][1]))} l`;
  return `${fill}${d} h f\n${end}`;
}

export async function exportAnnotatedPdf(doc: StarNoteDocument, title: string, opts: PdfExportOptions = {}): Promise<Uint8Array> {
  const encode = opts.encodeImage ?? browserEncodeJpeg;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (u: Uint8Array) => { chunks.push(u); size += u.length; };
  const text = (s: string) => push(enc.encode(s));
  const beginObj = (n: number) => { offsets[n] = size; text(`${n} 0 obj\n`); };

  const pages = selectPages(doc);
  // object numbers: 1 catalog, 2 pages, 3 font, 4 info, then per page: page, content, [image]
  let next = 5;
  const layout = pages.map(() => ({ page: next++, content: next++, image: 0 }));
  const images: (EncodedImage | null)[] = [];
  for (let i = 0; i < pages.length; i++) {
    const bg = pages[i].backgroundImage;
    const img = bg ? await encode(bg) : null;
    images.push(img);
    if (img) layout[i].image = next++;
  }
  const total = next; // objects are 1 .. total-1

  text("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  beginObj(1); text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObj(2); text(`<< /Type /Pages /Count ${pages.length} /Kids [${layout.map((l) => `${l.page} 0 R`).join(" ")}] >>\nendobj\n`);
  beginObj(3); text("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");
  beginObj(4); text(`<< /Title (${pdfString(title)}) /Producer (rea-starnote) >>\nendobj\n`);

  for (let i = 0; i < pages.length; i++) {
    const tile = pages[i];
    const pr = tile.pageRect ?? tile.rect;
    const k = PAGE_W / (pr.right - pr.left);
    const H = (pr.bottom - pr.top) * k;
    // tile-local -> PDF points (origin bottom-left)
    const toX = (x: number) => (tile.rect.left + x - pr.left) * k;
    const toY = (y: number) => H - (tile.rect.top + y - pr.top) * k;

    const alphas = new Set<number>();
    let ops = "";
    if (images[i]) {
      ops += `q ${num(PAGE_W)} 0 0 ${num(H)} 0 0 cm /Im0 Do Q\n`;
    } else {
      ops += `1 1 1 rg 0 0 ${num(PAGE_W)} ${num(H)} re f\n${templateOps(tile.template ?? "ruled", pr, k, H)}`;
    }
    for (const s of tile.strokes) ops += strokePath(s, (x) => toX(x), (y) => toY(y), alphas);
    for (const tb of tile.textBoxes ?? []) {
      const fs = Math.max(8, tb.fontSize) * k;
      let y = toY(tb.rect.top) - fs;
      ops += `BT /F1 ${num(fs)} Tf ${rgb(tb.color)} rg\n`;
      for (const line of tb.text.split("\n")) {
        if (line.trim()) ops += `1 0 0 1 ${num(toX(tb.rect.left))} ${num(y)} Tm (${pdfString(line)}) Tj\n`;
        y -= fs * 1.25;
      }
      ops += "ET\n";
    }

    const l = layout[i];
    const raw = enc.encode(ops);
    const packed = await deflate(raw);
    const content = packed && packed.length < raw.length ? packed : raw;
    const filter = content === raw ? "" : " /Filter /FlateDecode";
    beginObj(l.page);
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(H)}] /Contents ${l.content} 0 R /Resources << /Font << /F1 3 0 R >>${alphas.size ? ` /ExtGState << ${[...alphas].map((a) => `/${gsName(a)} << /ca ${num(a)} /CA ${num(a)} >>`).join(" ")} >>` : ""}${l.image ? ` /XObject << /Im0 ${l.image} 0 R >>` : ""} >> >>\nendobj\n`);
    beginObj(l.content);
    text(`<< /Length ${content.length}${filter} >>\nstream\n`); push(content); text("\nendstream\nendobj\n");
    const img = images[i];
    if (img) {
      beginObj(l.image);
      text(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes); text("\nendstream\nendobj\n");
    }
  }

  const xref = size;
  text(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) text(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${total} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** A file name that is valid on Windows, macOS and Linux. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "note";
}
