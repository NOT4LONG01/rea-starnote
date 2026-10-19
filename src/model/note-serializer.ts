import JSZip from "jszip";
import { RawStrokePoint, BrushParameters, interpolateStrokePoints, generateRibbonGeometry, parseStarNotePointsBinary } from "./stroke-interpolator";
import { StarNoteDocument, ParsedStroke, ParsedTextBox, ParsedImage } from "./note-loader";
import { gridRectOf, sidecarOf, sidecarPath, sizeOfPage } from "./pages";

/**
 * Low-level Google Protocol Buffers wire encoding helpers.
 */
function encodeVarint(val: bigint | number): Uint8Array {
  let v = BigInt(val);
  const bytes: number[] = [];
  while (v >= 0x80n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v & 0x7fn));
  return new Uint8Array(bytes);
}

/** Concatenates byte chunks into one array. */
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function encodeTag(fNum: number, wireType: number): Uint8Array {
  return encodeVarint((fNum << 3) | wireType);
}

function encodeLengthDelimited(fNum: number, data: Uint8Array): Uint8Array {
  const tag = encodeTag(fNum, 2);
  const len = encodeVarint(data.length);
  const res = new Uint8Array(tag.length + len.length + data.length);
  res.set(tag, 0);
  res.set(len, tag.length);
  res.set(data, tag.length + len.length);
  return res;
}

function encodeStringField(fNum: number, str: string): Uint8Array {
  const enc = new TextEncoder().encode(str);
  return encodeLengthDelimited(fNum, enc);
}

function encodeVarintField(fNum: number, val: bigint | number): Uint8Array {
  const tag = encodeTag(fNum, 0);
  const v = encodeVarint(val);
  const res = new Uint8Array(tag.length + v.length);
  res.set(tag, 0);
  res.set(v, tag.length);
  return res;
}

function encodeFloat32Field(fNum: number, val: number): Uint8Array {
  const tag = encodeTag(fNum, 5);
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, true);
  const res = new Uint8Array(tag.length + 4);
  res.set(tag, 0);
  res.set(new Uint8Array(buf), tag.length);
  return res;
}

/**
 * Creates an authentic StarNote `note/pb/note_info` Protobuf message payload.
 * Structure: Root Field 1 (len) containing Subfields 1 (UUID), 2 (created), 3 (modified),
 * 6 (title), 8 (flags), 12 (pageInfoMap JSON), 20 (pageNameList JSON).
 */
export function createNoteInfoProtobuf(docUuid: string, title: string, pageTags: string[] = ["Page[0-0]"], sizes: Map<string, { w: number; h: number }> = new Map()): Uint8Array {
  const now = Date.now();
  const subfields: Uint8Array[] = [
    encodeStringField(1, docUuid),
    encodeVarintField(2, now),
    encodeVarintField(3, now),
    encodeStringField(6, title),
    encodeVarintField(8, 1),
  ];

  const pageInfoMap: Record<string, any> = {};
  for (const tag of pageTags) {
    const { w, h } = sizes.get(tag) ?? { w: 2100, h: 2100 };
    pageInfoMap[tag] = {
      colorTheme: 0,
      currentLayerId: 0,
      height: Math.round(h),
      isEmpty: false,
      lastModifyTime: now,
      layerList: [{ id: 0, lock: false, opacity: 1.0, show: true, status: 0, updatedAt: now }],
      nextLayerId: 1,
      pageRectFWithMargin: { bottom: Math.round(h), empty: false, left: 0, right: Math.round(w), stability: 0, top: 0 },
      width: Math.round(w),
    };
  }

  subfields.push(encodeStringField(12, JSON.stringify({
    canvasExpandType: "DEFAULT",
    defaultPageRect: { bottom: 2100, empty: false, left: 0, right: 2100, stability: 0, top: 0 },
    pageInfoMap,
  })));

  subfields.push(encodeStringField(20, JSON.stringify({ pageNameList: pageTags })));

  const totalSubLen = subfields.reduce((acc, curr) => acc + curr.length, 0);
  const subBuffer = new Uint8Array(totalSubLen);
  let subOffset = 0;
  for (const sf of subfields) {
    subBuffer.set(sf, subOffset);
    subOffset += sf.length;
  }

  return encodeLengthDelimited(1, subBuffer);
}

/**
 * Encodes a StarNote ShapeRecord Protobuf message for a stylus ink stroke (Type 2).
 * Real StarNote Type 2 records contain fields:
 * 1 (shapeUuid), 2 (created), 3 (updated), 4 (argb), 5 (width),
 * 7 (bounds JSON), 8 (matrix JSON), 11 (brush JSON), 12 (type=2), 15 (1),
 * 17 (lineStyle JSON), 18 (groupUuid), 24 (version JSON).
 */
export function createShapeRecordProtobuf(
  shapeUuid: string,
  colorHex: string,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  groupUuid: string,
  alpha: number = 1,
  sensitivity: number = 0.375
): Uint8Array {
  const now = Date.now();
  let argb = 0xff000000n;
  const c = colorHex.replace("#", "");
  if (c.length === 6) {
    argb = 0xff000000n | BigInt(parseInt(c, 16));
  }

  const fields: Uint8Array[] = [
    encodeStringField(1, shapeUuid),
    encodeVarintField(2, now),
    encodeVarintField(3, now),
    encodeVarintField(4, argb),
    encodeFloat32Field(5, width),
    encodeStringField(7, JSON.stringify({ bottom: maxY, empty: false, left: minX, right: maxX, stability: 0, top: minY })),
    encodeStringField(8, JSON.stringify({ isEmpty: false, values: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0] })),
    encodeStringField(11, JSON.stringify({
      alphaFactor: alpha, brushShape: 1, directionEnabled: true, displayScale: 1.0, dpi: 320.0,
      maxPressure: 32767.0, pressureSensitivity: sensitivity, smoothLevel: 0.2,
      velocityAmplifier: 0.0, velocityIgnoreThreshold: 0.0, velocityLowerBound: 0.0,
      velocitySensitivity: 0.0, velocityUpperBound: 0.0
    })),
    encodeVarintField(12, 2),
    encodeVarintField(15, 1),
    encodeStringField(17, JSON.stringify({ lineStyle: { phase: 0.0, type: 0 } })),
    encodeStringField(18, groupUuid),
    encodeStringField(24, JSON.stringify({ a: { KEY_SHAPE_VERSION: 2 }, repo: { KEY_SHAPE_VERSION: 2 } })),
  ];

  return encodeLengthDelimited(1, concat(fields)); // Repeated field 1
}

