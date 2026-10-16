/**
 * Handwriting search: the ink of a note is cut into lines, each line goes to the platform's own recognizer, and the text that
 * comes back (with where it was written) is what "Find in note" searches. Recognizers: Windows' ink recognizer (Rust side,
 * `ink_recognize`), Google ML Kit on Android (`StarNoteAndroid.recognizeInk`). Linux and the browser have none: they find
 * typed text only. Nothing here touches the .note file.
 */
import { isDesktopApp, nativeInvoke } from "./net";

export interface Box { l: number; t: number; r: number; b: number }
/** A stroke in world coordinates. */
export interface InkStroke { points: { x: number; y: number }[] }
export interface InkLine { strokes: InkStroke[]; box: Box }
export interface InkHit { page: string; text: string; box: Box }
/** Lines of ink as [x, y] point lists, and a language tag ("ko", "en"); one answer (or null) per line. */
export type Recognizer = (lines: [number, number][][][], lang: string) => Promise<(string | null)[]>;

const boxOf = (pts: { x: number; y: number }[]): Box => {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of pts) { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); }
  return { l, t, r, b };
};
const union = (a: Box, b: Box): Box => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });

/**
 * Cuts ink into lines the way a reader would: strokes that overlap vertically belong to one line; a wide horizontal gap
 * (more than `gapFactor` line heights) starts a new piece, so two columns or a margin note are not glued together.
 * Dots and accents (tiny strokes) join the line they sit in or on.
 */
export function groupIntoLines(strokes: InkStroke[], gapFactor = 3): InkLine[] {
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
  const out: InkLine[] = [];
  for (const row of rows) {
    const h = Math.max(20, row.box.b - row.box.t);
    row.items.sort((a, b) => a.box.l - b.box.l);
    let cur: InkLine | null = null;
    for (const it of row.items) {
      if (cur && it.box.l - cur.box.r > gapFactor * h) { out.push(cur); cur = null; }
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

/** The platform's recognizer, or null where there is none (Linux, the browser). Tests can install `window.__fakeInk`. */
export function platformRecognizer(): Recognizer | null {
  const w = window as any;
  if (w.__fakeInk) return w.__fakeInk;
  if (w.StarNoteAndroid?.recognizeInk) return androidRecognizer;
  if (isDesktopApp() && /Windows/i.test(navigator.userAgent)) {
    return async (lines, lang) => nativeInvoke<(string | null)[]>("ink_recognize", { lines, lang });
  }
  return null;
}

let nextReq = 1;
const pending = new Map<number, { ok: (r: (string | null)[]) => void; fail: (e: Error) => void }>();
/** Android: the Kotlin side answers through window.__inkDone(id, json) (ML Kit works asynchronously, and may first fetch a model). */
const androidRecognizer: Recognizer = (lines, lang) => new Promise((resolve, reject) => {
  const w = window as any;
  w.__inkDone ??= (id: number, json: string) => { const p = pending.get(id); pending.delete(id); p?.ok(JSON.parse(json)); };
  w.__inkFail ??= (id: number, message: string) => { const p = pending.get(id); pending.delete(id); p?.fail(new Error(message)); };
  const id = nextReq++;
  pending.set(id, { ok: resolve, fail: reject });
  try { w.StarNoteAndroid.recognizeInk(id, JSON.stringify(lines), lang); } catch (e) { pending.delete(id); reject(e); }
});

/** The language to read handwriting in: the user's choice, else the device's language. */
export const inkLanguage = () => {
  try { const v = localStorage.getItem("sn.inklang"); if (v) return v; } catch { /* private mode */ }
  return /^ko/i.test(navigator.language) ? "ko" : "en";
};
