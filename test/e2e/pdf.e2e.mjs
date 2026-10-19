// An imported PDF keeps its text (read at import; the pages themselves become pictures): Find searches it, and the words the
// highlighter covers are listed as highlighted passages (what an assistant would be given).
import { launch, ok, finish } from "./cdp.mjs";

/** A one-page PDF (US Letter) with Helvetica text lines [text, x, y from the bottom]. */
function makePdf(lines) {
  const content = lines.map(([t, x, y]) => `BT /F1 24 Tf ${x} ${y} Td (${t}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  return out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, drag, sleep } = b;
const count = () => ev(`document.getElementById('find-count').textContent`);
const type = async (text) => { await ev(`(() => { const i = document.getElementById('find-input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(400); };
const pdf = makePdf([["The quick brown fox", 72, 700], ["jumps over the lazy dog", 72, 660]]);

await ev(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(pdf)}], 'Lecture.pdf', { type: 'application/pdf' })); const i = document.getElementById('note-file-input'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await sleep(4000);
if (await ev(`document.getElementById('view-editor').classList.contains('hidden')`)) { // imported into the library: open it
  await ev(`[...document.querySelectorAll('#lib-grid .card:not(.create)')].find(c => c.textContent.includes('Lecture')).querySelector('.card-thumb').click()`);
  await sleep(1500);
}
ok(!await ev(`document.getElementById('view-editor').classList.contains('hidden')`), "the imported PDF opens");

await ev(`document.getElementById('btn-find').click()`); await sleep(1200);
ok(/PDF text is searched too/.test(await ev(`document.getElementById('find-status').textContent`)), `Find says the PDF's text is searched (${await ev(`document.getElementById('find-status').textContent`)})`);
await type("brown");
ok(await count() === "1 of 1", `a word of the PDF is found (${await count()})`);
await type("LAZY DOG");
ok(await count() === "1 of 1", "a phrase too, ignoring case");
await type("brown");
// the mark sits over "brown" on the page: highlight "quick brown" by drawing along that line with the highlighter
const mark = JSON.parse(await ev(`JSON.stringify(window.__starnote.renderer.findMarks[0])`));
const scr = await ev(`(() => { const r = window.__starnote.renderer, c = document.getElementById('note-canvas').getBoundingClientRect(), d = devicePixelRatio; const m = ${JSON.stringify(mark)}; return JSON.stringify({ x0: c.left + (m.l * r.zoom + r.panX) / d, x1: c.left + (m.r * r.zoom + r.panX) / d, y: c.top + (((m.t + m.b) / 2) * r.zoom + r.panY) / d, w: (m.r - m.l) * r.zoom / d }); })()`).then(JSON.parse);
ok(scr.x1 > scr.x0 && scr.w > 10, `the match is marked where the word is (${Math.round(scr.w)} px wide)`);
await ev(`document.getElementById('find-close').click()`); await sleep(300);

await ev(`document.getElementById('tool-pen').click()`); await sleep(300);
await ev(`document.querySelector('#tool-options button[title="Highlighter"]').click()`); await sleep(300);
const quickStart = scr.x0 - scr.w * 1.15; // "quick " sits just left of "brown"
await drag([[quickStart, scr.y], [(quickStart + scr.x1) / 2, scr.y], [scr.x1 - 2, scr.y]]);
await ev(`document.getElementById('btn-find').click()`); await sleep(1200);
const read = await ev(`[...document.querySelectorAll('#find-read-list .fr-line')].map(e => e.textContent).join('|')`);
ok(!await ev(`document.getElementById('find-read').classList.contains('hidden')`) && read === "hlquick brown", `"What was read" lists the highlighted passage (${read})`);
ok(await ev(`window.__starnote.renderer.inkByPage().length`) === 0, "the highlighter stroke is not handwriting (nothing sent to a recognizer)");

b.close();
finish();