/**
 * Encodes a page registration record for `virtual/page/pb/<uuid>`.
 * StarNote requires each boundless canvas tile to be registered in virtual/page/pb.
 */
/**
 * Shape record of a text box (type 16), laid out like the ones StarNote writes: bounds, typography, the text as a
 * JSON string plus an HTML copy, and a link (field 16) to the point file holding its two-corner anchor.
 */
export function createTextBoxRecordProtobuf(tb: ParsedTextBox, anchorFileUuid: string, groupUuid: string): Uint8Array {
  const now = Date.now();
  const rgb = parseInt((tb.color || "#000000").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const argb = BigInt.asUintN(64, BigInt.asIntN(32, 0xff000000n | BigInt(rgb))); // a signed 32-bit colour widened to 64 bits
  const w = tb.rect.right - tb.rect.left, h = tb.rect.bottom - tb.rect.top;
  const quoted = JSON.stringify(tb.text);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fields: Uint8Array[] = [
    encodeStringField(1, tb.shapeUuid),
    encodeVarintField(2, now),
    encodeVarintField(3, now),
    encodeVarintField(4, argb),
    encodeStringField(7, JSON.stringify({ bottom: tb.rect.bottom, empty: false, left: tb.rect.left, right: tb.rect.right, stability: 0, top: tb.rect.top })),
    encodeStringField(8, JSON.stringify({ isEmpty: false, values: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0] })),
    encodeStringField(9, JSON.stringify({
      alignType: 0, fontFace: "", isTextBold: !!tb.isBold, isTextConverted: false, isTextItalic: !!tb.isItalic,
      isTextOriginConverted: true, isTextSimplifiedConverted: false, isTextTraditional: false, isTextTraditionalConverted: false,
      isTextUnderline: false, isVertical: false, orientation: 0, paddingEnd: 0, paddingStart: 0, pointScale: 1.0,
      textConvertType: "NONE", textHeight: h, textSize: tb.fontSize, textSpacing: 1.0, textWidth: w,
    })),
    encodeStringField(10, quoted + "\n\n"),
    encodeStringField(11, JSON.stringify({
      alphaFactor: 1.0, brushShape: 1, directionEnabled: true, displayScale: 1.0, dpi: 320.0, maxPressure: 32767.0,
      pressureSensitivity: 0.375, smoothLevel: 0.2, velocityAmplifier: 0.0, velocityIgnoreThreshold: 0.0,
      velocityLowerBound: 0.0, velocitySensitivity: 0.0, velocityUpperBound: 0.0,
    })),
    encodeVarintField(12, 16),
    encodeStringField(16, anchorFileUuid),
    encodeStringField(18, groupUuid),
    encodeStringField(22, `<version data-client="android" data-version="2"></version><div align="left">${esc(quoted)}</div>`),
    encodeStringField(24, JSON.stringify({ a: {}, repo: {} })),
  ];
  return encodeLengthDelimited(1, concat(fields));
}

/**
 * Shape record of a picture (type 19), following Onyx's note model that StarNote is built on: bounds (7), identity matrix (8),
 * the resource JSON (14) naming the file in resource/data. ponytail: inferred, not checked against a picture StarNote made;
 * compare with one phone-made note and adjust fields here.
 */
export function createImageRecordProtobuf(img: ParsedImage, docUuid: string, groupUuid: string): Uint8Array {
  const now = Date.now();
  const fields: Uint8Array[] = [
    encodeStringField(1, img.shapeUuid),
    encodeVarintField(2, now),
    encodeVarintField(3, now),
    encodeVarintField(4, BigInt.asUintN(64, BigInt.asIntN(32, 0xff000000n))),
    encodeFloat32Field(5, 1.0),
    encodeStringField(7, JSON.stringify({ bottom: img.rect.bottom, empty: false, left: img.rect.left, right: img.rect.right, stability: 0, top: img.rect.top })),
    encodeStringField(8, JSON.stringify({ isEmpty: false, values: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0] })),
    encodeStringField(11, JSON.stringify({
      alphaFactor: 1.0, brushShape: 1, directionEnabled: true, displayScale: 1.0, dpi: 320.0, maxPressure: 32767.0,
      pressureSensitivity: 0.375, smoothLevel: 0.2, velocityAmplifier: 0.0, velocityIgnoreThreshold: 0.0,
      velocityLowerBound: 0.0, velocitySensitivity: 0.0, velocityUpperBound: 0.0,
    })),
    encodeVarintField(12, 19),
    encodeStringField(14, JSON.stringify({
      audioDuration: 0, documentId: docUuid, fileExtension: img.ext, fromType: 0, relativePath: `/${imageFileName(img)}`, status: 0, type: 0, uniqueId: img.resId,
    })),
    encodeVarintField(15, 0),
    encodeStringField(17, JSON.stringify({ lineStyle: { phase: 0.0, type: 0 } })),
    encodeStringField(18, groupUuid),
    encodeStringField(24, JSON.stringify({ a: { KEY_SHAPE_VERSION: 2 }, repo: { KEY_SHAPE_VERSION: 2 } })),
  ];
  return encodeLengthDelimited(1, concat(fields));
}
/** A picture's file name inside resource/data. */
export const imageFileName = (img: ParsedImage) => `${img.resId}.${img.ext}`;

