// Notebooks (folders) in the library: create, nest, put notes in them, move (menu and drag and drop), search across them, trash and restore.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, drag, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(300); };
await ev(`window.__names = []; window.prompt = () => window.__names.shift() ?? null; window.confirm = () => true;`);
const name = (n) => ev(`window.__names.push(${JSON.stringify(n)})`);
const crumbs = () => ev(`[...document.querySelectorAll('#lib-title .crumb')].map(e => e.textContent).join(' > ')`);
const cards = () => ev(`JSON.stringify([...document.querySelectorAll('#lib-grid .card:not(.create)')].map(c => ({ title: c.querySelector('.card-title span').textContent, folder: c.classList.contains('folder-card'), sub: c.querySelector('.card-date')?.textContent })))`).then(JSON.parse);
const titles = async () => (await cards()).map((c) => c.title).join();
const cardMenu = async (title, item) => {
  await ev(`(() => { const c = [...document.querySelectorAll('#lib-grid .card')].find(c => c.querySelector('.card-title span')?.textContent === ${JSON.stringify(title)}); c.querySelector('.card-title button').click(); })()`); await sleep(300);
  await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.trim() === ${JSON.stringify(item)}).click()`); await sleep(400);
};
const openCard = async (title) => { await ev(`[...document.querySelectorAll('#lib-grid .card')].find(c => c.querySelector('.card-title span')?.textContent === ${JSON.stringify(title)}).querySelector('.card-thumb').click()`); await sleep(400); };
const crumb = async (label) => { await ev(`[...document.querySelectorAll('#lib-title button.crumb')].find(e => e.textContent === ${JSON.stringify(label)}).click()`); await sleep(300); };
const dnd = async (fromTitle, toSel) => ev(`(() => {
  const from = [...document.querySelectorAll('#lib-grid .card')].find(c => c.querySelector('.card-title span')?.textContent === ${JSON.stringify(fromTitle)});
  const to = ${toSel};
  const dt = new DataTransfer();
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  fire(from, 'dragstart'); fire(to, 'dragover'); fire(to, 'drop'); fire(from, 'dragend');
})()`).then(() => sleep(500));

// ---- create and nest
ok(await crumbs() === "All notes", "the library starts at 'All notes'");
await name("Physics"); await click("#btn-new-folder");
let c = await cards();
ok(c.length === 1 && c[0].folder && c[0].title === "Physics" && c[0].sub === "0 notes", "New notebook creates a notebook card");
await openCard("Physics");
ok(await crumbs() === "All notes > Physics", `opening it shows the path (${await crumbs()})`);
await name("Lab"); await click(".card.create.folder .card-thumb");
ok(await titles() === "Lab", "a notebook can be created inside a notebook");

// ---- a note made inside a notebook belongs to it
await ev(`document.querySelector('.card.create:not(.folder) .card-thumb').click()`); await sleep(500);
await click("#pm-ok"); await sleep(1500);
const box = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
await click("#tool-pen");
await drag([[box.x + 300, box.y + 300], [box.x + 400, box.y + 340], [box.x + 500, box.y + 300]]);
await click("#btn-back"); await sleep(800);
ok(await crumbs() === "All notes > Physics", "leaving the editor returns to the notebook");
ok(await titles() === "Lab,Untitled note", `the new note is inside Physics, notebooks first (${await titles()})`);
ok((await cards()).find((x) => x.title === "Lab").sub === "0 notes", "Lab is empty");

// ---- the top level has only the notebook; its count includes what is inside
await crumb("All notes");
c = await cards();
ok(c.length === 1 && c[0].title === "Physics" && c[0].sub === "1 note", `at the top level: just Physics, counting 1 note (${JSON.stringify(c)})`);
ok(await ev(`document.getElementById('count-all').textContent`) === "1", "'All notes' counts notes, not notebooks");

// ---- move with the menu
await openCard("Physics");
await cardMenu("Untitled note", "Move to…");
const rows = await ev(`[...document.querySelectorAll('#move-list button')].map(e => e.textContent.trim() + (e.disabled ? ' (off)' : ''))`);
ok(rows.join("|") === "All notes (top level)|Physics (off)|Lab", `the chooser lists the top level and every notebook; the current place is off (${rows.join("|")})`);
await ev(`[...document.querySelectorAll('#move-list button')].find(e => e.textContent.trim() === 'Lab').click()`); await sleep(500);
ok(await titles() === "Lab", "the note left Physics");
await openCard("Lab");
ok(await crumbs() === "All notes > Physics > Lab" && await titles() === "Untitled note", "and is in Lab (path three deep)");

// ---- move with drag and drop: to the top level through the breadcrumb, then back into Physics through its card
await dnd("Untitled note", `document.querySelector('#lib-title button.crumb')`);
ok(await titles() === "", "dragging a card onto 'All notes' in the path moves it to the top level");
await crumb("All notes");
ok((await titles()).split(",").sort().join() === "Physics,Untitled note", `it is at the top level now (${await titles()})`);
await dnd("Untitled note", `[...document.querySelectorAll('#lib-grid .card.folder-card')].find(c => c.querySelector('.card-title span').textContent === 'Physics')`);
ok(await titles() === "Physics", "dragging a note onto a notebook card puts it inside");
ok((await cards())[0].sub === "1 note", "the count follows");

// a notebook can't be dropped into itself or its own contents
await openCard("Physics");
await dnd("Lab", `[...document.querySelectorAll('#lib-grid .card.folder-card')].find(c => c.querySelector('.card-title span').textContent === 'Lab')`);
ok(await titles() === "Lab,Untitled note", "a notebook can't be dropped onto itself");
await crumb("All notes");

// ---- search looks everywhere
await ev(`(() => { const i = document.getElementById('lib-search'); i.value = 'untitled'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(400);
ok(await titles() === "Untitled note", "a search finds a note inside a notebook from the top level");
await ev(`(() => { const i = document.getElementById('lib-search'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(300);

// ---- trash and restore a notebook with its contents
await cardMenu("Physics", "Move to trash");
ok((await cards()).length === 0, "trashing a notebook removes it from the library");
await click('.side-item[data-filter="trash"]');
c = await cards();
ok(c.length === 1 && c[0].title === "Physics" && c[0].folder, `the Trash shows it as one card, not everything inside (${JSON.stringify(c.map((x) => x.title))})`);
await cardMenu("Physics", "Restore");
await click('.side-item[data-filter="all"]');
ok(await titles() === "Physics" && (await cards())[0].sub === "1 note", "restoring brings the notebook back with its note");

b.close();
finish();
