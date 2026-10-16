// Convert to LaTeX: lasso handwriting, press the sigma, the Math panel opens with what the AI read; Done swaps the ink for the
// formula in one undo step, Cancel keeps the ink. The AI is faked (window.__fakeAi): nothing leaves the machine.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, drag, newNote, sleep } = b;
const click = async (id) => { await ev(`document.getElementById('${id}').click()`); await sleep(250); };
const strokes = () => ev(`window.__starnote.renderer.getUserStrokes().length`);
const formulas = () => ev(`[...window.__starnote.renderer.doc.tiles.values()].flatMap(t => t.textBoxes ?? []).map(b => b.text).join('|')`);
const hidden = (id) => ev(`document.getElementById('${id}').classList.contains('hidden')`);

await newNote();
const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
const x0 = r.x + 300, y0 = r.y + 300;
await click("tool-pen");
await drag([[x0, y0], [x0 + 40, y0 + 40]]);
await drag([[x0 + 40, y0], [x0, y0 + 40]]);
await drag([[x0 + 60, y0 + 20], [x0 + 100, y0 + 20]]);
const inked = await strokes();
ok(inked === 3, `three strokes written (${inked})`);

const lasso = async () => { await click("tool-lasso"); await drag([[x0 - 30, y0 - 30], [x0 + 130, y0 - 30], [x0 + 130, y0 + 70], [x0 - 30, y0 + 70], [x0 - 30, y0 - 30]]); await sleep(300); };
await lasso();
ok(!await hidden("sel-latex"), "a selection shows the Convert to LaTeX button");

// no key yet: the AI settings open instead of sending anything
await ev(`window.__sent = 0; window.__fakeAi = async (png) => { window.__sent++; window.__png = png; return '\`\`\`latex\\nx^{2}\\n\`\`\`'; }`);
await click("sel-latex"); await sleep(300);
ok(!await hidden("ai-modal") && await ev(`window.__sent`) === 0, "without a key and model, Convert opens AI settings and sends nothing");
await ev(`document.getElementById('ai-key').value = 'sk-or-e2e'; document.getElementById('ai-model-id').value = 'test/model:free'`);
await ev(`window.confirm = () => true`);
await click("ai-save"); await sleep(900);
ok(await hidden("ai-modal"), "Save closes the settings");
ok(await ev(`localStorage.getItem('starnote_ai_model')`) === "test/model:free", "a typed model id wins over the list");
ok(await ev(`window.__sent`) === 1 && await ev(`window.__png.startsWith('iVBOR')`), "after saving, the selection is sent once, as a PNG");
ok(!await hidden("text-editor") && await ev(`document.getElementById('te-input').value`) === "x^{2}", "the Math panel opens with the cleaned LaTeX to check");

// Cancel keeps the ink
await click("te-cancel"); await sleep(300);
ok(await strokes() === 3, "Cancel keeps the handwriting");

// again, Done: the ink is replaced by the formula, and one Undo brings the ink back
await lasso();
await click("sel-latex"); await sleep(900);
ok(await ev(`window.__sent`) === 2, "with a key and model set, Convert goes straight to the AI");
await click("te-ok"); await sleep(900);
ok(await hidden("text-editor") && await strokes() === 0 && (await formulas()).includes("x^{2}"), `Done replaces the ink with the formula (${await strokes()} strokes, formulas: ${await formulas()})`);
await click("tool-undo"); await sleep(400);
ok(await strokes() === 3 && await formulas() === "", `one Undo brings the ink back and removes the formula (${await strokes()} strokes, formulas: ${await formulas()})`);
await click("tool-redo"); await sleep(400);
ok(await strokes() === 0 && (await formulas()).includes("x^{2}"), "Redo converts again");

// an AI error is a toast; the ink stays
await ev(`window.__fakeAi = async () => { throw new Error('OpenRouter did not accept the key.'); }`);
await click("tool-undo"); await sleep(300);
await lasso();
await click("sel-latex"); await sleep(600);
ok(await hidden("text-editor") && await strokes() === 3, "an AI failure opens nothing and keeps the ink");
ok(await ev(`[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('did not accept the key'))`), "and says why");

b.close();
finish();