export function createPageRecordProtobuf(
  tag: string,
  docUuid: string,
  rect: { left: number; top: number; right: number; bottom: number },
  now: number = Date.now()
): Uint8Array {
  const jsonRect = JSON.stringify({
    bottom: rect.bottom,
    empty: false,
    left: rect.left,
    right: rect.right,
    stability: 0,
    top: rect.top,
  });

  const fields: Uint8Array[] = [
    encodeStringField(1, tag),
    encodeVarintField(2, now),
    encodeVarintField(3, now),
    encodeFloat32Field(4, -1.0),
    encodeStringField(6, jsonRect),
    encodeStringField(7, jsonRect),
    encodeStringField(8, jsonRect),
    encodeStringField(9, "geo_layout"),
    encodeStringField(10, `document/${docUuid}/template/json/Page[0-0].template_json`),
    encodeStringField(11, "80001"),
    encodeStringField(12, "80001"),
    encodeVarintField(15, 18446744073709551615n), // -1n uint64
    encodeFloat32Field(17, 10.0),
  ];

  return encodeLengthDelimited(1, concat(fields)); // Repeated field 1
}

/**
 * Encodes document metadata for `virtual/doc/pb/<docUuid>`.
 */
export function createDocPbProtobuf(docUuid: string, now: number = Date.now()): Uint8Array {
  const contentId = crypto.randomUUID().replace(/-/g, "");
  const resourceId = crypto.randomUUID().replace(/-/g, "");
  const fields: Uint8Array[] = [
    encodeStringField(1, contentId),
    encodeVarintField(2, now),
    encodeVarintField(3, now),
    encodeFloat32Field(5, 1.0),
    encodeFloat32Field(6, 0.0),
    encodeFloat32Field(7, 0.0),
    encodeStringField(9, JSON.stringify({
      colorTheme: 0,
      contentId: "80001",
      contentPageId: "80001",
      contentPageSize: { bottom: 2100.0, empty: false, left: 0.0, right: 2100.0, stability: 0, top: 0.0 },
      contentRelativePath: `document/${docUuid}/template/json/Page[0-0].template_json`,
      contentType: "geo_layout",
      resourceId,
      sizeFormat: "BOUNDLESS"
    })),
    encodeStringField(10, JSON.stringify({
      alignCenterAfterOpen: false,
      applyMarginToAll: true,
      applyMarginToCover: false,
      autoApplyPageMargin: true,
      fetchPolicy: 0,
      openStrategy: 0
    }))
  ];

  return concat(fields);
}


/**
 * Serializes stroke points into the exact StarNote `#points` binary layout.
 */
export function serializeStarNotePointsBinary(
  pageTag: string,
  shapeUuid: string,
  parentUuid: string,
  durationMs: number,
  points: RawStrokePoint[],
  version: number = 1
): Uint8Array {
  const numPoints = points.length;
  const headerLen = 76;
  const pointsDataLen = numPoints * 16 + 4; // points + 4 bytes duration
  const trailerLen = 48;
  const totalLen = headerLen + pointsDataLen + trailerLen;

  const buffer = new ArrayBuffer(totalLen);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const enc = new TextEncoder();

  // 1. Header (76 Bytes)
  view.setUint32(0, version, false); // version = 1 (Big-Endian)

  // Page tag padded to 36 bytes ASCII
  const pageTagBytes = enc.encode(pageTag.padEnd(36, " "));
  u8.set(pageTagBytes.subarray(0, 36), 4);

  // Shape UUID padded to 36 bytes ASCII
  const shapeUuidBytes = enc.encode(shapeUuid.padEnd(36, " "));
  u8.set(shapeUuidBytes.subarray(0, 36), 40);

  // 2. Points (N * 16 Bytes)
  let offset = headerLen;
  for (const pt of points) {
    view.setUint32(offset, pt.dt, false);
    view.setFloat32(offset + 4, pt.x, false);
    view.setFloat32(offset + 8, pt.y, false);
    view.setUint32(offset + 12, pt.pressure, false);
    offset += 16;
  }

  // 3. Duration footer (4 Bytes)
  view.setUint32(offset, durationMs, false);
  offset += 4;

  // 4. Trailer (48 Bytes)
  const parentUuidBytes = enc.encode(parentUuid.padEnd(36, " "));
  u8.set(parentUuidBytes.subarray(0, 36), offset);

  // Trailer metadata offsets (last 12 bytes)
  const trailerMetaOff = totalLen - 12;
  view.setUint32(trailerMetaOff, headerLen, false);          // header offset = 76
  view.setUint32(trailerMetaOff + 4, pointsDataLen, false);   // points byte len
  view.setUint32(trailerMetaOff + 8, offset, false);          // trailer offset

  return u8;
}

/**
 * Serializes multi-segment chained stroke points into the exact StarNote `#points` binary layout.
 */
export function serializeStarNotePointsMultiSegment(
  pageTag: string,
  shapeUuid: string,
  segments: { parentUuid: string; totalDurationMs: number; points: RawStrokePoint[] }[],
  version: number = 1
): Uint8Array {
  if (segments.length === 1) {
    return serializeStarNotePointsBinary(
      pageTag,
      shapeUuid,
      segments[0].parentUuid,
      segments[0].totalDurationMs,
      segments[0].points,
      version
    );
  }

  let totalPointsLen = 0;
  for (const seg of segments) {
    totalPointsLen += seg.points.length * 16 + 4;
  }
  const totalTrailerLen = segments.length * 44 + 4;
  const totalLen = 76 + totalPointsLen + totalTrailerLen;

  const out = new Uint8Array(totalLen);
  const outView = new DataView(out.buffer);
  const enc = new TextEncoder();

  outView.setUint32(0, version, false);
  out.set(enc.encode(pageTag.padEnd(36, " ")).subarray(0, 36), 4);
  out.set(enc.encode(shapeUuid.padEnd(36, " ")).subarray(0, 36), 40);

  let curOff = 76;
  const trailerEntries: { parentUuid: string; hOff: number; pLen: number }[] = [];
  for (const seg of segments) {
    const hOff = curOff;
    for (const pt of seg.points) {
      outView.setUint32(curOff, pt.dt, false);
      outView.setFloat32(curOff + 4, pt.x, false);
      outView.setFloat32(curOff + 8, pt.y, false);
      outView.setUint32(curOff + 12, pt.pressure, false);
      curOff += 16;
    }
    outView.setUint32(curOff, seg.totalDurationMs, false);
    curOff += 4;
    const pLen = curOff - hOff;
    trailerEntries.push({ parentUuid: seg.parentUuid, hOff, pLen });
  }

  const actualTrailerOff = curOff;
  for (const entry of trailerEntries) {
    out.set(enc.encode(entry.parentUuid.padEnd(36, " ")).subarray(0, 36), curOff);
    curOff += 36;
    outView.setUint32(curOff, entry.hOff, false);
    curOff += 4;
    outView.setUint32(curOff, entry.pLen, false);
    curOff += 4;
  }
  outView.setUint32(curOff, actualTrailerOff, false);

  return out;
}

