// Find in note: typed text everywhere; handwriting through the platform recognizer (here a stand-in that "reads" each line).
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, send, drag, sleep, newNote } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(300); };
const type = async (sel, text) => { await ev(`(() => { const i = document.querySelector('${sel}'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(400); };
const count = () => ev(`document.getElementById('find-count').textContent`);
const status = () => ev(`document.getElementById('find-status').textContent`);

await newNote();
const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
// two handwritten "lines" far apart, and one typed text
await click("#tool-pen");
for (const y of [160, 420]) await drag([[r.x + 200, r.y + y], [r.x + 260, r.y + y + 30], [r.x + 320, r.y + y], [r.x + 380, r.y + y + 30]]);
await click("#tool-text"); await drag([[r.x + 200, r.y + 300]]); await send("Input.insertText", { text: "typed lemma" }); await sleep(200);
await click("#tool-pen");

// no recognizer (as on Linux / the web): typed text only, and it says so
await click("#btn-find");
ok(!await ev(`document.getElementById('find-bar').classList.contains('hidden')`) && await ev(`document.activeElement.id`) === "find-input", "the search button opens the Find bar, ready to type");
await sleep(300);
ok(/can't read handwriting/.test(await status()), `without a recognizer it says typed text only (${await status()})`);
await type("#find-input", "LEMMA");
ok(await count() === "1 of 1", `typed text is found, ignoring case (${await count()})`);
await type("#find-input", "zzz");
ok(await count() === "No matches", "a word that is not there");
await click("#find-close");

// a recognizer (Windows / Android in the real apps): every line is read; Korean and English
await ev(`window.__fakeInk = async (lines, lang) => { window.__inkCalls = (window.__inkCalls || 0) + 1; window.__inkLang = lang; return lines.map((l, i) => i === 0 ? '안녕 하세요 hello' : 'second line world'); }`);
await ev(`(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })); })()`); await sleep(1200);
ok(/Handwriting read/.test(await status()), `Ctrl+F opens it and the handwriting is read (${await status()})`);
ok(await ev(`window.__inkCalls`) === 1, "one call to the recognizer for the page");
await type("#find-input", "녕하");
ok(await count() === "1 of 1", `Korean handwriting is found, spaces ignored (${await count()})`);
await type("#find-input", "world");
ok(await count() === "1 of 1", "the second handwritten line too");
await type("#find-input", "e");
const n = await count();
ok(/^1 of \d+$/.test(n) && Number(n.split(" of ")[1]) >= 3, `several hits across typed text and handwriting (${n})`);
await ev(`document.getElementById('find-next').click()`); await sleep(400);
ok(await count() === `2 of ${n.split(" of ")[1]}`, "Next moves to the next hit");
await click("#find-close");
ok(await ev(`document.getElementById('find-bar').classList.contains('hidden')`), "× closes it");

// the reading is kept: opening again reads nothing new until the ink changes
await click("#btn-find"); await sleep(800);
ok(await ev(`window.__inkCalls`) === 1, "opened again: nothing read again (the page did not change)");
await click("#find-close");
await drag([[r.x + 600, r.y + 600], [r.x + 680, r.y + 640]]);
await click("#btn-find"); await sleep(1000);
ok(await ev(`window.__inkCalls`) === 2, "after writing more, only that page is read again");
await click("#find-close");

b.close();
finish();
