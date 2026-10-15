import { isPageStack, relayout, sidecarPath, PageTemplate, TEMPLATES } from "./pages";
import JSZip from "jszip";
import { parseStarNotePointsBinary, RawStrokePoint } from "./stroke-interpolator";

/** Largest rect with the image's aspect that fits inside the tile, centred (keeps PDF pages undistorted). */
export function fitPageRect(
  tile: { left: number; top: number; right: number; bottom: number },
  imgW: number,
  imgH: number
) {
  const tw = tile.right - tile.left, th = tile.bottom - tile.top;
  const k = Math.min(tw / imgW, th / imgH);
  const w = imgW * k, h = imgH * k;
  const left = tile.left + (tw - w) / 2, top = tile.top + (th - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

export interface ParsedTextBox {
  /** Tile the box lives on, and whether the archive already holds it (false while it is new). */
  tag?: string;
  saved?: boolean;
  shapeUuid: string;
  text: string;
  color: string;
  fontSize: number;
  rect: { left: number; top: number; right: number; bottom: number };
  isBold?: boolean;
  isItalic?: boolean;
}

export interface ParsedTile {
  pageTag: string;     // e.g. "Page[0-0]", "Page[-5--1]"
  rect: { left: number; top: number; right: number; bottom: number };
  strokes: ParsedStroke[];
  textBoxes?: ParsedTextBox[];
  backgroundImage?: HTMLCanvasElement | ImageBitmap | HTMLImageElement;
  /** Real page area (world coords) when a background image has a different aspect than the square tile. */
  pageRect?: { left: number; top: number; right: number; bottom: number };
  /** What is printed on the page (unset = StarNote's own ruled lines). */
  template?: PageTemplate;
  /** False for a page added since the last save (it has nothing in the archive to delete). */
  saved?: boolean;
}

export interface ParsedStroke {
  shapeUuid: string;
  parentUuid: string;
  color: string;
  width: number;
  durationMs: number;
  points: RawStrokePoint[];
  /** Ink opacity (default 1) and pressure sensitivity (default: the viewer's setting); saved in the shape's brush JSON. */
  alpha?: number;
  sens?: number;
  /** Pen type id, only while editing (not saved). */
  pen?: string;
  /** Where a saved stroke lives in the archive (point file + segment index): lets the exporter delete it. */
  src?: { tag: string; file: string; seg: number };
}

export interface StarNoteDocument {
  uuid: string;
  title: string;
  tiles: Map<string, ParsedTile>;
  rawZip?: JSZip; // Preserved raw ZIP archive to prevent lossy export
  /** Saved strokes erased since the last save: still in rawZip until the exporter deletes them. */
  removedStrokes?: ParsedStroke[];
  /** Text boxes created / deleted since the last save (a changed box is one of each). */
  addedTextBoxes?: ParsedTextBox[];
  removedTextBoxes?: ParsedTextBox[];
  isPdfImport?: boolean;
  /** "stack": finite pages one under the other (managed: add, delete, reorder). Unset: StarNote's free-form canvas of tiles. */
  layout?: "stack";
  /** Pages deleted since the last save (their files are still in rawZip). */
  removedPages?: string[];
  /** Page order, size or template changed since the last save. */
  pagesChanged?: boolean;
}

/**
 * Parses Protobuf varint from Uint8Array.
 */
function readVarint(bytes: Uint8Array, offset: { val: number }): bigint {
  let res = 0n, shift = 0n;
  while (offset.val < bytes.length) {
    const b = bytes[offset.val++];
    res |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return res;
}

/** String subfields of note_info's message (6 = title, 12 = page info JSON, 20 = page names JSON). */
function noteInfoStrings(bytes: Uint8Array): Map<number, string> {
  const out = new Map<number, string>();
  const off = { val: 0 };
  try {
    const key = readVarint(bytes, off);
    if (Number(key >> 3n) !== 1 || Number(key & 7n) !== 2) return out;
    const end = off.val + Number(readVarint(bytes, off));
    while (off.val < end) {
      const k = readVarint(bytes, off), f = Number(k >> 3n), w = Number(k & 7n);
      if (w === 0) readVarint(bytes, off);
      else if (w === 2) {
        const l = Number(readVarint(bytes, off));
        out.set(f, new TextDecoder("utf-8").decode(bytes.subarray(off.val, off.val + l)));
        off.val += l;
      } else if (w === 5) off.val += 4;
      else if (w === 1) off.val += 8;
      else break;
    }
  } catch { /* a note without readable page info keeps square pages */ }
  return out;
}

/**
 * Extracts title from note/pb/note_info Protobuf structure.
 * Message: Field 1 (len) -> Subfield 6 (string title).
 */
function extractTitleFromNoteInfo(bytes: Uint8Array): string | null {
  const off = { val: 0 };
  try {
    const key = readVarint(bytes, off);
    const fNum = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (fNum !== 1 || wire !== 2) return null;

    const len = Number(readVarint(bytes, off));
    const end = off.val + len;

    while (off.val < end) {
      const subKey = readVarint(bytes, off);
      const subF = Number(subKey >> 3n);
      const subW = Number(subKey & 7n);

      if (subW === 0) {
        readVarint(bytes, off);
      } else if (subW === 2) {
        const strLen = Number(readVarint(bytes, off));
        const strBytes = bytes.subarray(off.val, off.val + strLen);
        off.val += strLen;
        if (subF === 6) {
          const title = new TextDecoder("utf-8").decode(strBytes).trim();
          if (title.length > 0) return title;
        }
      } else if (subW === 5) {
        off.val += 4;
      } else if (subW === 1) {
        off.val += 8;
      } else {
        break;
      }
    }
  } catch (e) {
    console.warn("Could not parse title from note_info protobuf:", e);
  }
  return null;
}

interface ShapeMeta { color: string; width: number; shapeType: number; alpha?: number; sens?: number }

interface ShapeIndexResult {
  shapeMap: Map<string, ShapeMeta>;
  textBoxesByTile: Map<string, ParsedTextBox[]>;
}

/**
 * Indexes shape records from shape/*.zip to recover true stroke colors, widths, and rich text boxes.
 */
async function indexShapesFromZip(zip: JSZip): Promise<ShapeIndexResult> {
  const shapeMap = new Map<string, ShapeMeta>();
  const textBoxesByTile = new Map<string, ParsedTextBox[]>();

  for (const [filepath, fileEntry] of Object.entries(zip.files)) {
    if (!filepath.includes("/shape/") || !filepath.endsWith(".zip") || fileEntry.dir) continue;

    const tileTagMatch = filepath.match(/(Page\[[0-9\-]+\])/);
    const tileTag = tileTagMatch ? tileTagMatch[1] : "";

    try {
      const innerZipBytes = await fileEntry.async("uint8array");
      const innerZip = await JSZip.loadAsync(innerZipBytes);
      const innerFile = Object.values(innerZip.files)[0];
      if (!innerFile) continue;

      const pbBytes = await innerFile.async("uint8array");
      const off = { val: 0 };

      while (off.val < pbBytes.length) {
        const key = readVarint(pbBytes, off);
        const wire = Number(key & 7n);
        if (wire !== 2) break;

        const recordLen = Number(readVarint(pbBytes, off));
        const recordEnd = off.val + recordLen;

        let shapeUuid = "";
        let linkUuid = "";
        let shapeType = 0;
        let colorHex = "#000000";
        let width = 3.5;
        let f7Json = "";
        let f9Json = "";
        let f10Text = "";
        let f11Json = "";
        let f22Html = "";

        while (off.val < recordEnd) {
          const subKey = readVarint(pbBytes, off);
          const f = Number(subKey >> 3n);
          const w = Number(subKey & 7n);

          if (w === 0) {
            const v = readVarint(pbBytes, off);
            if (f === 4) {
              const rgb = Number(v & 0xffffffn);
              colorHex = "#" + rgb.toString(16).padStart(6, "0");
            } else if (f === 12) {
              shapeType = Number(v);
            }
          } else if (w === 2) {
            const l = Number(readVarint(pbBytes, off));
            const strBytes = pbBytes.subarray(off.val, off.val + l);
            off.val += l;
            const textVal = new TextDecoder("utf-8").decode(strBytes);
            if (f === 1) shapeUuid = textVal.trim();
            else if (f === 16) linkUuid = textVal.trim();
            else if (f === 7) f7Json = textVal;
            else if (f === 9) f9Json = textVal;
            else if (f === 10) f10Text = textVal;
            else if (f === 11) f11Json = textVal;
            else if (f === 22) f22Html = textVal;
          } else if (w === 5) {
            if (f === 5) {
              const b = pbBytes.subarray(off.val, off.val + 4);
              width = new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);
            }
            off.val += 4;
          } else if (w === 1) {
            off.val += 8;
          } else {
            break;
          }
        }

        let alpha: number | undefined, sens: number | undefined;
        if (f11Json) {
          try { // brush parameters: alphaFactor = ink opacity
            const b = JSON.parse(f11Json);
            if (typeof b.alphaFactor === "number") alpha = b.alphaFactor;
            if (typeof b.pressureSensitivity === "number") sens = b.pressureSensitivity;
          } catch {}
        }
        if (shapeUuid) shapeMap.set(shapeUuid, { color: colorHex, width, shapeType, alpha, sens });
        if (linkUuid) shapeMap.set(linkUuid, { color: colorHex, width, shapeType, alpha, sens });

        // Recover Type 16 Text Boxes
        if (shapeType === 16 && tileTag) {
          let text = "";
          if (f10Text) {
            text = f10Text.trim();
            if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) { // StarNote stores the text as a JSON string
              try { text = JSON.parse(text); } catch { text = text.slice(1, -1); }
            }
          } else if (f22Html) {
            text = f22Html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          }

          if (text.length > 0) {
            let rect = { left: 0, top: 0, right: 0, bottom: 0 };
            if (f7Json) {
              try {
                const b = JSON.parse(f7Json);
                rect = {
                  left: Number(b.left || 0),
                  top: Number(b.top || 0),
                  right: Number(b.right || 0),
                  bottom: Number(b.bottom || 0),
                };
              } catch {}
            }

            let fontSize = 32;
            let isBold = false;
            let isItalic = false;
            if (f9Json) {
              try {
                const typo = JSON.parse(f9Json);
                if (typo.textSize) fontSize = Number(typo.textSize);
                if (typo.isTextBold) isBold = Boolean(typo.isTextBold);
                if (typo.isTextItalic) isItalic = Boolean(typo.isTextItalic);
              } catch {}
            }

            if (!textBoxesByTile.has(tileTag)) {
              textBoxesByTile.set(tileTag, []);
            }
            textBoxesByTile.get(tileTag)!.push({
              tag: tileTag,
              saved: true,
              shapeUuid,
              text,
              color: colorHex,
              fontSize,
              rect,
              isBold,
              isItalic,
            });
          }
        }
      }
    } catch (err) {
      console.warn("Could not index shapes from", filepath, err);
    }
  }

  return { shapeMap, textBoxesByTile };
}

/**
 * A note whose tiles form one column of pages becomes a stack: finite pages in order, with the sizes and templates
 * recorded in note_info (native) and in our sidecar. Anything else stays StarNote's free-form canvas.
 */
async function applyPageLayout(doc: StarNoteDocument, info: Map<number, string>) {
  const sidecarFile = doc.rawZip?.file(sidecarPath(doc.uuid));
  let side: { pages?: { tag: string; w: number; h: number; template: string }[] } | null = null;
  if (sidecarFile) { try { side = JSON.parse(await sidecarFile.async("string")); } catch { side = null; } }
  if (!side && !isPageStack([...doc.tiles.keys()])) return; // free-form canvas

  let infoMap: Record<string, { width?: number; height?: number }> = {};
  try { infoMap = JSON.parse(info.get(12) ?? "{}").pageInfoMap ?? {}; } catch { /* square pages */ }
  const row = (t: string) => parseInt(t.match(/Page\[(-?\d+)-/)?.[1] ?? "0", 10);
  const order = side?.pages?.map((p) => p.tag).filter((t) => doc.tiles.has(t)) ?? [];
  const rest = [...doc.tiles.keys()].filter((t) => !order.includes(t)).sort((a, b) => row(a) - row(b));
  const sorted = new Map<string, ParsedTile>();
  for (const tag of [...order, ...rest]) {
    const tile = doc.tiles.get(tag)!;
    const meta = side?.pages?.find((p) => p.tag === tag);
    if (!tile.backgroundImage || !tile.pageRect) { // a PDF page keeps the size of its image
      const w = meta?.w ?? infoMap[tag]?.width ?? 2100, h = meta?.h ?? infoMap[tag]?.height ?? 2100;
      tile.pageRect = { left: tile.rect.left, top: tile.rect.top, right: tile.rect.left + Math.min(2100, w), bottom: tile.rect.top + Math.min(2100, h) };
    }
    if (meta && TEMPLATES.some((t) => t.id === meta.template)) tile.template = meta.template as PageTemplate;
    sorted.set(tag, tile);
  }
  doc.tiles = sorted;
  doc.layout = "stack";
  relayout(doc);
}

/**
 * Loads and unpacks a .note file buffer into an in-memory document tree.
 * Preserves the raw ZIP archive reference for non-destructive saving.
 */
export async function loadStarNoteArchive(fileData: ArrayBuffer): Promise<StarNoteDocument> {
  const zip = await JSZip.loadAsync(fileData);

  // 1. Discover root document UUID
  let docUuid = "";
  for (const filename of Object.keys(zip.files)) {
    const parts = filename.split("/");
    if (parts.length > 1 && parts[0].length === 36 && parts[0].includes("-")) {
      docUuid = parts[0];
      break;
    }
  }

  if (!docUuid) {
    throw new Error("Invalid StarNote archive: root document UUID directory not found.");
  }

  const tiles = new Map<string, ParsedTile>();

  function parseTileRect(tag: string) {
    const coordMatch = tag.match(/Page\[(-?\d+)-(-?\d+)\]/);
    let left = 0, top = 0;
    if (coordMatch) {
      const row = parseInt(coordMatch[1], 10);
      const col = parseInt(coordMatch[2], 10);
      left = col * 2100.0;
      top = row * 2100.0;
    }
    return { left, top, right: left + 2100.0, bottom: top + 2100.0 };
  }

  function getOrCreateTile(tag: string): ParsedTile {
    let t = tiles.get(tag);
    if (!t) {
      t = {
        pageTag: tag,
        rect: parseTileRect(tag),
        strokes: [],
        textBoxes: [],
      };
      tiles.set(tag, t);
    }
    return t;
  }

  // Discover registered tiles from virtual/page/pb
  for (const [filepath, fileEntry] of Object.entries(zip.files)) {
    if (filepath.includes("/virtual/page/pb/") && !fileEntry.dir) {
      try {
        const b = await fileEntry.async("uint8array");
        const text = new TextDecoder("utf-8").decode(b);
        const matches = text.matchAll(/Page\[(-?\d+)-(-?\d+)\]/g);
        for (const m of matches) {
          getOrCreateTile(m[0]);
        }
      } catch {}
    }
  }

  // Discover registered tiles from resource/image/
  const resourceImgRegex = new RegExp(`^${docUuid}/resource/image/(Page\\[[0-9\\-]+\\])\\.png$`);
  for (const filepath of Object.keys(zip.files)) {
    const m = filepath.match(resourceImgRegex);
    if (m) {
      getOrCreateTile(m[1]);
    }
  }

  // 2. Load note_info metadata to extract authentic title
  let title = "StarNote Document";
  const noteInfoFile = zip.file(`${docUuid}/note/pb/note_info`);
  if (noteInfoFile) {
    const rawNoteInfo = await noteInfoFile.async("uint8array");
    const extractedTitle = extractTitleFromNoteInfo(rawNoteInfo);
    if (extractedTitle) {
      title = extractedTitle;
    }
  }

  // 3. Index shape attributes and text boxes from shape/*.zip
  const { shapeMap, textBoxesByTile } = await indexShapesFromZip(zip);

  for (const [tag, boxes] of textBoxesByTile.entries()) {
    const tile = getOrCreateTile(tag);
    if (!tile.textBoxes) tile.textBoxes = [];
    tile.textBoxes.push(...boxes);
  }

  // 4. Scan all #points files and parse all segments
  const pointFileRegex = new RegExp(`^${docUuid}/point/(Page\\[[0-9\\-]+\\])/(.+)#points$`);

  for (const [filepath, fileEntry] of Object.entries(zip.files)) {
    const match = filepath.match(pointFileRegex);
    if (!match || fileEntry.dir) continue;

    const pageTag = match[1];
    const rawBuffer = await fileEntry.async("uint8array");

    try {
      const parsed = parseStarNotePointsBinary(rawBuffer);
      const tile = getOrCreateTile(pageTag);

      // Add each segment from the point file
      for (let si = 0; si < parsed.segments.length; si++) {
        const segment = parsed.segments[si];
        if (segment.points.length === 0) continue;

        const meta =
          shapeMap.get(segment.parentUuid) ||
          shapeMap.get(parsed.shapeUuid) ||
          shapeMap.get(parsed.parentUuid) ||
          { color: "#000000", width: 3.54, shapeType: 0 };

        // Do not render internal text box bounding anchors as ink strokes
        const isTextBoxAnchor =
          meta.shapeType === 16 ||
          (tile.textBoxes && tile.textBoxes.some((tb) => tb.shapeUuid === segment.parentUuid));
        if (isTextBoxAnchor) {
          continue;
        }

        tile.strokes.push({
          shapeUuid: parsed.shapeUuid,
          parentUuid: segment.parentUuid || parsed.parentUuid,
          color: meta.color,
          width: meta.width,
          alpha: meta.alpha,
          sens: meta.sens,
          durationMs: segment.totalDurationMs,
          points: segment.points,
          src: { tag: pageTag, file: filepath, seg: si },
        });
      }
    } catch (e) {
      console.warn(`Failed to parse point stream at ${filepath}:`, e);
    }
  }

  // 5. Restore tile background images from resource/image/ if present
  for (const [tag, tile] of tiles.entries()) {
    const imgFile = zip.file(`${docUuid}/resource/image/${tag}.png`);
    if (imgFile) {
      try {
        if (typeof Image !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          const imgBlob = await imgFile.async("blob");
          const imgUrl = URL.createObjectURL(imgBlob);
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = imgUrl;
          });
          tile.backgroundImage = img;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            tile.pageRect = fitPageRect(tile.rect, img.naturalWidth, img.naturalHeight);
          }
        }
      } catch (err) {
        console.warn(`Could not load background image for ${tag}:`, err);
      }
    }
  }

  const doc: StarNoteDocument = {
    uuid: docUuid,
    title,
    tiles,
    rawZip: zip, // Retain original archive for non-destructive saves
  };
  await applyPageLayout(doc, noteInfoFile ? noteInfoStrings(await noteInfoFile.async("uint8array")) : new Map());
  return doc;
}