/** Reads a protobuf varint (number precision is plenty for lengths and keys). */
function pbVarint(b: Uint8Array, off: { v: number }): number {
  let r = 0, mul = 1;
  for (;;) {
    if (off.v >= b.length) throw new Error("truncated varint");
    const c = b[off.v++];
    r += (c & 0x7f) * mul;
    if (c < 0x80) return r;
    mul *= 128;
  }
}

/**
 * Removes whole top-level records whose field 1 (the shape id) is in `ids`. Every other byte is copied verbatim.
 * Returns null when the stream is not what we expect, so the caller leaves the file untouched.
 */
export function dropShapeRecords(pb: Uint8Array, ids: Set<string>): { out: Uint8Array; dropped: number } | null {
  const dec = new TextDecoder();
  const keep: Uint8Array[] = [];
  let dropped = 0;
  try {
    const o = { v: 0 };
    while (o.v < pb.length) {
      const start = o.v;
      if ((pbVarint(pb, o) & 7) !== 2) return null;      // top level is always length-delimited records
      const len = pbVarint(pb, o);
      const end = o.v + len;
      if (end > pb.length) return null;
      let id = "";
      const r = { v: o.v };
      while (r.v < end) {
        const key = pbVarint(pb, r), f = Math.floor(key / 8), w = key & 7;
        if (w === 0) pbVarint(pb, r);
        else if (w === 2) {
          const l = pbVarint(pb, r);
          if (f === 1 && !id) id = dec.decode(pb.subarray(r.v, r.v + l)).trim();
          r.v += l;
        } else if (w === 5) r.v += 4;
        else if (w === 1) r.v += 8;
        else return null;
      }
      if (r.v !== end) return null;
      if (id && ids.has(id)) dropped++; else keep.push(pb.subarray(start, end));
      o.v = end;
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(keep.reduce((a, k) => a + k.length, 0));
  let at = 0;
  for (const k of keep) { out.set(k, at); at += k.length; }
  return { out, dropped };
}

/**
 * Deletes erased saved strokes from the archive: their segment leaves the #points file (the file goes when it was
 * the last one) and, once no point file of the tile uses their id any more, their shape record leaves shape/*.zip.
 * Strokes left in a rewritten file get their segment index renumbered.
 */
async function removeFromArchive(zip: JSZip, doc: StarNoteDocument, removed: ParsedStroke[], removedBoxes: ParsedTextBox[]) {
  const byFile = new Map<string, Set<number>>();
  const ids = new Map<string, Set<string>>(); // tile tag -> ids of removed strokes
  for (const s of removed) {
    if (!s.src || !zip.file(s.src.file)) continue;
    if (!byFile.has(s.src.file)) byFile.set(s.src.file, new Set());
    byFile.get(s.src.file)!.add(s.src.seg);
    if (!ids.has(s.src.tag)) ids.set(s.src.tag, new Set());
    ids.get(s.src.tag)!.add(s.parentUuid);
  }
  for (const b of removedBoxes) { // a text box's anchor is a point segment whose parent is the box id
    if (!b.tag) continue;
    if (!ids.has(b.tag)) ids.set(b.tag, new Set());
    ids.get(b.tag)!.add(b.shapeUuid);
    for (const name of Object.keys(zip.files)) {
      if (!name.startsWith(`${doc.uuid}/point/${b.tag}/`) || !name.endsWith("#points")) continue;
      const hit = parseStarNotePointsBinary(await zip.file(name)!.async("uint8array")).segments.map((sg, i) => (sg.parentUuid === b.shapeUuid ? i : -1)).filter((i) => i >= 0);
      if (hit.length) { if (!byFile.has(name)) byFile.set(name, new Set()); hit.forEach((i) => byFile.get(name)!.add(i)); }
    }
  }
  for (const [file, gone] of byFile) {
    const parsed = parseStarNotePointsBinary(await zip.file(file)!.async("uint8array"));
    const left = parsed.segments.map((seg, i) => ({ seg, i })).filter((x) => !gone.has(x.i));
    if (left.length === parsed.segments.length) continue;
    if (left.length === 0) zip.remove(file);
    else zip.file(file, serializeStarNotePointsMultiSegment(parsed.pageTag, parsed.shapeUuid, left.map((x) => x.seg), parsed.version));
    const newIndex = new Map(left.map((x, n) => [x.i, n]));
    for (const t of doc.tiles.values()) for (const st of t.strokes) {
      if (st.src?.file === file && newIndex.has(st.src.seg)) st.src = { ...st.src, seg: newIndex.get(st.src.seg)! };
    }
  }
  const docUuid = doc.uuid;
  for (const [tag, tagIds] of ids) {
    const stillUsed = new Set<string>();
    for (const name of Object.keys(zip.files)) {
      if (!name.startsWith(`${docUuid}/point/${tag}/`) || !name.endsWith("#points")) continue;
      try {
        for (const seg of parseStarNotePointsBinary(await zip.file(name)!.async("uint8array")).segments) stillUsed.add(seg.parentUuid);
      } catch { /* an unreadable file keeps its shape records: nothing is deleted on a guess */ return; }
    }
    const drop = new Set([...tagIds].filter((id) => !stillUsed.has(id)));
    if (drop.size === 0) continue;
    for (const name of Object.keys(zip.files).filter((k) => k.startsWith(`${docUuid}/shape/${tag}#`) && k.endsWith(".zip"))) {
      const inner = await JSZip.loadAsync(await zip.file(name)!.async("uint8array"));
      const innerName = Object.keys(inner.files)[0];
      const res = dropShapeRecords(await inner.file(innerName)!.async("uint8array"), drop);
      if (!res || res.dropped === 0) continue;
      if (res.out.length === 0) { zip.remove(name); continue; }
      const next = new JSZip();
      next.file(innerName, res.out);
      zip.file(name, await next.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    }
  }
}

/**
 * Splits a world-space stroke at page boundaries using the document's real page rectangles (pages are stacked with
 * gaps, in any order), and returns each part in its own tile's coordinates.
 */
export function splitStrokeByDocTiles(doc: StarNoteDocument, points: RawStrokePoint[]): Array<{ pageTag: string; points: RawStrokePoint[] }> {
  const tiles = [...doc.tiles.values()];
  const tileOf = (x: number, y: number) => {
    let best = tiles[0], bestD = Infinity;
    for (const t of tiles) {
      const r = t.pageRect ?? t.rect;
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  };
  const out: Array<{ pageTag: string; points: RawStrokePoint[] }> = [];
  let cur: (typeof out)[number] | null = null;
  for (const p of points) {
    const t = tileOf(p.x, p.y);
    if (!cur || cur.pageTag !== t.pageTag) { cur = { pageTag: t.pageTag, points: [] }; out.push(cur); }
    cur.points.push({ dt: p.dt, pressure: p.pressure, x: Math.max(0, Math.min(2100, p.x - t.rect.left)), y: Math.max(0, Math.min(2100, p.y - t.rect.top)) });
  }
  return out;
}

/** Removes everything a page owns from the archive: its ink, shapes, background, template, stash and page record. */
async function removePagesFromArchive(zip: JSZip, docUuid: string, tags: string[]) {
  const gone = new Set(tags);
  for (const name of Object.keys(zip.files)) {
    const base = name.slice(name.lastIndexOf("/") + 1);
    const tag = [...gone].find((t) => name.startsWith(`${docUuid}/point/${t}/`) || base.startsWith(`${t}#`) || base === `${t}.png` || base === `${t}.template_json`);
    if (tag) zip.remove(name);
  }
  for (const name of Object.keys(zip.files).filter((k) => k.startsWith(`${docUuid}/virtual/page/pb/`) && !zip.files[k].dir)) {
    const res = dropShapeRecords(await zip.file(name)!.async("uint8array"), gone); // page records start with the tag, like shape records with their id
    if (res && res.dropped > 0) zip.file(name, res.out);
  }
}

/** StarNote's own template for ruled (lined) pages. */
function ruledTemplateJson(): string {
return JSON.stringify({
    fromShapeType: -1,
    isFillColorSupported: true,
    isHidden: false,
    properties: {
      drawOrigin: "LEFT_TOP",
      fillAttr: { color: -1, enableColor: true },
      forceFullFit: false,
      ignoreFirstColumn: false,
      ignoreFirstRow: false,
      layoutType: "LayoutFittedHorizontalLine",
      pageMargins: {
        layoutRect: { bottom: 0.0, empty: true, left: 0.0, right: 0.0, stability: 0, top: 0.0 },
        paddingBottom: 0.0,
        paddingLeft: 0.0,
        paddingRight: 0.0,
        paddingTop: 0.0,
        pagePaddingRect: { bottom: 0.0, empty: true, left: 0.0, right: 0.0, stability: 0, top: 0.0 },
        spacing: 86.810005,
      },
      radius: 2.625,
      selectionPointType: "SCALE",
      strokeAttr: {
        color: -7829368,
        colorTransformMode: 0,
        enableColor: true,
        roundCorner: true,
        width: 0.7875002,
      },
      subType: "Layout",
      underContent: false,
      useFixedRatio: false,
    },
    renderPathBoundingRect: { bottom: 0.0, empty: true, left: 0.0, right: 0.0, stability: 0, top: 0.0 },
    spacing: 86.810005,
    type: "Feature",
    universalShapeType: "layout_horizontal_line_fitted",
    version: 2,
  });
}

/**
 * Non-destructive note archive exporter.
 * Preserves 100% of existing files when modifying a document, generates valid Protobuf
 * ShapeRecords in shape/*.zip for complete StarNote compatibility, properly splits strokes
 * across tile boundaries, and updates doc.rawZip and doc.tiles to eliminate data loss.
 */
export async function exportStarNoteArchive(
  doc: StarNoteDocument,
  additionalStrokes: ParsedStroke[] = []
): Promise<Uint8Array> {
  const docUuid = doc.uuid || crypto.randomUUID();
  let zip: JSZip;

  if (doc.rawZip) {
    // Clone original archive to preserve all shape records, extra metadata, templates, and thumbnails
    zip = new JSZip();
    for (const [filename, fileEntry] of Object.entries(doc.rawZip.files)) {
      if (!fileEntry.dir) {
        const fileBytes = await fileEntry.async("uint8array");
        zip.file(filename, fileBytes);
      }
    }
  } else {
    zip = new JSZip();
  }

  // Erased saved strokes leave the archive first (new strokes are appended afterwards)
  const removedNow = [...(doc.removedStrokes ?? [])]; // an erase during the async export below stays queued
  const removedBoxesNow = [...(doc.removedTextBoxes ?? [])];
  const removedImagesNow = [...(doc.removedImages ?? [])];
  // pictures go the way of text boxes (their record is dropped by id); a moved picture is re-added below with its file
  if (removedNow.length || removedBoxesNow.length || removedImagesNow.length) await removeFromArchive(zip, doc, removedNow, [...removedBoxesNow, ...(removedImagesNow as unknown as ParsedTextBox[])]);
  for (const img of removedImagesNow) zip.remove(`${docUuid}/resource/data/${imageFileName(img)}`);
  const removedPagesNow = [...(doc.removedPages ?? [])];
  if (removedPagesNow.length) await removePagesFromArchive(zip, docUuid, removedPagesNow);

  // Preserve PDF or custom page backgrounds into resource/image/<pageTag>.png
  for (const [tag, tile] of doc.tiles.entries()) {
    if (tile.backgroundImage && typeof (tile.backgroundImage as any).toDataURL === "function") {
      try {
        const dataUrl = (tile.backgroundImage as HTMLCanvasElement).toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          zip.file(`${docUuid}/resource/image/${tag}.png`, bytes);
        }
      } catch (err) {
        console.warn(`Could not serialize background image for tile ${tag}:`, err);
      }
    }
  }

  // Pre-index groupUuid for tiles (from existing shape zip filenames)
  const groupUuidByTile = new Map<string, string>();
  for (const filename of Object.keys(zip.files)) {
    const m = filename.match(new RegExp(`^${docUuid}/shape/([^#]+)#([^#]+)#.*\\.zip$`));
    if (m) {
      groupUuidByTile.set(m[1], m[2]);
    }
  }

  // Track shape records to bundle into shape/*.zip per tile
  const newShapesByTile = new Map<string, Uint8Array[]>();

  // Process additional user strokes
  for (const stroke of additionalStrokes) {
    if (stroke.points.length === 0) continue;

    // Split across tile boundaries to guarantee strict [0, 2100] bounds
    const tileSegments = splitStrokeByDocTiles(doc, stroke.points);

    for (const seg of tileSegments) {
      const segPointFileUuid = crypto.randomUUID();
      const strokeShapeUuid = stroke.parentUuid || crypto.randomUUID();
      const durationMs = stroke.durationMs || 1000;

      // 1. Serialize points binary
      // Header: point file UUID (segPointFileUuid)
      // Trailer: stroke shape UUID (strokeShapeUuid, matching ShapeRecord Field 1)
      const bin = serializeStarNotePointsBinary(
        seg.pageTag,
        segPointFileUuid,
        strokeShapeUuid,
        durationMs,
        seg.points
      );
      zip.file(`${docUuid}/point/${seg.pageTag}/${seg.pageTag}#${segPointFileUuid}#points`, bin);

      // 2. Compute bounding box for ShapeRecord
      let minX = 2100, minY = 2100, maxX = 0, maxY = 0;
      for (const p of seg.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }

      // 3. Obtain tile groupUuid
      let groupUuid = groupUuidByTile.get(seg.pageTag);
      if (!groupUuid) {
        groupUuid = crypto.randomUUID();
        groupUuidByTile.set(seg.pageTag, groupUuid);
      }

      // 4. Create ShapeRecord Protobuf (Field 1 = strokeShapeUuid, Field 18 = groupUuid, Field 17 = lineStyle)
      const shapeRec = createShapeRecordProtobuf(
        strokeShapeUuid,
        stroke.color || "#000000",
        stroke.width || 3.5,
        minX,
        minY,
        maxX,
        maxY,
        groupUuid,
        stroke.alpha ?? 1,
        stroke.sens ?? 0.375
      );

      if (!newShapesByTile.has(seg.pageTag)) {
        newShapesByTile.set(seg.pageTag, []);
      }
      newShapesByTile.get(seg.pageTag)!.push(shapeRec);

      // 5. Commit into doc.tiles model so current session retains strokes
      const docTile = doc.tiles.get(seg.pageTag)!; // splitStrokeByDocTiles only names tiles that exist

      docTile.strokes.push({
        shapeUuid: segPointFileUuid,
        parentUuid: strokeShapeUuid,
        color: stroke.color,
        width: stroke.width,
        alpha: stroke.alpha,
        sens: stroke.sens,
        durationMs,
        points: seg.points,
        src: { tag: seg.pageTag, file: `${docUuid}/point/${seg.pageTag}/${seg.pageTag}#${segPointFileUuid}#points`, seg: 0 },
      });
    }
  }

  // New / changed text boxes: a type-16 shape record plus its two-corner anchor in a point file
  const addedBoxesNow = [...(doc.addedTextBoxes ?? [])];
  for (const tb of addedBoxesNow) {
    const tag = tb.tag;
    if (!tag || !doc.tiles.has(tag)) continue;
    const anchorUuid = crypto.randomUUID();
    let groupUuid = groupUuidByTile.get(tag);
    if (!groupUuid) { groupUuid = crypto.randomUUID(); groupUuidByTile.set(tag, groupUuid); }
    zip.file(
      `${docUuid}/point/${tag}/${tag}#${anchorUuid}#points`,
      serializeStarNotePointsBinary(tag, anchorUuid, tb.shapeUuid, 0, [
        { dt: 0, x: tb.rect.left, y: tb.rect.top, pressure: 3440 },
        { dt: 0, x: tb.rect.right, y: tb.rect.bottom, pressure: 0 },
      ])
    );
    if (!newShapesByTile.has(tag)) newShapesByTile.set(tag, []);
    newShapesByTile.get(tag)!.push(createTextBoxRecordProtobuf(tb, anchorUuid, groupUuid));
  }

  // New / moved / resized pictures: a type-19 record, and the bytes in resource/data
  const addedImagesNow = [...(doc.addedImages ?? [])];
  for (const img of addedImagesNow) {
    const tag = img.tag;
    if (!tag || !doc.tiles.has(tag)) continue;
    let groupUuid = groupUuidByTile.get(tag);
    if (!groupUuid) { groupUuid = crypto.randomUUID(); groupUuidByTile.set(tag, groupUuid); }
    zip.file(`${docUuid}/resource/data/${imageFileName(img)}`, img.bytes);
    if (!newShapesByTile.has(tag)) newShapesByTile.set(tag, []);
    newShapesByTile.get(tag)!.push(createImageRecordProtobuf(img, docUuid, groupUuid));
  }

  // Bundle shape records into shape/*.zip files
  for (const [tag, records] of newShapesByTile.entries()) {
    const existingShapeFiles = Object.keys(zip.files).filter(
      k => k.startsWith(`${docUuid}/shape/${tag}#`) && k.endsWith(".zip")
    );

    let targetShapeZipName = existingShapeFiles[0];
    let innerName = "";
    let combinedPb: Uint8Array;
    const groupUuid = groupUuidByTile.get(tag) || crypto.randomUUID();

    if (targetShapeZipName) {
      // Append to existing shape zip
      const shapeZipBytes = await zip.file(targetShapeZipName)!.async("uint8array");
      const shapeInnerZip = await JSZip.loadAsync(shapeZipBytes);
      innerName = Object.keys(shapeInnerZip.files)[0];
      const existingPb = await shapeInnerZip.file(innerName)!.async("uint8array");

      combinedPb = concat([existingPb, ...records]);
    } else {
      // Create new shape zip for tile
      const ts = Date.now();
      innerName = `${tag}#${groupUuid}#${ts}`;
      targetShapeZipName = `${docUuid}/shape/${innerName}.zip`;

      combinedPb = concat(records);
    }

    const newInnerZip = new JSZip();
    newInnerZip.file(innerName, combinedPb);
    const packagedShapeZip = await newInnerZip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });
    zip.file(targetShapeZipName, packagedShapeZip);
  }

  // Synchronize Note Metadata across all active tiles in doc.tiles
  const allTags = Array.from(doc.tiles.keys());
  if (allTags.length === 0) allTags.push("Page[0-0]");

  // 1. Update note/pb/note_info (pageNameList, pageInfoMap, layerList, title)
  const sizes = new Map(allTags.map((tag) => [tag, doc.tiles.get(tag) ? sizeOfPage(doc.tiles.get(tag)!) : { w: 2100, h: 2100 }] as const));
  const noteInfoBytes = createNoteInfoProtobuf(docUuid, doc.title || "StarNote Document", allTags, sizes);
  zip.file(`${docUuid}/note/pb/note_info`, noteInfoBytes);

  // 2. Synchronize virtual/page/pb/ (register all tiles)
  const existingPagePbFile = Object.keys(zip.files).find(
    k => k.startsWith(`${docUuid}/virtual/page/pb/`) && !zip.files[k].dir
  );

  if (existingPagePbFile) {
    const existingBytes = await zip.file(existingPagePbFile)!.async("uint8array");
    const existingText = new TextDecoder("utf-8").decode(existingBytes);
    const missingTags = allTags.filter(tag => !existingText.includes(tag));
    if (missingTags.length > 0) {
      zip.file(existingPagePbFile, concat([existingBytes, ...missingTags.map((tag) => createPageRecordProtobuf(tag, docUuid, gridRectOf(tag)))]));
    }
  } else {
    // New document or PDF import: generate virtual/page/pb/<uuid>
    const pagePbUuid = crypto.randomUUID();
    zip.file(`${docUuid}/virtual/page/pb/${pagePbUuid}`, concat(allTags.map((tag) => createPageRecordProtobuf(tag, docUuid, gridRectOf(tag)))));

    // Also generate virtual/doc/pb/<docUuid>
    const docPbBytes = createDocPbProtobuf(docUuid);
    zip.file(`${docUuid}/virtual/doc/pb/${docUuid}`, docPbBytes);

    // Generate standard ruled lines template JSON files
    const templateContent = ruledTemplateJson();
    zip.file(`${docUuid}/template/json/Page[0-0].template_json`, templateContent);
    zip.file(`${docUuid}/document/${docUuid}/template/json/Page[0-0].template_json`, templateContent);
    zip.file(`${docUuid}/template/json/${docUuid}.template_json`, templateContent);
    zip.file(`${docUuid}/document/${docUuid}/template/json/${docUuid}.template_json`, templateContent);
  }

  // A stack of pages: remember order, sizes and templates, and keep the per-page ruled template files in step
  if (doc.layout === "stack" || doc.infinite) {
    zip.file(sidecarPath(docUuid), JSON.stringify(sidecarOf(doc)));
    for (const [tag, t] of doc.tiles) {
      const files = [`${docUuid}/template/json/${tag}.template_json`, `${docUuid}/document/${docUuid}/template/json/${tag}.template_json`];
      const ruled = (t.template ?? "ruled") === "ruled" && !t.backgroundImage;
      for (const f of files) {
        if (!ruled) zip.remove(f);
        else if (!zip.file(f)) zip.file(f, ruledTemplateJson());
      }
    }
  }

  // Generate finalized ZIP archive bytes
  const archiveBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  // Update doc.rawZip with the newly saved archive so subsequent saves build upon it without loss
  doc.rawZip = await JSZip.loadAsync(archiveBytes);
  doc.removedStrokes = (doc.removedStrokes ?? []).filter((x) => !removedNow.includes(x)); // now really gone from rawZip
  doc.removedTextBoxes = (doc.removedTextBoxes ?? []).filter((x) => !removedBoxesNow.includes(x));
  doc.removedPages = (doc.removedPages ?? []).filter((x) => !removedPagesNow.includes(x));
  doc.pagesChanged = false;
  for (const t of doc.tiles.values()) t.saved = true;
  doc.addedTextBoxes = (doc.addedTextBoxes ?? []).filter((x) => !addedBoxesNow.includes(x));
  for (const tb of addedBoxesNow) tb.saved = true;
  doc.removedImages = (doc.removedImages ?? []).filter((x) => !removedImagesNow.includes(x));
  doc.addedImages = (doc.addedImages ?? []).filter((x) => !addedImagesNow.includes(x));
  for (const img of addedImagesNow) img.saved = true;

  return archiveBytes;
}

/**
 * Generates an SVG string representation of the entire document and drawn strokes.
 * Correctly offsets tile-local points and text boxes by tile left/top origins.
 */
export function exportCanvasAsSvg(
  doc: StarNoteDocument | null,
  userStrokes: ParsedStroke[],
  brushParams: { smoothLevel: number; pressureSensitivity: number }
): string {
  let minX = 0, minY = 0, maxX = 2100, maxY = 2100;

  if (doc && doc.tiles.size > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const tile of doc.tiles.values()) {
      minX = Math.min(minX, tile.rect.left);
      minY = Math.min(minY, tile.rect.top);
      maxX = Math.max(maxX, tile.rect.right);
      maxY = Math.max(maxY, tile.rect.bottom);
    }
  }

  const width = Math.max(2100, maxX - minX);
  const height = Math.max(2100, maxY - minY);

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <style>
    .tile-bg { fill: #ffffff; stroke: #e2e8f0; stroke-width: 2; }
    .tile-grid { stroke: #f1f5f9; stroke-width: 1; }
    .tile-label { font-family: sans-serif; font-size: 24px; fill: #94a3b8; }
  </style>
  <defs/>
  <!-- Background -->
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#1e212b" />
`;

  const renderRibbonToSvg = (stroke: ParsedStroke): string => {
    const brush: BrushParameters = {
      baseWidth: stroke.width,
      color: stroke.color,
      alpha: stroke.alpha ?? 1.0,
      pressureSensitivity: stroke.sens ?? brushParams.pressureSensitivity,
      smoothLevel: brushParams.smoothLevel,
    };
    const smoothed = interpolateStrokePoints(stroke.points, brush, 4);
    const ribbon = generateRibbonGeometry(smoothed, stroke.color);
    const op = stroke.alpha !== undefined && stroke.alpha < 1 ? ` fill-opacity="${stroke.alpha}"` : "";

    if (ribbon.dot) {
      return `  <circle cx="${ribbon.dot.x.toFixed(2)}" cy="${ribbon.dot.y.toFixed(2)}" r="${ribbon.dot.radius.toFixed(2)}" fill="${stroke.color}"${op} />\n`;
    }

    if (ribbon.leftPoints.length === 0 || ribbon.rightPoints.length === 0) return "";

    let pathD = `M ${ribbon.leftPoints[0][0].toFixed(2)} ${ribbon.leftPoints[0][1].toFixed(2)}`;
    for (let i = 1; i < ribbon.leftPoints.length; i++) {
      pathD += ` L ${ribbon.leftPoints[i][0].toFixed(2)} ${ribbon.leftPoints[i][1].toFixed(2)}`;
    }
    const lastRight = ribbon.rightPoints[ribbon.rightPoints.length - 1];
    pathD += ` L ${lastRight[0].toFixed(2)} ${lastRight[1].toFixed(2)}`;
    for (let i = ribbon.rightPoints.length - 2; i >= 0; i--) {
      pathD += ` L ${ribbon.rightPoints[i][0].toFixed(2)} ${ribbon.rightPoints[i][1].toFixed(2)}`;
    }
    pathD += " Z";

    return `  <path d="${pathD}" fill="${stroke.color}"${op} />\n`;
  };

  // Render Tiles
  if (doc) {
    for (const tile of doc.tiles.values()) {
      const { left, top, right, bottom } = tile.rect;
      const w = right - left;
      const h = bottom - top;

      svg += `  <!-- Tile: ${tile.pageTag} -->\n`;
      svg += `  <rect class="tile-bg" x="${left}" y="${top}" width="${w}" height="${h}" />\n`;

      // If PDF image is present, embed as PNG image, otherwise draw ruled template lines
      if (tile.backgroundImage && typeof (tile.backgroundImage as any).toDataURL === "function") {
        const dataUrl = (tile.backgroundImage as HTMLCanvasElement).toDataURL("image/png");
        svg += `  <image href="${dataUrl}" x="${left}" y="${top}" width="${w}" height="${h}" />\n`;
      } else {
        const spacing = 86.81;
        for (let y = top + spacing; y < bottom; y += spacing) {
          svg += `  <line class="tile-grid" x1="${left}" y1="${y.toFixed(2)}" x2="${right}" y2="${y.toFixed(2)}" />\n`;
        }
      }
      svg += `  <text class="tile-label" x="${left + 30}" y="${top + 50}">${tile.pageTag}</text>\n`;

      // Render text boxes with tile origin offset (left, top)
      if (tile.textBoxes) {
        for (const tb of tile.textBoxes) {
          const tbX = left + tb.rect.left;
          const tbY = top + tb.rect.top + Math.max(16, tb.fontSize);
          const weight = tb.isBold ? "font-weight=\"bold\"" : "";
          const style = tb.isItalic ? "font-style=\"italic\"" : "";
          const escaped = tb.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          svg += `  <text x="${tbX.toFixed(2)}" y="${tbY.toFixed(2)}" font-size="${Math.max(16, tb.fontSize)}" fill="${tb.color}" ${weight} ${style} font-family="sans-serif">${escaped}</text>\n`;
        }
      }

      // Render strokes with tile origin offset (left, top)
      for (const stroke of tile.strokes) {
        const worldPoints: RawStrokePoint[] = stroke.points.map(p => ({
          dt: p.dt,
          x: p.x + left,
          y: p.y + top,
          pressure: p.pressure,
        }));
        svg += renderRibbonToSvg({ ...stroke, points: worldPoints });
      }
    }
  }

  // Render User Strokes (already in world coordinates)
  if (userStrokes.length > 0) {
    svg += "  <!-- User Drawn Strokes -->\n";
    for (const stroke of userStrokes) {
      svg += renderRibbonToSvg(stroke);
    }
  }

  svg += "</svg>";
  return svg;
}
