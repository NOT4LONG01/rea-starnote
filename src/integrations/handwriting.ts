/**
 * Handwriting search: the ink of a note is cut into lines, and an AI model (the user's OpenRouter connection, only when asked)
 * reads a picture of each page with its lines numbered; the text per line (with where it was written) is what "Find in note"
 * searches and what the AI assistant reads. No recognizer on the device (owner, 2026-10-19). Nothing here touches the .note file.
 */

export interface Box { l: number; t: number; r: number; b: number }
/** A stroke in world coordinates. */
export interface InkStroke { points: { x: number; y: number }[]; width?: number }
export interface InkLine { strokes: InkStroke[]; box: Box }
export interface InkHit { page: string; text: string; box: Box }

const boxOf = (pts: { x: number; y: number }[]): Box => {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of pts) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); }
  return { l, t, r, b };
};
const union = (a: Box, b: Box): Box => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });

/**
 * Cuts ink into lines the way a reader would: strokes that overlap vertically belong to one line; a wide horizontal gap
 * (more than `gapFactor` line heights) starts a new piece, so two columns or a margin note are not glued together.
 * Dots and accents (tiny strokes) join the line they sit in or on. Then a short row (superscripts, subscripts: under 0.7 of
 * the usual height) sitting just above or below a line joins the nearest one; this only merges, so it never adds lines.
 * ponytail: a line of very small writing within ~half a line of a normal one is merged into it too; compare scripts' x-range if that hurts.
 */
export function groupIntoLines(strokes: InkStroke[], gapFactor = 3, maxStrokes = 300): InkLine[] {
  const items = strokes.filter((s) => s.points.length).map((s) => ({ s, box: boxOf(s.points) }));
  const heights = items.map((i) => i.box.b - i.box.t).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] ?? 0;
  const small = (i: (typeof items)[number]) => Math.max(i.box.b - i.box.t, i.box.r - i.box.l) < 0.35 * typical;
  // full-size strokes make the lines; dots, accents and short marks then join the line they sit in, on or just above
  const mid = (i: (typeof items)[number]) => (i.box.t + i.box.b) / 2;
  const order = [...items.filter((i) => !small(i)).sort((a, b) => mid(a) - mid(b)), ...items.filter(small)];
  const rows: { box: Box; items: typeof items }[] = [];
  for (const it of order) {
    const m = mid(it), tiny = small(it);
    const fits = (r: (typeof rows)[number]) => {
      const h = r.box.b - r.box.t, overlap = Math.min(r.box.b, it.box.b) - Math.max(r.box.t, it.box.t);
      if (tiny) return m >= r.box.t - h * 0.6 && m <= r.box.b + h * 0.3 && it.box.r >= r.box.l - h && it.box.l <= r.box.r + h;
      return (m >= r.box.t - h * 0.15 && m <= r.box.b + h * 0.15) || overlap > 0.5 * Math.min(h, it.box.b - it.box.t);
    };
    const row = rows.find(fits);
    if (row) { row.items.push(it); row.box = union(row.box, it.box); } else rows.push({ box: { ...it.box }, items: [it] });
  }
  // short rows (x², a₁ written above or below the line) join the nearest normal line they touch, shortest first
  const height = (r: (typeof rows)[number]) => r.box.b - r.box.t;
  for (const r of [...rows].filter((r) => height(r) < 0.7 * typical).sort((a, b) => height(a) - height(b))) {
    const m = (r.box.t + r.box.b) / 2;
    const near = rows.filter((o) => o !== r && height(o) >= 0.7 * typical && m >= o.box.t - 0.6 * height(o) && m <= o.box.b + 0.6 * height(o)
      && r.box.r >= o.box.l - height(o) && r.box.l <= o.box.r + height(o));
    const away = (o: (typeof rows)[number]) => Math.max(0, o.box.t - m, m - o.box.b);
    const to = near.sort((a, b) => away(a) - away(b))[0];
    if (to) { to.items.push(...r.items); to.box = union(to.box, r.box); rows.splice(rows.indexOf(r), 1); }
  }
  const out: InkLine[] = [];
  for (const row of rows) {
    const h = Math.max(20, row.box.b - row.box.t);
    row.items.sort((a, b) => a.box.l - b.box.l);
    let cur: InkLine | null = null;
    for (const it of row.items) {
      // a new piece after a wide gap, or after maxStrokes (Windows' recognizer refuses very large inputs: ~1000 strokes fail)
      if (cur && (it.box.l - cur.box.r > gapFactor * h || cur.strokes.length >= maxStrokes)) { out.push(cur); cur = null; }
      if (!cur) cur = { strokes: [it.s], box: { ...it.box } };
      else { cur.strokes.push(it.s); cur.box = union(cur.box, it.box); }
    }
    if (cur) out.push(cur);
  }
  return out.sort((a, b) => a.box.t - b.box.t || a.box.l - b.box.l);
}

/** A cheap fingerprint of a page's ink: when it changes, the page is read again. */
export function inkSignature(strokes: InkStroke[]): string {
  let n = 0, sx = 0, sy = 0;
  for (const s of strokes) for (const p of s.points) { n++; sx += p.x; sy += p.y; }
  return `${strokes.length}:${n}:${Math.round(sx)}:${Math.round(sy)}`;
}

/** Text for matching: same Unicode form, lower case, no spaces (recognizers often split or join Korean words differently). */
export const normalize = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");

