import { StarNoteDocument, ParsedTile, ParsedStroke, PdfRun } from "../model/note-loader";
import { drawPageTemplate, spacingOf } from "../model/pages";
import { isMathText } from "../model/math";
import { interpolateStrokePoints, generateRibbonGeometry, renderStrokeToCanvas } from "../model/stroke-interpolator";

/** Metadata shown in the library grid. The .note bytes live in a separate store so listing stays cheap. */
export interface LibraryItem {
  id: string;
  title: string;
  kind: "note" | "pdf" | "folder"; // a folder is a notebook: it holds notes and other folders (see folders.ts) and has no bytes
  parentId?: string; // the folder it is in (unset = top level)
  order?: number; // manual place among its siblings in a page list (unset = by creation time, see folders.ts)
  color?: string; // a notebook's or section's colour (#rrggbb)
  created: number;
  modified: number;
  trashed: boolean;
  driveId?: string; // Google Drive file this note was opened from (enables Overwrite)
  zotero?: { attachmentKey: string; parentKey: string | null; title: string }; // Zotero attachment this PDF came from
  // Auto-sync bookkeeping (file in the app's "StarNote" Drive folder)
  syncId?: string;     // Drive file id
  syncRemote?: string; // Drive modifiedTime at the last sync
  syncLocal?: number;  // local `modified` at the last sync
  syncParent?: string; // Drive folder it was in at the last sync (a move is a change of parent)
  thumb?: string; // PNG data URL
}

const DB_NAME = "starnote-library";
const META = "meta";
const DATA = "data";
const INK = "ink"; // recognized handwriting per note (handwriting search); rebuilt whenever it is missing

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const d = req.result, from = (e as IDBVersionChangeEvent).oldVersion;
      if (from < 1) { d.createObjectStore(META, { keyPath: "id" }); d.createObjectStore(DATA); }
      if (from < 2) d.createObjectStore(INK); // 2: handwriting search
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      if (req.error?.name !== "VersionError") return reject(req.error);
      // The library was upgraded by a newer build (1.1 adds stores; 1.0.x and 1.1 builds share one profile): open it as it
      // is. Newer builds only add stores, so everything this build needs is still there.
      const again = indexedDB.open(DB_NAME);
      again.onsuccess = () => resolve(again.result);
      again.onerror = () => reject(new Error("This library was made by a newer version of REA-StarNote. Update the app to open it."));
    };
  });
  return dbPromise;
}

