import type { RawStrokePoint } from "./stroke-interpolator";

export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "triangle" | "diamond";

export const SHAPE_KINDS: { id: ShapeKind; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rect", label: "Rectangle" },
  { id: "ellipse", label: "Ellipse" },
  { id: "triangle", label: "Triangle" },
  { id: "diamond", label: "Diamond" },
];

type P = { x: number; y: number };

/** Points along the closed or open outline, dense enough that the stroke smoothing keeps corners tight. */
function densify(path: P[], step: number): P[] {
  const out: P[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/**
 * Outline of a shape dragged from `a` to `b` (world coordinates), as ordinary stroke points.
 * A shape is saved as a normal stroke, so it can be moved, recolored, erased and exported like any drawing.
 */
export function shapePoints(kind: ShapeKind, a: P, b: P, lineWidth: number): RawStrokePoint[] {
  const l = Math.min(a.x, b.x), r = Math.max(a.x, b.x), t = Math.min(a.y, b.y), bt = Math.max(a.y, b.y);
  const cx = (l + r) / 2, cy = (t + bt) / 2;
  let path: P[];
  switch (kind) {
    case "line":
      path = [a, b];
      break;
    case "arrow": {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const head = Math.min(len * 0.4, Math.max(28, lineWidth * 5));
      const wing = (s: number): P => ({ x: b.x - head * (ux * Math.cos(0.5) - s * uy * Math.sin(0.5)), y: b.y - head * (uy * Math.cos(0.5) + s * ux * Math.sin(0.5)) });
      path = [a, b, wing(1), b, wing(-1)];
      break;
    }
    case "rect":
      path = [{ x: l, y: t }, { x: r, y: t }, { x: r, y: bt }, { x: l, y: bt }, { x: l, y: t }];
      break;
    case "triangle":
      path = [{ x: cx, y: t }, { x: r, y: bt }, { x: l, y: bt }, { x: cx, y: t }];
      break;
    case "diamond":
      path = [{ x: cx, y: t }, { x: r, y: cy }, { x: cx, y: bt }, { x: l, y: cy }, { x: cx, y: t }];
      break;
    case "ellipse": {
      const rx = (r - l) / 2, ry = (bt - t) / 2, n = Math.max(24, Math.min(96, Math.round((rx + ry) / 6)));
      path = [...Array(n + 1)].map((_, i) => ({ x: cx + rx * Math.cos((i / n) * 2 * Math.PI), y: cy + ry * Math.sin((i / n) * 2 * Math.PI) }));
      break;
    }
  }
  return densify(path, 14).map((p, i) => ({ dt: i * 4, x: p.x, y: p.y, pressure: 32767 }));
}