/**
 * Where `query` occurs in `text`, as fractions of the text's length (to narrow a hit to its part of the line).
 * Matching ignores case and spaces. Returns [] when it does not occur.
 */
export function findIn(text: string, query: string): { from: number; to: number }[] {
  const q = normalize(query);
  if (!q) return [];
  const chars = [...text.normalize("NFC")], kept: number[] = []; // index in the original of each kept (non-space) char
  let flat = "";
  chars.forEach((c, i) => { if (!/\s/.test(c)) { flat += c.toLowerCase(); kept.push(i); } });
  const out: { from: number; to: number }[] = [];
  for (let at = flat.indexOf(q); at >= 0; at = flat.indexOf(q, at + 1)) {
    out.push({ from: kept[at] / chars.length, to: (kept[at + q.length - 1] + 1) / chars.length });
  }
  return out;
}

/**
 * A page's ink drawn black on white with each line numbered in red at its left (what the AI is shown to read the page line
 * by line), as a PNG (base64, no prefix). The longest side is at most `maxPx`.
 */
export function numberedInkImage(lines: InkLine[], maxPx = 1600): string | null {
  if (!lines.length) return null;
  const all = lines.map((l) => l.box).reduce(union);
  const label = Math.max(28, ...lines.map((l) => (l.box.b - l.box.t) * 0.6)), pad = 24;
  const box = { l: all.l - label * 2.2 - pad, t: all.t - pad, r: all.r + pad, b: all.b + pad };
  const k = Math.min(1, maxPx / Math.max(box.r - box.l, box.b - box.t));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((box.r - box.l) * k)); c.height = Math.max(1, Math.round((box.b - box.t) * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.scale(k, k); g.translate(-box.l, -box.t);
  g.strokeStyle = "#000"; g.lineCap = "round"; g.lineJoin = "round";
  for (const line of lines) for (const st of line.strokes) {
    g.lineWidth = Math.max(2, st.width ?? 3);
    g.beginPath();
    st.points.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    if (st.points.length === 1) g.lineTo(st.points[0].x + 0.5, st.points[0].y);
    g.stroke();
  }
  g.fillStyle = "#d00"; g.font = `bold ${label}px sans-serif`; g.textBaseline = "middle";
  lines.forEach((line, i) => g.fillText(String(i + 1), box.l + pad / 2, (line.box.t + line.box.b) / 2));
  return c.toDataURL("image/png").split(",")[1] ?? null;
}

// ---------- PDF text: read from the PDF when it is imported (its pages become pictures), searched by Find, and the words a
// highlighter stroke covers count as highlighted. Kept by the app like the handwriting, never in the .note.

import type { PdfRun } from "../model/note-loader";
export type { PdfRun };

/** Runs on one baseline joined into lines, in reading order (a run is often a word or a fragment of a line). */
export function pdfLines(runs: PdfRun[]): { text: string; box: Box }[] {
  // first gather runs whose baselines nearly agree (a fragment may sit a hair lower), then read each line left to right
  const rows: PdfRun[][] = [];
  for (const r of [...runs].sort((a, b) => a.y + a.h - (b.y + b.h))) {
    const row = rows[rows.length - 1], base = row && row[0].y + row[0].h;
    if (row && Math.abs(r.y + r.h - base) < 0.5 * Math.min(r.h, row[0].h)) row.push(r); else rows.push([r]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = "", box: Box | null = null;
    for (const r of row) {
      if (box) text += r.x - box.r > 0.15 * r.h && !/\s$/.test(text) ? " " : "";
      text += r.s;
      box = box ? union(box, { l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h }) : { l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h };
    }
    return { text, box: box! };
  });
}

/** The words of runs, each with its share of the run's width (by character count: close enough for a mark). */
export function pdfWords(runs: PdfRun[]): { text: string; box: Box }[] {
  const out: { text: string; box: Box }[] = [];
  for (const r of runs) {
    const n = r.s.length || 1;
    for (const m of r.s.matchAll(/\S+/g)) {
      const from = m.index!, to = from + m[0].length;
      out.push({ text: m[0], box: { l: r.x + (r.w * from) / n, r: r.x + (r.w * to) / n, t: r.y, b: r.y + r.h } });
    }
  }
  return out;
}

/** The words (world boxes) a highlighter stroke covers: a word counts when the stroke passes within half its width of the
 * word's middle. One passage per stroke, in reading order. */
export function highlightedPassages(words: { text: string; box: Box }[], strokes: { points: { x: number; y: number }[]; width: number }[]): { text: string; box: Box }[] {
  const near = (cx: number, cy: number, s: (typeof strokes)[number]) => {
    const r = s.width / 2, p = s.points;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[i + 1] ?? a, dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      const k = len ? Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / len)) : 0;
      if (Math.hypot(cx - (a.x + k * dx), cy - (a.y + k * dy)) <= r) return true;
    }
    return false;
  };
  const out: { text: string; box: Box }[] = [];
  for (const s of strokes) {
    const hit = words.filter((w) => near((w.box.l + w.box.r) / 2, (w.box.t + w.box.b) / 2, s))
      .sort((a, b) => (Math.abs(a.box.t - b.box.t) < 0.5 * (a.box.b - a.box.t) ? a.box.l - b.box.l : a.box.t - b.box.t));
    if (hit.length) out.push({ text: hit.map((w) => w.text).join(" "), box: hit.map((w) => w.box).reduce(union) });
  }
  return out;
}