function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(stores, mode);
        const req = fn(tx);
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const library = {
  list: () => run<LibraryItem[]>([META], "readonly", (tx) => tx.objectStore(META).getAll()),

  get: (id: string) => run<LibraryItem | undefined>([META], "readonly", (tx) => tx.objectStore(META).get(id)),

  getBytes: (id: string) => run<Uint8Array | undefined>([DATA], "readonly", (tx) => tx.objectStore(DATA).get(id)),

  /** Insert or replace an item; pass bytes only when the archive changed. */
  put: (item: LibraryItem, bytes?: Uint8Array) =>
    run<void>([META, DATA], "readwrite", (tx) => {
      tx.objectStore(META).put(item);
      if (bytes) tx.objectStore(DATA).put(bytes, item.id);
    }),

  /** Merge fields into the stored item (and optionally replace bytes) in ONE transaction, so a concurrent
   *  save and a sync can never overwrite each other's metadata. Resolves false if the item is gone. */
  update: (id: string, fields: Partial<LibraryItem>, bytes?: Uint8Array) =>
    db().then(
      (d) =>
        new Promise<boolean>((resolve, reject) => {
          const tx = d.transaction([META, DATA], "readwrite");
          const meta = tx.objectStore(META);
          let found = false;
          meta.get(id).onsuccess = (e) => {
            const cur = (e.target as IDBRequest<LibraryItem | undefined>).result;
            if (!cur) return;
            found = true;
            meta.put({ ...cur, ...fields });
            if (bytes) tx.objectStore(DATA).put(bytes, id);
          };
          tx.oncomplete = () => resolve(found);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    ),

  remove: (id: string) =>
    run<void>([META, DATA, INK], "readwrite", (tx) => {
      tx.objectStore(META).delete(id);
      tx.objectStore(DATA).delete(id);
      tx.objectStore(INK).delete(id);
      tx.objectStore(INK).delete(`pdf:${id}`);
    }),

  /** Recognized handwriting of a note: per page, its ink fingerprint and the lines read from it. */
  getInk: (id: string) => run<InkIndex | undefined>([INK], "readonly", (tx) => tx.objectStore(INK).get(id)),
  putInk: (id: string, index: InkIndex) => run<void>([INK], "readwrite", (tx) => { tx.objectStore(INK).put(index, id); }),
  /** An imported PDF's text layer per page tag (its pages are pictures in the note). Only on this device: it is read at import. */
  getPdfText: (id: string) => run<Record<string, PdfRun[]> | undefined>([INK], "readonly", (tx) => tx.objectStore(INK).get(`pdf:${id}`)),
  putPdfText: (id: string, pages: Record<string, PdfRun[]>) => run<void>([INK], "readwrite", (tx) => { tx.objectStore(INK).put(pages, `pdf:${id}`); }),
};

export interface InkIndex {
  lang: string;
  pages: Record<string, { sig: string; lines: { text: string; lang?: string; box: { l: number; t: number; r: number; b: number } }[] }>;
}

/** The tile shown on the card: origin page when present, else the busiest page. */
function coverTile(doc: StarNoteDocument): ParsedTile | undefined {
  if (doc.layout === "stack") return doc.tiles.values().next().value; // the first page is the cover
  const origin = doc.tiles.get("Page[0-0]");
  if (origin && (origin.strokes.length || origin.textBoxes?.length || origin.backgroundImage)) return origin;
  let best: ParsedTile | undefined;
  let bestScore = -1;
  for (const t of doc.tiles.values()) {
    const score = t.strokes.length + (t.textBoxes?.length ?? 0) + (t.backgroundImage ? 1000 : 0);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best ?? origin;
}

/** Renders the cover page to a small PNG data URL (3:4 card). */
export function renderThumbnail(doc: StarNoteDocument, w = 300, h = 400): string {
  const tile = coverTile(doc);
  const rect = tile?.pageRect ?? tile?.rect ?? { left: 0, top: 0, right: 2100, bottom: 2100 };
  // Cover-fit the page into the card, anchored at the top-left like a paper preview.
  return paint(w, h, Math.max(w / (rect.right - rect.left), h / (rect.bottom - rect.top)), rect, tile, []);
}

/**
 * One whole page at `width` px (height from the page's own shape), for the editor's page browser. `extra` are strokes drawn
 * since the last save, in world coordinates (the ones on this page are included).
 */
export function renderPageThumbnail(tile: ParsedTile, width: number, extra: ParsedStroke[] = []): string {
  const rect = tile.pageRect ?? tile.rect;
  const k = width / (rect.right - rect.left);
  const onPage = extra.filter((s) => s.points.some((p) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom));
  return paint(Math.round(width), Math.round((rect.bottom - rect.top) * k), k, rect, tile, onPage);
}

function paint(w: number, h: number, k: number, rect: { left: number; top: number; right: number; bottom: number }, tile: ParsedTile | undefined, worldStrokes: ParsedStroke[]): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const rw = rect.right - rect.left, rh = rect.bottom - rect.top;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-rect.left, -rect.top);
  ctx.beginPath(); ctx.rect(rect.left, rect.top, rw, rh); ctx.clip(); // nothing outside the page

  if (tile?.backgroundImage) {
    ctx.drawImage(tile.backgroundImage, rect.left, rect.top, rw, rh);
  } else {
    drawPageTemplate(ctx, tile?.template ?? "ruled", rect, { line: "#e3e6ea", dot: "#c5cad1", lineWidth: 3, dotRadius: 5.2 }, tile ? spacingOf(tile) : undefined);
  }
  const stroke = (s: ParsedStroke) => {
    const smoothed = interpolateStrokePoints(s.points, { baseWidth: Math.max(s.width, 8), color: s.color, alpha: 1 }, 2);
    if (s.alpha !== undefined && s.alpha < 1) ctx.globalAlpha = s.alpha;
    renderStrokeToCanvas(ctx, generateRibbonGeometry(smoothed, s.color));
    ctx.globalAlpha = 1;
  };
  for (const s of worldStrokes) stroke(s);
  if (tile) {
    ctx.translate(tile.rect.left, tile.rect.top); // saved strokes and text are tile-local
    for (const s of tile.strokes) stroke(s);
    for (const tb of tile.textBoxes ?? []) {
      if (isMathText(tb.text)) { // a formula is not typeset here: a soft block of its size, not its LaTeX source
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.fillRect(tb.rect.left, tb.rect.top, tb.rect.right - tb.rect.left, tb.rect.bottom - tb.rect.top);
        continue;
      }
      ctx.fillStyle = tb.color;
      const fs = Math.max(16, tb.fontSize);
      ctx.font = `${tb.isItalic ? "italic " : ""}${tb.isBold ? "bold " : ""}${fs}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      tb.text.split("\n").forEach((line, i) => ctx.fillText(line, tb.rect.left, tb.rect.top + i * fs * 1.25));
    }
  }
  ctx.restore();
  return c.toDataURL("image/png");
}
