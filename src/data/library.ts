import { StarNoteDocument, ParsedTile } from "../model/note-loader";
import { drawPageTemplate, spacingOf } from "../model/pages";
import { isMathText } from "../model/math";
import { interpolateStrokePoints, generateRibbonGeometry, renderStrokeToCanvas } from "../model/stroke-interpolator";

/** Metadata shown in the library grid. The .note bytes live in a separate store so listing stays cheap. */
export interface LibraryItem {
  id: string;
  title: string;
  kind: "note" | "pdf";
  created: number;
  modified: number;
  trashed: boolean;
  driveId?: string; // Google Drive file this note was opened from (enables Overwrite)
  zotero?: { attachmentKey: string; parentKey: string | null; title: string }; // Zotero attachment this PDF came from
  // Auto-sync bookkeeping (file in the app's "StarNote" Drive folder)
  syncId?: string;     // Drive file id
  syncRemote?: string; // Drive modifiedTime at the last sync
  syncLocal?: number;  // local `modified` at the last sync
  thumb?: string; // PNG data URL
}

const DB_NAME = "starnote-library";
const META = "meta";
const DATA = "data";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: "id" });
      req.result.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
    run<void>([META, DATA], "readwrite", (tx) => {
      tx.objectStore(META).delete(id);
      tx.objectStore(DATA).delete(id);
    }),
};

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
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const tile = coverTile(doc);
  const rect = tile?.pageRect ?? tile?.rect ?? { left: 0, top: 0, right: 2100, bottom: 2100 };
  const rw = rect.right - rect.left, rh = rect.bottom - rect.top;
  // Cover-fit the page into the card, anchored at the top-left like a paper preview.
  const k = Math.max(w / rw, h / rh);
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-rect.left, -rect.top);

  if (tile?.backgroundImage) {
    ctx.drawImage(tile.backgroundImage, rect.left, rect.top, rw, rh);
  } else {
    drawPageTemplate(ctx, tile?.template ?? "ruled", rect, { line: "#e3e6ea", dot: "#c5cad1", lineWidth: 3, dotRadius: 5.2 }, tile ? spacingOf(tile) : undefined);
  }

  if (tile) {
    ctx.translate(tile.rect.left, tile.rect.top); // strokes are tile-local
    for (const s of tile.strokes) {
      const smoothed = interpolateStrokePoints(s.points, { baseWidth: Math.max(s.width, 8), color: s.color, alpha: 1 }, 2);
      if (s.alpha !== undefined && s.alpha < 1) ctx.globalAlpha = s.alpha;
      renderStrokeToCanvas(ctx, generateRibbonGeometry(smoothed, s.color));
      ctx.globalAlpha = 1;
    }
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
