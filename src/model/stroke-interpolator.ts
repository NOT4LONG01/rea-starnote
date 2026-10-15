/**
 * StarNote Stroke Interpolator & Ribbon Geometry Generator
 * Reconstructed clean-room implementation of StarNote stylus rendering math.
 */

export interface RawStrokePoint {
  dt: number;        // Time delta from stroke start in milliseconds
  x: number;         // X coordinate in page tile space
  y: number;         // Y coordinate in page tile space
  pressure: number;  // Hardware digitizer pressure (0 .. 32767)
}

export interface BrushParameters {
  baseWidth: number;            // Base stroke width in pixels
  color: string;                // CSS hex color (e.g., "#b33333")
  alpha: number;                // Alpha opacity (0.0 .. 1.0)
  maxPressure?: number;         // Hardware max pressure (default 32767.0)
  pressureSensitivity?: number; // Exponent or scaling factor (default 0.375)
  smoothLevel?: number;         // Curve smoothing coefficient (default 0.2)
  brushShape?: number;          // 1: Standard Pen, 2: Fountain, 3: Highlighter
}

export interface SmoothedPoint {
  x: number;
  y: number;
  width: number;
  dt: number;
}

export interface StrokeOutline {
  leftPoints: Array<[number, number]>;
  rightPoints: Array<[number, number]>;
  color: string;
  dot?: { x: number; y: number; radius: number };
}

export interface ParsedStrokeSegment {
  parentUuid: string;
  totalDurationMs: number;
  points: RawStrokePoint[];
}

export interface ParsedPointsFile {
  version: number;
  pageTag: string;
  shapeUuid: string;
  segments: ParsedStrokeSegment[];
  parentUuid: string;
  totalDurationMs: number;
  points: RawStrokePoint[];
}

/**
 * Binary parser for StarNote `#points` raw stroke data files.
 * Supports both single-segment and multi-segment chained point streams.
 */
