// Selecting several items in the library and acting on them together; the default view for all notebooks.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, drag, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(350); };
await ev(`window.confirm = () => true; window.__dl = []; URL.createObjectURL = (b) => { window.__dl.push(b.type || 'blob'); return 'blob:x'; };`);
const cardsT = () => ev(`[...document.querySelectorAll('#lib-grid .card:not(.create) .card-title span')].map(e => e.textContent).join(',')`);
const card = (t) => `[...document.querySelectorAll('#lib-grid .card:not(.create)')].find(c => c.querySelector('.card-title span').textContent === ${JSON.stringify(t)})`;
const tap = async (t, mods = "") => { await ev(`${card(t)}.querySelector('.card-thumb').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true${mods} }))`); await sleep(300); };
const bar = () => ev(`(() => { const b = document.getElementById('sel-bar'); return b.classList.contains('hidden') ? '' : [...b.children].map(e => e.textContent).join('|'); })()`);
const barBtn = async (label) => { await ev(`[...document.querySelectorAll('#sel-bar button')].find(e => e.textContent === ${JSON.stringify(label)}).click()`); await sleep(600); };
const note = async (title) => {
  await click(".card.create .card-thumb"); await click('#pm-kind button[data-v="pages"]'); await click("#pm-ok"); await sleep(1100);
  const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
  await click("#tool-pen"); await drag([[r.x + 400, r.y + 300], [r.x + 500, r.y + 330]]);
  await ev(`window.prompt = () => ${JSON.stringify(title)}`); await click("#btn-more"); await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Rename')).click()`); await sleep(400);
  await click("#btn-back"); await sleep(800);
};
const notebook = async (name) => { await click(".card.create .card-thumb"); await click('#pm-kind button[data-v="notebook"]'); await ev(`document.getElementById('pm-name').value = ${JSON.stringify(name)}`); await click("#pm-ok"); await sleep(400); await click('#lib-title button.crumb'); };

for (const t of ["A", "B", "C"]) await note(t);
await notebook("NB");
ok((await cardsT()).split(",").sort().join() === "A,B,C,NB", `four items at the top level (${await cardsT()})`);

// select with the button, then taps
await click("#btn-select");
ok(await bar() !== "" && (await bar()).startsWith("Tap notes to select"), "the select button turns selecting on, with a bar");
await tap("A"); await tap("B");
ok((await bar()).startsWith("2 selected"), `taps select instead of opening (${(await bar()).split("|")[0]})`);
ok(await ev(`document.getElementById('view-editor').classList.contains('hidden')`), "no note was opened");
ok((await bar()).includes("Move to…") && (await bar()).includes("Download (.zip)") && !(await bar()).includes("Colour…"), "actions that fit notes (no Colour for notes)");

// move both into the notebook
await barBtn("Move to…");
await ev(`[...document.querySelectorAll('#move-list button')].find(e => e.textContent.trim() === 'NB').click()`); await sleep(700);
ok((await cardsT()).split(",").sort().join() === "C,NB", `Move to… moved both into NB (${await cardsT()})`);
ok(await bar() === "", "and selecting ends");

// inside: select all, duplicate, download as one zip
await ev(`${card("NB")}.querySelector('.card-thumb').click()`); await sleep(500);
await click("#btn-select");
await barBtn("Select all");
ok((await bar()).startsWith("2 selected"), "Select all picks everything shown");
await barBtn("Duplicate");
ok((await cardsT()).split(",").sort().join() === "A,A copy,B,B copy", `Duplicate copies each note (${await cardsT()})`);
await click("#btn-select"); await barBtn("Select all");
await barBtn("Download (.zip)"); await sleep(400);
ok(await ev(`window.__dl.length`) === 1, `four notes download as ONE file (${await ev(`JSON.stringify(window.__dl)`)})`);

// Ctrl-click starts selecting too; trash two, restore from the Trash
await tap("A copy", ", ctrlKey: true"); await tap("B copy");
ok((await bar()).startsWith("2 selected"), "Ctrl-click starts selecting");
await barBtn("Move to trash");
ok((await cardsT()).split(",").sort().join() === "A,B", "two moved to the trash at once");
await click('.side-item[data-filter="trash"]');
await click("#btn-select"); await barBtn("Select all");
ok((await bar()).includes("Restore") && (await bar()).includes("Delete forever"), "in the Trash: Restore and Delete forever");
await barBtn("Restore");
await click('.side-item[data-filter="all"]');
await ev(`${card("NB")}.querySelector('.card-thumb').click()`); await sleep(500);
ok((await cardsT()).split(",").length === 4, "restored to their notebook");

// Esc leaves selecting
await click("#btn-select"); await tap("A");
await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(400);
ok(await bar() === "" && !await ev(`document.querySelector('#lib-grid .card.selected')`), "Esc ends selecting");

// default view for all notebooks; a notebook's own choice is kept
await click('#lib-title button.crumb');
await notebook("NB2");
await click("#btn-sort"); await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.trim() === 'Sections').click()`); await sleep(400);
await ev(`${card("NB2")}.querySelector('.card-thumb').click()`); await sleep(500);
ok(!await ev(`document.getElementById('lib-sections').classList.contains('hidden')`), "Sort > Notebooks open in Sections: a notebook opens in Sections");
await click('#lib-view button[data-v="grid"]'); // this one is set to Grid on its own
await click('#lib-title button.crumb');
await ev(`${card("NB")}.querySelector('.card-thumb').click()`); await sleep(500);
ok(!await ev(`document.getElementById('lib-sections').classList.contains('hidden')`), "other notebooks follow the default");
await click('#lib-title button.crumb');
await ev(`${card("NB2")}.querySelector('.card-thumb').click()`); await sleep(500);
ok(!await ev(`document.getElementById('lib-grid').classList.contains('hidden')`), "and NB2 keeps its own choice (Grid)");

b.close();
finish();
