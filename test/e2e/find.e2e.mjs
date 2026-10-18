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

// a recognizer (Windows / Android in the real apps): by default every line is read in English AND Korean, both are searched
await ev(`window.__fakeInk = async (lines, lang) => { (window.__inkLangs ||= []).push(lang); window.__inkCalls = (window.__inkCalls || 0) + 1; return lines.map((l, i) => i === 0 ? (lang === 'ko' ? '안녕 하세요' : 'hello') : 'second line world'); }`);
await ev(`(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })); })()`); await sleep(1200);
ok(/Handwriting read \(한국어 \+ English\): 2 lines/.test(await status()), `Ctrl+F opens it and the handwriting is read in both languages by default (${await status()})`);
ok(await ev(`window.__inkLangs.join()`) === "en,ko", `one call per language for the page (${await ev(`window.__inkLangs.join()`)})`);
await type("#find-input", "녕하");
ok(await count() === "1 of 1", `Korean handwriting is found, spaces ignored (${await count()})`);
await type("#find-input", "hello");
ok(await count() === "1 of 1", "and the English reading of the same line");
await type("#find-input", "world");
ok(await count() === "1 of 1", "the second line, read the same in both languages, is ONE hit");
const readList = await ev(`[...document.querySelectorAll('#find-read-list .fr-line')].map(e => e.textContent).join('|')`);
ok(!await ev(`document.getElementById('find-read').classList.contains('hidden')`) && readList.includes("enhello") && readList.includes("ko안녕 하세요"), `"What was read" lists each line's text per language (${readList})`);
await type("#find-input", "e");
const n = await count();
ok(/^1 of \d+$/.test(n) && Number(n.split(" of ")[1]) >= 3, `several hits across typed text and handwriting (${n})`);
await ev(`document.getElementById('find-next').click()`); await sleep(400);
ok(await count() === `2 of ${n.split(" of ")[1]}`, "Next moves to the next hit");
await click("#find-close");
ok(await ev(`document.getElementById('find-bar').classList.contains('hidden')`), "× closes it");

// the reading is kept: opening again reads nothing new until the ink changes
await click("#btn-find"); await sleep(800);
ok(await ev(`window.__inkCalls`) === 2, "opened again: nothing read again (the page did not change)");
// writing while Find is open: read again a moment after the pen stops, no need to reopen
await drag([[r.x + 600, r.y + 600], [r.x + 680, r.y + 640]]);
await sleep(2500);
ok(await ev(`window.__inkCalls`) === 4, `new ink is read while Find stays open (${await ev(`window.__inkCalls`)} calls)`);
await click("#find-close");

b.close();
finish();
