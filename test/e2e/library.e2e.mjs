// Library behaviour in a real browser: an untouched new note leaves nothing behind, and drawing is autosaved.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({});
const { ev, drag, newNote, sleep } = b;
const tabs = () => ev(`document.querySelectorAll('#tabs .tab').length`);
const cards = () => ev(`document.querySelectorAll('.card:not(.create)').length`);

// an empty new note: Back leaves no card and no tab
await newNote();
ok(await tabs() === 1, "a new note opens in one tab");
await ev(`document.getElementById('btn-back').click()`); await sleep(800);
ok(await cards() === 0 && await tabs() === 0, "going back from an untouched new note leaves no card and no stale tab");

// drawing is autosaved without leaving the note
await newNote();
const box = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
await drag([[box.x + 300, box.y + 300], [box.x + 400, box.y + 340], [box.x + 500, box.y + 300]]);
ok(await ev(`!!document.querySelector('.tab-dirty')`), "right after drawing the tab shows unsaved");
await sleep(5200);
ok(!(await ev(`!!document.querySelector('.tab-dirty')`)), "about 4 seconds later the work is saved by itself");
await ev(`document.getElementById('btn-back').click()`); await sleep(800);
ok(await cards() === 1, "and the note is in the library");
b.close();
finish();
