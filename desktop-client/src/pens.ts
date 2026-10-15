/**
 * The three pens offered in the UI. Ballpoint, fountain pen and marker are settings of the Pen (steady <-> pressure-
 * sensitive, plus its size); the highlighter's opacity is adjustable. A stroke keeps only the result (width, alpha,
 * pressure sensitivity), never the pen, so notes made with any pen look the same.
 */
export interface PenType {
  id: "pen" | "brush" | "highlighter";
  label: string;
  widthScale: number;  // multiplies the Thin / Medium / Thick size
  sensitivity: number; // how much pressure changes the width (0 = constant width)
  alpha: number;       // ink opacity
  color?: string;      // the colour a highlighter starts with
}

export const PEN_KINDS: PenType[] = [
  { id: "pen", label: "Pen", widthScale: 1, sensitivity: 0.6, alpha: 1 },
  { id: "brush", label: "Brush", widthScale: 1.6, sensitivity: 1, alpha: 1 },
  { id: "highlighter", label: "Highlighter", widthScale: 4.5, sensitivity: 0, alpha: 0.35, color: "#f5d742" },
];

export const penById = (id: string) => PEN_KINDS.find((p) => p.id === id) ?? PEN_KINDS[0];

/** A pen with the user's setting applied: pressure response for pen and brush, opacity for the highlighter. */
export const penFor = (id: PenType["id"], setting?: number): PenType => {
  const k = penById(id);
  return setting === undefined ? k : k.id === "highlighter" ? { ...k, alpha: setting } : { ...k, sensitivity: setting };
};

/** Size multiplier for an existing stroke, so resizing a selection keeps a highlighter fat. */
export const penScaleOf = (st: { pen?: string; alpha?: number }) =>
  st.pen ? penById(st.pen).widthScale : st.alpha !== undefined && st.alpha < 0.9 ? 4.5 : 1;
