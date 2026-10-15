/**
 * LaTeX -> SVG with MathJax (pure JS, no DOM, no fonts to load). Loaded on first use so the editor starts fast.
 * A math object is stored in the note as an ordinary text box whose text is `$$<latex>$$`: any app that doesn't
 * typeset math still shows readable LaTeX source.
 */
export const isMathText = (t: string) => /^\$\$[\s\S]*\$\$$/.test(t.trim()) && t.trim().length > 4;
export const latexOf = (t: string) => t.trim().slice(2, -2).trim();
export const wrapLatex = (latex: string) => `$$${latex.trim()}$$`;

export interface MathSvg {
  svg: string;      // standalone SVG, sized in px, drawn in `color`
  width: number;
  height: number;
  error?: string;   // set when MathJax could not parse the formula (the SVG then shows the message)
}

let engine: Promise<(latex: string) => { svg: string; error?: string }> | null = null;

function load() {
  engine ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] = await Promise.all([
      import("mathjax-full/js/mathjax.js"),
      import("mathjax-full/js/input/tex.js"),
      import("mathjax-full/js/output/svg.js"),
      import("mathjax-full/js/adaptors/liteAdaptor.js"),
      import("mathjax-full/js/handlers/html.js"),
      import("mathjax-full/js/input/tex/AllPackages.js"),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document("", { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: "none" }) });
    return (latex: string) => {
      const node = doc.convert(latex, { display: true });
      const html = adaptor.outerHTML(node);
      const svg = /<svg[\s\S]*<\/svg>/.exec(html)?.[0] ?? "";
      const err = /data-mjx-error="([^"]*)"/.exec(svg)?.[1];
      return { svg, error: err ? err.replace(/&quot;/g, '"') : undefined };
    };
  })();
  return engine;
}

/** MathJax sizes in ex; 1ex = half the font size. */
const EX = 0.5;

export async function renderMath(latex: string, fontPx: number, color: string): Promise<MathSvg> {
  const { svg, error } = (await load())(latex);
  const m = /width="([\d.]+)ex" height="([\d.]+)ex"/.exec(svg.slice(0, 600));
  const width = Math.max(1, parseFloat(m?.[1] ?? "0") * EX * fontPx), height = Math.max(1, parseFloat(m?.[2] ?? "0") * EX * fontPx);
  const sized = svg
    .replace(/(<svg[^>]*?)\swidth="[^"]*"/, `$1 width="${width.toFixed(2)}"`)
    .replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${height.toFixed(2)}"`)
    .replace(/currentColor/g, color);
  return { svg: sized, width, height, error };
}
