// Find in note: typed text everywhere; handwriting once the AI has read it, only when asked ("Read handwriting (AI)"), here
// with a stand-in model (window.__fakeAiLines) that "reads" each numbered line. Nothing leaves the machine.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, send, drag, sleep, newNote } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(300); };
const type = async (sel, text) => { await ev(`(() => { const i = document.querySelector('${sel}'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(400); };
const count = () => ev(`document.getElementById('find-count').textContent`);
const status = () => ev(`document.getElementById('find-status').textContent`);
const aiButton = () => ev(`(() => { const b = document.getElementById('find-ai'); return b.classList.contains('hidden') ? '' : b.textContent; })()`);

await newNote();
const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
// two handwritten "lines" far apart, and one typed text
await click("#tool-pen");
for (const y of [160, 420]) await drag([[r.x + 200, r.y + y], [r.x + 260, r.y + y + 30], [r.x + 320, r.y + y], [r.x + 380, r.y + y + 30]]);
await click("#tool-text"); await drag([[r.x + 200, r.y + 300]]); await send("Input.insertText", { text: "typed lemma" }); await sleep(200);
await click("#tool-pen");

// nothing is read until asked: typed text is found, the handwriting waits for the AI button
await ev(`window.__aiCalls = 0; window.__fakeAiLines = async (png, n) => { window.__aiCalls++; window.__aiN = n; window.__aiPng = png; const o = {}; for (let i = 1; i <= n; i++) o[i] = i === 1 ? '안녕 하세요 hello' : 'second line world'; return o; }`);
await click("#btn-find");
ok(!await ev(`document.getElementById('find-bar').classList.contains('hidden')`) && await ev(`document.activeElement.id`) === "find-input", "the search button opens the Find bar, ready to type");
await sleep(500);
ok(/not read yet/.test(await status()) && /Read handwriting \(AI\)/.test(await aiButton()) && await ev(`window.__aiCalls`) === 0, `opening Find reads nothing; it offers the AI (${await status()})`);
await type("#find-input", "LEMMA");
ok(await count() === "1 of 1", `typed text is found, ignoring case (${await count()})`);
await type("#find-input", "world");
ok(await count() === "No matches", "handwriting not read yet: no match in it");

// Read handwriting (AI): asks first, then one request per page with the lines numbered
await ev(`window.confirm = (m) => { window.__asked = m; return true; }; localStorage.setItem('starnote_ai_key', 'sk-test'); localStorage.setItem('starnote_ai_model', 'test/model:free');`);
await click("#find-ai"); await sleep(1500);
ok(/1 page/.test(await ev(`window.__asked ?? ''`)) && await ev(`window.__aiCalls`) === 1 && await ev(`window.__aiN`) === 2 && await ev(`window.__aiPng.startsWith('iVBOR')`), "after asking, the page goes to the AI once, as a picture of its 2 numbered lines");
ok(/Handwriting read by the AI: 2 lines/.test(await status()) && await aiButton() === "", `then it says what was read and hides the button (${await status()})`);
ok(await count() === "1 of 1", `the search runs again by itself: "world" is found in the handwriting (${await count()})`);
await type("#find-input", "녕하");
ok(await count() === "1 of 1", `Korean handwriting is found, spaces ignored (${await count()})`);
const readList = await ev(`[...document.querySelectorAll('#find-read-list .fr-line')].map(e => e.textContent).join('|')`);
ok(!await ev(`document.getElementById('find-read').classList.contains('hidden')`) && readList === "ai안녕 하세요 hello|aisecond line world", `"What was read" lists each line (${readList})`);
await type("#find-input", "e");
const n = await count();
ok(/^1 of \d+$/.test(n) && Number(n.split(" of ")[1]) >= 3, `several hits across typed text and handwriting (${n})`);
await ev(`document.getElementById('find-next').click()`); await sleep(400);
ok(await count() === `2 of ${n.split(" of ")[1]}`, "Next moves to the next hit");
await click("#find-close");
ok(await ev(`document.getElementById('find-bar').classList.contains('hidden')`), "× closes it");

// the reading is kept: opening again reads nothing; new ink is only offered, never read without asking
await click("#btn-find"); await sleep(800);
ok(await ev(`window.__aiCalls`) === 1 && await aiButton() === "", "opened again: nothing to read, nothing sent");
await drag([[r.x + 600, r.y + 600], [r.x + 680, r.y + 640]]);
await sleep(2500);
ok(await ev(`window.__aiCalls`) === 1 && /Read handwriting/.test(await aiButton()) && /1 page/.test(await status()), `new ink while Find is open: offered for reading, not sent (${await status()})`);
// a failed read: the reason, a Retry and a way to change the model; Retry then reads the page
await ev(`window.__fakeAiLines = async () => { throw new Error('test/model:free gave no answer (stop).'); }`);
await click("#find-ai"); await sleep(1200);
ok(/Could not read handwriting: test\/model:free gave no answer.*1 page not read yet/.test(await status()) && await aiButton() === "Retry" && !await ev(`document.getElementById('find-ai-model').classList.contains('hidden')`), `a failure says why, with Retry and Change model (${await status()})`);
await ev(`window.__fakeAiLines = async (png, n) => { window.__aiCalls++; const o = {}; for (let i = 1; i <= n; i++) o[i] = 'third'; return o; }`);
await click("#find-ai"); await sleep(1500);
ok(/Handwriting read by the AI/.test(await status()) && await aiButton() === "" && await ev(`document.getElementById('find-ai-model').classList.contains('hidden')`), `Retry reads it (${await status()})`);
await click("#find-close");

b.close();
finish();
