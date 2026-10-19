// Toolbar behaviour in a real browser: one row, a popover for the tool's choices, pen settings popover, pen icon follows the type.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, drag, newNote, sleep } = b;
const click = async (id) => { await ev(`document.getElementById('${id}').click()`); await sleep(200); };
// opens a tool's popover whatever state it is in (the first tap opens, a tap on the active tool toggles)
const openFor = async (id) => { await click(id); if ((await pop()).hidden) await click(id); };
const pop = () => ev(`(() => { const p = document.getElementById('tool-options'); const r = p.getBoundingClientRect(); return JSON.stringify({ hidden: p.classList.contains('hidden'), icons: [...p.querySelectorAll('.icon-btn')].map(e => e.title), swatches: [...p.querySelectorAll('.swatch')].map(e => e.title.split(' ')[0]), sizes: p.querySelectorAll('.wdot').length, chips: [...p.querySelectorAll('.opt-chip')].map(e => e.textContent), range: !!p.querySelector('input[type=range]'), custom: !!p.querySelector('input[type=color]'), box: [r.left, r.top, r.right, r.bottom] }); })()`).then(JSON.parse);

await b.newNote();
ok((await pop()).hidden, "no second bar: nothing but the tool row until a tool's popover is opened");
ok(await ev(`document.querySelectorAll('.toolrow .swatch, .toolrow .wdot').length`) === 0, "the toolbar row holds only buttons");

await click("tool-pen");
ok((await pop()).hidden, "choosing a tool only selects it: nothing opens over the page (Linux QA 1.0.1 F-A)");
await click("tool-pen"); // a second tap opens its options
let p = await pop();
const penBtn = await ev(`JSON.stringify(document.getElementById('tool-pen').getBoundingClientRect())`).then(JSON.parse);
ok(!p.hidden && p.icons.join() === "Pen,Brush,Highlighter" && p.swatches.length === 4 && p.sizes === 5, `Pen popover: 3 icon-only pens, 4 colors, 5 sizes (${p.swatches.join(" ")})`);
ok(!p.range && !p.custom && !p.chips.includes("Auto order"), "no pressure slider, no custom-color row and no 'Auto order' in it");
ok(p.box[1] >= penBtn.bottom && p.box[2] <= 1280 && p.box[3] <= 800, "it opens under the Pen button and stays on screen");

// the pen button follows the selected type
await ev(`document.querySelector('#tool-options button[title="Brush"]').click()`); await sleep(200);
ok(await ev(`document.querySelector('#tool-pen i').dataset.icon`) === "brush", "choosing Brush changes the pen button's icon to the brush");
await ev(`document.querySelector('#tool-options button[title="Highlighter"]').click()`); await sleep(200); // the popover stays open after choosing a type
ok(await ev(`document.querySelector('#tool-pen i').dataset.icon`) === "highlighter", "Highlighter changes it to the highlighter");
p = await pop();
ok(p.swatches[0] === "#f5d742" && p.swatches.length === 4, "the highlighter has its own 4 colors");

// pen settings popover
await click("btn-pen-detail");
const settings = await ev(`JSON.stringify({ hidden: document.getElementById('popover').classList.contains('hidden'), text: document.getElementById('popover').textContent, range: !!document.querySelector('#popover input[type=range]'), color: !!document.querySelector('#popover input[type=color]') })`).then(JSON.parse);
ok(!settings.hidden && settings.range && settings.color && /Opacity/.test(settings.text), "the small settings button opens Opacity (highlighter) + custom color");
ok((await pop()).hidden, "and the tool popover closes while it is open");
await ev(`document.querySelector('#popover input[type=range]').value = 60; document.querySelector('#popover input[type=range]').dispatchEvent(new Event('input', {bubbles:true}))`);
ok(await ev(`localStorage.getItem('sn.pen.highlighter')`) === "0.6", "the opacity setting is stored");
await openFor("tool-pen"); await ev(`document.querySelector('#tool-options button[title="Pen"]').click()`); await sleep(200); await click("btn-pen-detail");
ok(/Pressure/.test(await ev(`document.getElementById('popover').textContent`)), "for the pen the same button shows Pressure (steady <-> sensitive)");

