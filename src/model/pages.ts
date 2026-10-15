import type { StarNoteDocument, ParsedTile } from "./note-loader";

/** What a page looks like underneath the ink. */
export type PageTemplate = "blank" | "ruled" | "grid" | "dots";

export const TEMPLATES: { id: PageTemplate; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "ruled", label: "Lined" },
  { id: "grid", label: "Grid" },
  { id: "dots", label: "Dotted" },
];

/**
 * Line / grid / dot spacing in page units (one unit = 1/7.07 mm). New notes use 52.5 (about 7.4 mm, 40 lines per 2100-unit
 * tile); all offered spacings divide 2100, so ruling lines up across tile seams (infinite canvas). Notes made
 * before spacing was recorded keep StarNote's own, much wider 86.81 (about 12 mm).
 */
export const DEFAULT_SPACING = 52.5;
export const LEGACY_SPACING = 86.81;
export const SPACINGS: { id: string; label: string; v: number }[] = [
  { id: "narrow", label: "Narrow", v: 42 },
  { id: "medium", label: "Medium", v: DEFAULT_SPACING },
  { id: "wide", label: "Wide", v: 70 },
];
export const spacingOf = (t: { spacing?: number }) => t.spacing ?? LEGACY_SPACING;

/**
 * Paper sizes in page units, portrait. One unit is 1/7.07 mm so that A4's long side is 2100, the size of a StarNote
 * tile; a page never exceeds one tile.
 */
export const PAPERS: { id: string; label: string; w: number; h: number }[] = [
  { id: "a4", label: "A4", w: 1485, h: 2100 },
  { id: "a5", label: "A5", w: 1046, h: 1485 },
  { id: "a6", label: "A6", w: 743, h: 1046 },
  { id: "b5", label: "B5", w: 1244, h: 1768 },
  { id: "letter", label: "Letter", w: 1527, h: 1976 },
  { id: "tablet", label: "Tablet 4:3", w: 1575, h: 2100 },
  { id: "slide", label: "Slide 16:9", w: 1181, h: 2100 },
  { id: "square", label: "Square", w: 1800, h: 1800 },
];

export interface PageFormat { w: number; h: number; template: PageTemplate; spacing?: number }

export const pageFormat = (paper: string, landscape: boolean, template: PageTemplate, spacing = DEFAULT_SPACING): PageFormat => {
  const p = PAPERS.find((x) => x.id === paper) ?? PAPERS[0];
  return landscape ? { w: p.h, h: p.w, template, spacing } : { w: p.w, h: p.h, template, spacing };
};

export const DEFAULT_FORMAT: PageFormat = pageFormat("a4", false, "ruled");

/** The two kinds of note: finite pages, or an infinite canvas. (A "notebook" is a folder of notes in the library.) */
export type NoteKind = "pages" | "infinite";

/** The preset a size belongs to (to fill the format dialog), or null for a custom size. */
export function paperOf(w: number, h: number): { paper: string; landscape: boolean } | null {
  for (const p of PAPERS) {
    if (Math.abs(p.w - w) < 2 && Math.abs(p.h - h) < 2) return { paper: p.id, landscape: false };
    if (Math.abs(p.h - w) < 2 && Math.abs(p.w - h) < 2) return { paper: p.id, landscape: true };
  }
  return null;
}

/** Gap between pages in the stack, in page units. */
export const PAGE_GAP = 80;

export const sidecarPath = (docUuid: string) => `${docUuid}/interop/pages.json`;

/** The grid cell a tag names, which is where real StarNote puts the tile. */
export function gridRectOf(tag: string) {
  const m = tag.match(/Page\[(-?\d+)-(-?\d+)\]/);
  const row = m ? parseInt(m[1], 10) : 0, col = m ? parseInt(m[2], 10) : 0;
  return { left: col * 2100, top: row * 2100, right: (col + 1) * 2100, bottom: (row + 1) * 2100 };
}

/** True when the tiles form one column Page[0-0] .. Page[n-1-0]: a note of pages, not a free-form canvas. */
export function isPageStack(tags: string[]): boolean {
  if (tags.length === 0) return false;
  const rows = tags.map((t) => t.match(/^Page\[(\d+)-0\]$/)?.[1]).map((r) => (r === undefined ? -1 : parseInt(r, 10))).sort((a, b) => a - b);
  return rows.every((r, i) => r === i);
}