export function parseStarNotePointsBinary(buffer: Uint8Array): ParsedPointsFile {
  if (buffer.byteLength < 124) {
    throw new Error("Invalid point stream: buffer too small");
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const version = view.getUint32(0, false); // Big-Endian

  const dec = new TextDecoder("ascii");
  const pageTag = dec.decode(buffer.subarray(4, 40)).trim();
  const shapeUuid = dec.decode(buffer.subarray(40, 76)).trim();

  // Read Trailer start offset from last 4 bytes
  const trailerOff = view.getUint32(buffer.byteLength - 4, false);
  const trailerLen = buffer.byteLength - trailerOff;

  // Each trailer entry is 44 bytes: parentUuid(36) + headerOff(4) + pointsLen(4)
  // The final entry is followed by the 4-byte trailerOff
  const numSegments = Math.max(1, Math.floor((trailerLen - 4) / 44));
  const segments: ParsedStrokeSegment[] = [];

  for (let s = 0; s < numSegments; s++) {
    const entryOff = trailerOff + s * 44;
    if (entryOff + 44 > buffer.byteLength) break;

    const parentUuid = dec.decode(buffer.subarray(entryOff, entryOff + 36)).trim();
    const hOff = view.getUint32(entryOff + 36, false);
    const pLen = view.getUint32(entryOff + 40, false);

    const durationOff = hOff + pLen - 4;
    const durationMs = durationOff + 4 <= buffer.byteLength ? view.getUint32(durationOff, false) : 0;

    const numPoints = Math.max(0, Math.floor((pLen - 4) / 16));
    const points: RawStrokePoint[] = [];

    for (let i = 0; i < numPoints; i++) {
      const ptOff = hOff + i * 16;
      if (ptOff + 16 > buffer.byteLength) break;
      const dt = view.getUint32(ptOff, false);
      const x = view.getFloat32(ptOff + 4, false);
      const y = view.getFloat32(ptOff + 8, false);
      const pressure = view.getUint32(ptOff + 12, false);
      points.push({ dt, x, y, pressure });
    }

    segments.push({
      parentUuid,
      totalDurationMs: durationMs,
      points,
    });
  }

  const primarySegment = segments[segments.length - 1] || {
    parentUuid: "",
    totalDurationMs: 0,
    points: [],
  };

  return {
    version,
    pageTag,
    shapeUuid,
    segments,
    parentUuid: primarySegment.parentUuid,
    totalDurationMs: primarySegment.totalDurationMs,
    points: primarySegment.points,
  };
}

/**
 * Computes the dynamic brush width based on hardware pressure and sensitivity curve.
 */
export function computeStrokeWidth(
  pressure: number,
  baseWidth: number,
  maxPressure: number = 32767.0,
  sensitivity: number = 0.375
): number {
  if (pressure <= 0) return baseWidth * 0.2;
  const normP = Math.min(1.0, Math.max(0.0, pressure / maxPressure));
  // StarNote logarithmic/power pressure curve formula:
  // width = baseWidth * ((1.0 - sensitivity) + sensitivity * (normP ^ 0.75))
  const pressureFactor = (1.0 - sensitivity) + sensitivity * Math.pow(normP, 0.75);
  return Math.max(0.5, baseWidth * pressureFactor);
}

/**
 * Smooths raw discrete points using Catmull-Rom cubic spline interpolation.
 * Respects smoothLevel as spline tension parameter.
 */
export function interpolateStrokePoints(
  rawPoints: RawStrokePoint[],
  brush: BrushParameters,
  subdivision: number = 4
): SmoothedPoint[] {
  if (rawPoints.length === 0) return [];
  if (rawPoints.length === 1) {
    const p = rawPoints[0];
    return [{
      x: p.x,
      y: p.y,
      width: computeStrokeWidth(p.pressure, brush.baseWidth, brush.maxPressure, brush.pressureSensitivity),
      dt: p.dt,
    }];
  }

  const smoothed: SmoothedPoint[] = [];
  const smooth = brush.smoothLevel ?? 0.2;
  // Tension parameter: 0.5 is standard Catmull-Rom, modified by smoothLevel
  const tension = 0.5 * (1.0 - Math.min(0.8, Math.max(0.0, smooth)) * 0.5);

  for (let i = 0; i < rawPoints.length - 1; i++) {
    const p0 = rawPoints[Math.max(0, i - 1)];
    const p1 = rawPoints[i];
    const p2 = rawPoints[i + 1];
    const p3 = rawPoints[Math.min(rawPoints.length - 1, i + 2)];

    const w1 = computeStrokeWidth(p1.pressure, brush.baseWidth, brush.maxPressure, brush.pressureSensitivity);
    const w2 = computeStrokeWidth(p2.pressure, brush.baseWidth, brush.maxPressure, brush.pressureSensitivity);

    // Subdivide only as much as the curve needs: raw pen samples a few units apart are already smooth, and every extra
    // vertex is paid for on every repaint. `subdivision` is the maximum per segment.
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.max(1, Math.min(subdivision, Math.ceil(segLen / 6)));
    const steps = i === rawPoints.length - 2 ? n + 1 : n;

    for (let s = 0; s < steps; s++) {
      const t = s / n;
      const t2 = t * t;
      const t3 = t2 * t;

      // Tension-scaled Catmull-Rom blending
      const m1x = (p2.x - p0.x) * tension;
      const m1y = (p2.y - p0.y) * tension;
      const m2x = (p3.x - p1.x) * tension;
      const m2y = (p3.y - p1.y) * tension;

      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      const x = h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x;
      const y = h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y;

      const width = w1 + (w2 - w1) * t;
      const dt = p1.dt + (p2.dt - p1.dt) * t;

      smoothed.push({ x, y, width, dt });
    }
  }

  return smoothed;
}

/**
 * Generates an outline ribbon polygon from smoothed stroke points with normal offsets.
 * For single-point taps / dots, returns dot coordinates and radius.
 */
export function generateRibbonGeometry(
  smoothedPoints: SmoothedPoint[],
  color: string
): StrokeOutline {
  const leftPoints: Array<[number, number]> = [];
  const rightPoints: Array<[number, number]> = [];

  if (smoothedPoints.length === 0) {
    return { leftPoints, rightPoints, color };
  }

  // Handle single-point tap (dot / i-dot)
  if (smoothedPoints.length === 1) {
    const pt = smoothedPoints[0];
    return {
      leftPoints,
      rightPoints,
      color,
      dot: { x: pt.x, y: pt.y, radius: Math.max(1.0, pt.width / 2.0) },
    };
  }

  for (let i = 0; i < smoothedPoints.length; i++) {
    const curr = smoothedPoints[i];
    let dx = 0;
    let dy = 0;

    if (i === 0) {
      const next = smoothedPoints[1];
      dx = next.x - curr.x;
      dy = next.y - curr.y;
    } else if (i === smoothedPoints.length - 1) {
      const prev = smoothedPoints[i - 1];
      dx = curr.x - prev.x;
      dy = curr.y - prev.y;
    } else {
      const prev = smoothedPoints[i - 1];
      const next = smoothedPoints[i + 1];
      dx = next.x - prev.x;
      dy = next.y - prev.y;
    }

    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    // Unit normal vector (perpendicular to stroke direction)
    const nx = -dy / len;
    const ny = dx / len;

    const halfWidth = curr.width / 2.0;

    leftPoints.push([curr.x + nx * halfWidth, curr.y + ny * halfWidth]);
    rightPoints.push([curr.x - nx * halfWidth, curr.y - ny * halfWidth]);
  }

  return { leftPoints, rightPoints, color };
}

/**
 * Renders an outline ribbon directly to an HTML5 CanvasRenderingContext2D.
 */
export function renderStrokeToCanvas(
  ctx: CanvasRenderingContext2D,
  ribbon: StrokeOutline
): void {
  const { leftPoints, rightPoints, color, dot } = ribbon;

  // Single-point tap / dot rendering
  if (dot) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (leftPoints.length === 0 || rightPoints.length === 0) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();

  ctx.moveTo(leftPoints[0][0], leftPoints[0][1]);
  for (let i = 1; i < leftPoints.length; i++) {
    ctx.lineTo(leftPoints[i][0], leftPoints[i][1]);
  }

  // Cap at stroke end
  const lastRight = rightPoints[rightPoints.length - 1];
  ctx.lineTo(lastRight[0], lastRight[1]);

  for (let i = rightPoints.length - 2; i >= 0; i--) {
    ctx.lineTo(rightPoints[i][0], rightPoints[i][1]);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The same outline renderStrokeToCanvas fills, as a reusable Path2D (built once, filled on every frame). */
export function ribbonToPath(ribbon: StrokeOutline): Path2D | null {
  const { leftPoints, rightPoints, dot } = ribbon;
  const path = new Path2D();
  if (dot) { path.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2); return path; }
  if (leftPoints.length === 0 || rightPoints.length === 0) return null;
  path.moveTo(leftPoints[0][0], leftPoints[0][1]);
  for (let i = 1; i < leftPoints.length; i++) path.lineTo(leftPoints[i][0], leftPoints[i][1]);
  const lastRight = rightPoints[rightPoints.length - 1];
  path.lineTo(lastRight[0], lastRight[1]);
  for (let i = rightPoints.length - 2; i >= 0; i--) path.lineTo(rightPoints[i][0], rightPoints[i][1]);
  path.closePath();
  return path;
}
