// Split view: two notes side by side, each with its own pages, zoom and undo; the toolbar acts on the half last touched;
// both are saved; leaving the editor ends the split.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, drag, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(350); };
// every stroke a half shows: saved in the note plus drawn since it was opened
const paneStrokes = (i) => ev(`(() => { const p = window.__starnote.panes[${i}]; return p.r ? [...p.r.doc.tiles.values()].reduce((k, t) => k + t.strokes.length, 0) + p.r.getUserStrokes().length : -1; })()`);
const paneTitle = (i) => ev(`window.__starnote.panes[${i}].s?.item.title ?? ""`);
const rect = (sel) => ev(`JSON.stringify(document.querySelector('${sel}').getBoundingClientRect())`).then(JSON.parse);
const note = async (title) => {
  await click(".card.create .card-thumb"); await click("#pm-ok"); await sleep(900);
  await click("#tool-pen");
  const r = await rect("#pane-0");
  await drag([[r.x + 300, r.y + 200], [r.x + 380, r.y + 240]]);
  await click("#btn-more"); await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Rename')).click()`); await sleep(300);
  await ev(`document.getElementById('ask-input').value = ${JSON.stringify(title)}; document.getElementById('ask-ok').click()`); await sleep(400);
};

await note("Left");
await click("#btn-back"); await sleep(800);
await note("Right");

ok(await ev(`document.getElementById('pane-1').classList.contains('hidden')`), "one note fills the editor until Split is chosen");
await click("#btn-split");
const offered = await ev(`[...document.querySelectorAll('#popover .pop-item')].map(e => e.textContent.trim()).join('|')`);
ok(offered.includes("Left"), `Split offers the other open note (${offered})`);
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Left')).click()`); await sleep(1200);
const r0 = await rect("#pane-0"), r1 = await rect("#pane-1");
ok(!await ev(`document.getElementById('pane-1').classList.contains('hidden')`) && r0.width > 300 && Math.abs(r0.width - r1.width) < 10 && r1.x > r0.x, `two halves side by side (${Math.round(r0.width)} + ${Math.round(r1.width)} px)`);
ok(await paneTitle(0) === "Right" && await paneTitle(1) === "Left", "the current note on the left, the chosen one on the right");
ok(await ev(`document.getElementById('pane-1').classList.contains('focused')`), "the new half has the focus");

// writing in each half goes to that half's note
await drag([[r0.x + 200, r0.y + 300], [r0.x + 260, r0.y + 330]]);
ok(await paneStrokes(0) === 2 && await paneStrokes(1) === 1 && await ev(`document.getElementById('pane-0').classList.contains('focused')`), `a stroke on the left goes to "Right" and moves the focus there (${await paneStrokes(0)} / ${await paneStrokes(1)})`);
await drag([[r1.x + 200, r1.y + 300], [r1.x + 260, r1.y + 330]]);
ok(await paneStrokes(1) === 2 && await paneStrokes(0) === 2, "a stroke on the right goes to \"Left\"");
ok(await ev(`document.getElementById('doc-title').textContent`) === "Left", "the title follows the focused half");
await click("#tool-undo");
ok(await paneStrokes(1) === 1 && await paneStrokes(0) === 2, "Undo acts on the focused half only");

// one toolbar: a tool chosen in one half is the tool in the other
await click("#tool-eraser");
await ev(`document.getElementById('pane-0').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`); await sleep(200);
ok(await ev(`window.__starnote.panes[0].r.activeTool`) === "eraser", "the eraser chosen on the right is the eraser on the left");
await click("#tool-pen");

// tabs: the note in the other half is marked; tapping it moves the focus instead of replacing a half
ok(await ev(`[...document.querySelectorAll('#tabs .tab.shown, .tab.shown')].length`) >= 1, "the other half's tab is marked");
await ev(`[...document.querySelectorAll('.tab')].find(t => t.textContent.includes('Right')).click()`); await sleep(300);
ok(await ev(`document.getElementById('pane-0').classList.contains('focused')`) && await paneTitle(1) === "Left", "tapping the other half's tab focuses that half");

// one window, two halves: each half names its note, the active one has a tinted head (no frame around it)
const heads = () => ev(`JSON.stringify([0, 1].map(i => { const h = document.querySelector('#pane-' + i + ' .pane-head'); return { title: h.querySelector('.pane-title').textContent, bg: getComputedStyle(h).backgroundColor, shown: h.offsetHeight > 0 }; }))`).then(JSON.parse);
let hs = await heads();
ok(hs[0].shown && hs[1].shown && hs[0].title === "Right" && hs[1].title === "Left" && hs[0].bg !== hs[1].bg, `each half names its note; the active one is tinted (${hs.map((h) => h.title + " " + h.bg).join(" | ")})`);
ok(await ev(`getComputedStyle(document.getElementById('pane-0'), '::after').content`) === "none", "no frame drawn around the active half");
// × on the right half: the left note fills the window
await click("#pane-1 .pane-close"); await sleep(400);
ok(await ev(`document.getElementById('pane-1').classList.contains('hidden')`) && await paneTitle(0) === "Right" && !(await heads())[0].shown, "× on the right half closes it; the left note fills the window, no heads");
// split again, then × on the left half: the right one's note moves over
await click("#btn-split");
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Left')).click()`); await sleep(1200);
ok(await paneTitle(1) === "Left", "Split again shows the other note on the right");
await click("#pane-0 .pane-close"); await sleep(600);
ok(await ev(`document.getElementById('pane-1').classList.contains('hidden')`) && await paneTitle(0) === "Left" && await ev(`document.getElementById('doc-title').textContent`) === "Left", "× on the left half: the right half's note fills the window");
ok(await ev(`[...document.querySelectorAll('.tab')].map(t => t.textContent).join('|')`).then((t) => t.includes("Right") && t.includes("Left")), "both notes stay open in their tabs");
await click("#btn-split");
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Right')).click()`); await sleep(1200);

// leaving the editor ends the split and keeps both notes
await click("#btn-back"); await sleep(1500);
ok(await ev(`document.getElementById('pane-1').classList.contains('hidden')`) && !await ev(`document.getElementById('btn-split').classList.contains('on')`), "Back to the library ends the split");
const saved = async (title) => { await ev(`[...document.querySelectorAll('#lib-grid .card:not(.create)')].find(c => c.textContent.includes(${JSON.stringify(title)})).querySelector('.card-thumb').click()`); await sleep(1200); const n = await ev(`[...window.__starnote.renderer.doc.tiles.values()].reduce((k, t) => k + t.strokes.length, 0) + window.__starnote.renderer.getUserStrokes().length`); await click("#btn-back"); await sleep(800); return n; };
const keptRight = await saved("Right"), keptLeft = await saved("Left");
ok(keptRight === 2 && keptLeft === 1, `both notes kept what was written in their half (Right ${keptRight} of 2 strokes, Left ${keptLeft} of 1 after the undo)`);

b.close();
finish();