/** An unused tag for a page added to the stack (the next row of column 0). */
export function nextPageTag(doc: StarNoteDocument): string {
  let row = 0;
  for (const tag of doc.tiles.keys()) {
    const m = tag.match(/^Page\[(\d+)-0\]$/);
    if (m) row = Math.max(row, parseInt(m[1], 10) + 1);
  }
  let tag = `Page[${row}-0]`;
  while (doc.tiles.has(tag) || doc.removedPages?.includes(tag)) tag = `Page[${++row}-0]`; // a deleted page's files live until the next save
  return tag;
}

/** The tile tag of the 2100-unit grid cell holding a world point (StarNote's own naming: Page[row-col]). */
export const cellTag = (x: number, y: number) => `Page[${Math.floor(y / 2100)}-${Math.floor(x / 2100)}]`;

/** A tile of an infinite canvas: the whole grid cell is the page. */
export function newCanvasTile(tag: string, template: PageTemplate, spacing: number): ParsedTile {
  const rect = gridRectOf(tag);
  return { pageTag: tag, rect, pageRect: { ...rect }, template, spacing, saved: false, strokes: [], textBoxes: [] };
}

export function newPageTile(tag: string, f: PageFormat): ParsedTile {
  return {
    pageTag: tag,
    rect: { left: 0, top: 0, right: 2100, bottom: 2100 },
    pageRect: { left: 0, top: 0, right: f.w, bottom: f.h },
    template: f.template,
    spacing: f.spacing ?? DEFAULT_SPACING,
    saved: false,
    strokes: [],
    textBoxes: [],
  };
}

export const sizeOfPage = (t: ParsedTile) => {
  const r = t.pageRect ?? t.rect;
  return { w: r.right - r.left, h: r.bottom - r.top };
};

/**
 * Stacks the pages top to bottom in the order of doc.tiles, centred on the widest page. A tile's own coordinate
 * frame moves with its page (strokes are stored relative to the tile), so nothing drawn has to change.
 */
export function relayout(doc: StarNoteDocument) {
  const tiles = [...doc.tiles.values()];
  const maxW = Math.max(1, ...tiles.map((t) => sizeOfPage(t).w));
  let y = 0;
  for (const t of tiles) {
    const { w, h } = sizeOfPage(t);
    const pr = t.pageRect ?? t.rect;
    const ox = pr.left - t.rect.left, oy = pr.top - t.rect.top; // where the page sits inside its tile (a PDF page is centred)
    const px = (maxW - w) / 2;
    t.rect = { left: px - ox, top: y - oy, right: px - ox + 2100, bottom: y - oy + 2100 };
    t.pageRect = { left: px, top: y, right: px + w, bottom: y + h };
    y += h + PAGE_GAP;
  }
}

/** What the sidecar file records: one entry per page, in order. */
export const sidecarOf = (doc: StarNoteDocument) => ({
  version: 1,
  ...(doc.infinite ? { layout: "canvas", template: doc.infinite.template, spacing: doc.infinite.spacing } : {}),
  pages: [...doc.tiles.values()].map((t) => ({ tag: t.pageTag, ...sizeOfPage(t), template: t.template ?? "ruled", ...(t.spacing ? { spacing: t.spacing } : {}) })),
});

/** Draws a page template (lines, grid or dots) over the page rectangle `pr`. Nothing for a blank page. */
export function drawPageTemplate(
  ctx: CanvasRenderingContext2D,
  kind: PageTemplate,
  pr: { left: number; top: number; right: number; bottom: number },
  style: { line: string; dot: string; lineWidth: number; dotRadius: number },
  step = LEGACY_SPACING,
  seamless = false // pages that continue into each other: ruling starts on the page's own top edge, so the seam has its line
) {
  if (kind === "blank") return;
  const y0 = seamless ? pr.top : pr.top + step, x0 = seamless ? pr.left : pr.left + step;
  if (kind === "dots") {
    ctx.fillStyle = style.dot;
    for (let y = y0; y < pr.bottom - (seamless ? 0 : step / 2); y += step) {
      for (let x = x0; x < pr.right - (seamless ? 0 : step / 2); x += step) { ctx.beginPath(); ctx.arc(x, y, style.dotRadius, 0, Math.PI * 2); ctx.fill(); }
    }
    return;
  }
  ctx.strokeStyle = style.line;
  ctx.lineWidth = style.lineWidth;
  ctx.beginPath();
  for (let y = y0; y < pr.bottom; y += step) { ctx.moveTo(pr.left, y); ctx.lineTo(pr.right, y); }
  if (kind === "grid") for (let x = x0; x < pr.right; x += step) { ctx.moveTo(x, pr.top); ctx.lineTo(x, pr.bottom); }
  ctx.stroke();
}
