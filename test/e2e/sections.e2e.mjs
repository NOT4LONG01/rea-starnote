// The OneNote-style view of a notebook: a Grid / Sections switch, sections as coloured tabs, a page list you can reorder,
// a page rail beside the editor, and Quick Notes for notes outside any notebook.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, drag, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(300); };
const tabs = () => ev(`[...document.querySelectorAll('#lib-sections .sec-tab:not(.add)')].map(e => e.textContent + (e.classList.contains('active') ? '*' : '')).join(',')`);
const rows = () => ev(`[...document.querySelectorAll('#lib-sections .page-row:not(.folder) .pr-title')].map(e => e.textContent).join(',')`);
const notebook = async (name, via) => { await click(via); await click('#pm-kind button[data-v="notebook"]'); await ev(`document.getElementById('pm-name').value = ${JSON.stringify(name)}`); await click("#pm-ok"); await sleep(300); };
const draw = async () => { const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse); await click("#tool-pen"); await drag([[r.x + 500, r.y + 300], [r.x + 600, r.y + 330], [r.x + 700, r.y + 300]]); };
const openNb = async (title) => { await ev(`[...document.querySelectorAll('#lib-grid .card')].find(c => c.querySelector('.card-title span')?.textContent === ${JSON.stringify(title)}).querySelector('.card-thumb').click()`); await sleep(500); };
const rename = async (title) => { await ev(`window.prompt = () => ${JSON.stringify(title)}`); await click("#btn-more"); await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Rename')).click()`); await sleep(400); };

// a notebook opens in the grid; the switch shows only inside a notebook
ok(!await ev(`document.getElementById('lib-view').classList.contains('hidden')`) && await ev(`document.querySelector('#lib-view .active').textContent`) === "Grid", "at the top level the switch shows the default for all notebooks (Grid)");
await notebook("Physics", ".card.create .card-thumb");
ok(!await ev(`document.getElementById('lib-view').classList.contains('hidden')`) && await ev(`document.querySelector('#lib-view .active').textContent`) === "Grid", "inside a notebook: the switch, on Grid");
await click('#lib-view button[data-v="sections"]');
ok(await tabs() === "Physics*", `Sections: the notebook's own pages have a tab while it has no sections (${await tabs()})`);

// + Section makes a section and opens it
await notebook("Mechanics", "#lib-sections .sec-tab.add");
ok(await tabs() === "Mechanics*", `+ Section adds a tab and opens it; an empty notebook tab is not shown (${await tabs()})`);
ok(await ev(`[...document.querySelectorAll('#lib-title .crumb')].map(e => e.textContent).join(' > ')`) === "All notes > Physics > Mechanics", "the path shows notebook > section");

// + Page goes straight to the editor; the rail lists the section's pages
await click("#lib-sections .page-add"); await sleep(1200);
await draw(); await rename("Kinematics");
ok(!await ev(`document.getElementById('page-rail').classList.contains('hidden')`), "the page rail is open beside the editor");
await ev(`document.querySelector('#page-rail .rail-add').click()`); await sleep(1200);
await draw(); await rename("Dynamics");
const rail = await ev(`[...document.querySelectorAll('#page-rail .rail-item b')].map(e => e.textContent + (e.parentElement.classList.contains('current') ? '*' : '')).join(',')`);
ok(rail === "Kinematics,Dynamics*", `+ Page in the rail adds the next page; the rail marks the open one (${rail})`);
ok(await ev(`[...document.querySelectorAll("#page-rail .rail-group")].map(e => e.textContent).join()`) === "Mechanics", "the rail shows the whole notebook, sections as headings");
await ev(`[...document.querySelectorAll('#page-rail .rail-item')].find(e => e.textContent.includes('Kinematics')).click()`); await sleep(1200);
ok(await ev(`document.getElementById('doc-title').textContent`) === "Kinematics", "clicking a page in the rail opens it");
await click("#btn-back"); await sleep(800);

// the page list: oldest first, drag to reorder, and the order sticks
ok(await rows() === "Kinematics,Dynamics", `the page list in the section (${await rows()})`);
await ev(`(() => {
  const r = [...document.querySelectorAll('#lib-sections .page-row')];
  const from = r.find(e => e.textContent.includes('Dynamics')), to = r.find(e => e.textContent.includes('Kinematics'));
  const box = to.getBoundingClientRect(), dt = new DataTransfer();
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: box.x + 20, clientY: box.y + 3 }));
  fire(from, 'dragstart'); fire(to, 'dragover'); fire(to, 'drop'); fire(from, 'dragend');
})()`); await sleep(600);
ok(await rows() === "Dynamics,Kinematics", `dragging a page above another reorders the list (${await rows()})`);
await ev(`[...document.querySelectorAll('#lib-sections .page-row')].find(e => e.textContent.includes('Kinematics')).querySelector('button').click()`); await sleep(300);
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.trim() === 'Move up').click()`); await sleep(600);
ok(await rows() === "Kinematics,Dynamics", "and Move up in a page's menu does it on touch");

// Android's Back button (the app's own handler): editor -> library, section -> out of the notebook, top level -> leave the app
await ev(`[...document.querySelectorAll('#lib-sections .page-row')][0].click()`); await sleep(1200);
const backed = await ev(`window.__reaBack()`); await sleep(800); // leaving saves first
ok(backed === true && await ev(`document.getElementById('view-editor').classList.contains('hidden')`), "Back in the editor returns to the library");
ok(await ev(`[...document.querySelectorAll('#lib-title .crumb')].map(e => e.textContent).join(' > ')`) === "All notes > Physics > Mechanics", "to the section it came from");
await click("#lib-sections .sec-tab.active .sec-menu");
const closed = await ev(`window.__reaBack()`); await sleep(300); // the menu plays its closing motion first
ok(closed === true && await ev(`document.getElementById('popover').classList.contains('hidden')`), "Back closes an open menu first");
ok(await ev(`window.__reaBack()`) === true && await ev(`document.getElementById('lib-title').textContent`) === "All notes", "then leaves the notebook (not just the section)");
ok(await ev(`window.__reaBack()`) === false, "at the top level Back is left to Android (the app closes)");
await openNb("Physics");

// colour of a section
await click("#lib-sections .sec-tab.active .sec-menu");
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Colour')).click()`); await sleep(300);
await ev(`document.querySelectorAll('#popover .color-swatches button')[3].click()`); await sleep(600);
ok(await ev(`getComputedStyle(document.querySelector('#lib-sections .sec-tab.active')).getPropertyValue('--c').trim()`) === "#4caf50", "a section gets a colour");