// colors: drag to reorder, stays at 4, custom takes the last slot
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
await ev(`document.getElementById('popover').classList.add('hidden')`); await openFor("tool-pen");
const sw = async () => (await pop()).swatches;
const before = await sw();
const rects = await ev(`JSON.stringify([...document.querySelectorAll('#tool-options .swatch')].map(e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }))`).then(JSON.parse);
await drag([rects[0], [rects[0][0] + 20, rects[0][1]], rects[3]]);
const after = await sw();
ok(after.length === 4 && after[3] === before[0], `dragging the first color to the end reorders them (${after.join(" ")})`);
await click("btn-pen-detail");
await ev(`(() => { const i = document.querySelector('#popover input[type=color]'); i.value = '#123456'; i.dispatchEvent(new Event('change', {bubbles:true})); })()`);
await openFor("tool-text"); await openFor("tool-pen");
const withCustom = await sw();
ok(withCustom.length === 4 && withCustom[3] === "#123456", "a custom color replaces the last slot (still 4 colors)");

// the page closes the popover
const box = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
await drag([[box.x + 300, box.y + 300], [box.x + 400, box.y + 330], [box.x + 500, box.y + 300]]);
ok((await pop()).hidden, "touching the page closes the popover");

// eraser: size popover
await openFor("tool-eraser");
p = await pop();
ok(!p.hidden && p.chips.join() === "Small,Medium,Large,Clear page" && p.swatches.length === 0, "Eraser popover: sizes and Clear page, no colors");

// wide phone (landscape, short): the popover sits beside the rail
await b.send("Emulation.setDeviceMetricsOverride", { width: 846, height: 411, deviceScaleFactor: 2, mobile: false });
await sleep(500);
await openFor("tool-pen"); p = await pop();
const rail = await ev(`JSON.stringify(document.getElementById('tool-pen').getBoundingClientRect())`).then(JSON.parse);
ok(!p.hidden && p.box[0] >= rail.right && p.box[3] <= 411, "wide phone: the popover opens to the right of the tool rail and fits the screen");

// one Fit button: height first, then width, alternating; it shows the next fit
const fitInfo = () => ev(`JSON.stringify({ title: document.getElementById('btn-fit').title, zoom: document.getElementById('zoom-level').textContent, old: ['btn-zoom-reset','btn-fit-width','btn-fit-height'].filter(i => document.getElementById(i)).length })`).then(JSON.parse);
let f = await fitInfo();
ok(f.old === 0 && f.title === "Fit page height", "a single Fit button, offering page height first");
await click("btn-fit"); const z1 = (await fitInfo()).zoom;
f = await fitInfo();
ok(f.title === "Fit page width", `after fitting the height the button offers the width (${z1})`);
await click("btn-fit");
f = await fitInfo();
ok(f.title === "Fit page height" && f.zoom !== z1, `then the width (${f.zoom}), and it offers the height again`);

// the eraser: picking it and tapping it again opens its options (it does not clear the page); a double tap on the eraser
// already in use clears the page (one Undo brings it back)
const ink = () => ev(`[...window.__starnote.renderer.doc.tiles.values()].reduce((k, t) => k + t.strokes.length, 0) + window.__starnote.renderer.getUserStrokes().length`);
await click("tool-pen"); await click("tool-pen"); if (!(await pop()).hidden) await click("tool-pen");
{ const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse); await drag([[r.x + 500, r.y + 400], [r.x + 600, r.y + 440]]); }
const inkBefore = await ink();
await ev(`document.getElementById('tool-eraser').click(); document.getElementById('tool-eraser').click()`); await sleep(400); // pick it, then a quick second tap
ok(await ink() === inkBefore && inkBefore > 0 && !(await pop()).hidden, `picking the eraser and tapping it again opens its options, the page keeps its ink (${inkBefore})`);
await ev(`document.getElementById('tool-eraser').click(); document.getElementById('tool-eraser').click()`); await sleep(400); // a double tap on the eraser in use
ok(await ink() === 0, "a double tap on the eraser in use clears the page");
await click("tool-undo");
ok(await ink() === inkBefore, "and Undo brings the ink back");

b.close();
finish();