// the view choice is kept per notebook; Grid still works
await click('#lib-view button[data-v="grid"]');
ok(!await ev(`document.getElementById('lib-grid').classList.contains('hidden')`) && await ev(`document.getElementById('lib-sections').classList.contains('hidden')`), "Grid brings the cards back");
await click('#lib-view button[data-v="sections"]');

// Quick Notes: notes outside any notebook
await click('#lib-title button.crumb');
await click(".card.create .card-thumb"); await click('#pm-kind button[data-v="pages"]'); await click("#pm-ok"); await sleep(1200);
await draw(); await click("#btn-back"); await sleep(800);
await click('.side-item[data-filter="quick"]');
ok(await ev(`document.getElementById('lib-title').textContent`) === "Quick Notes", "Quick Notes in the sidebar");
const quick = await ev(`[...document.querySelectorAll('#lib-grid .card:not(.create) .card-title span')].map(e => e.textContent).join(',')`);
ok(quick === "Untitled note" && await ev(`document.getElementById('count-quick').textContent`) === "1", `it shows just the loose note, not the notebook's pages (${quick})`);

// Grid with the Manual sort: drag a card to reorder (the same order as the Sections view)
await click('.side-item[data-filter="all"]');
await openNb("Physics");
await click('#lib-view button[data-v="grid"]');
// (a notebook opens on its first section in the Sections view, so the grid now shows Mechanics)
ok(await ev(`[...document.querySelectorAll('#lib-title .crumb')].map(e => e.textContent).join(' > ')`) === "All notes > Physics > Mechanics", "in the Mechanics section, as a grid");
await click("#btn-sort");
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Manual')).click()`); await sleep(500);
const gridTitles = () => ev(`[...document.querySelectorAll('#lib-grid .card:not(.create) .card-title span')].map(e => e.textContent).join(',')`);
ok(await gridTitles() === "Kinematics,Dynamics", `Manual sort shows the manual order (${await gridTitles()})`);
await ev(`(() => {
  const c = [...document.querySelectorAll('#lib-grid .card:not(.create)')];
  const from = c.find(e => e.textContent.includes('Dynamics')), to = c.find(e => e.textContent.includes('Kinematics'));
  const r = to.getBoundingClientRect(), dt = new DataTransfer();
  const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 40 }));
  fire(from, 'dragstart'); fire(to, 'dragover'); fire(to, 'drop'); fire(from, 'dragend');
})()`); await sleep(600);
ok(await gridTitles() === "Dynamics,Kinematics", `dragging a card onto the left half of another puts it before (${await gridTitles()})`);
await click('#lib-view button[data-v="sections"]');
ok(await rows() === "Dynamics,Kinematics", "and the Sections page list shows the same order");
await click('#lib-view button[data-v="grid"]');
await ev(`[...document.querySelectorAll('#lib-grid .card:not(.create)')].find(e => e.textContent.includes('Dynamics')).querySelector('.card-title button').click()`); await sleep(300);
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.trim() === 'Move later').click()`); await sleep(600);
ok(await gridTitles() === "Kinematics,Dynamics", "Move later in the card menu does it on touch");

b.close();
finish();
