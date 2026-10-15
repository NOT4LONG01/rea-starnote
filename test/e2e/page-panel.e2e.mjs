// The page panel on the right of the editor: the page's format applied live (this page or all), and the page actions.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(300); };
const chip = async (label, text) => { await ev(`(() => { const ls = [...document.querySelectorAll('#page-panel .pm-label')]; const g = ls.find(l => l.textContent === ${JSON.stringify(label)}).nextElementSibling; [...g.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}).click(); })()`); await sleep(400); };
const act = async (text) => { await ev(`[...document.querySelectorAll('#page-panel .pp-actions button')].find(b => b.textContent === ${JSON.stringify(text)}).click()`); await sleep(600); };
const head = () => ev(`document.querySelector('#page-panel .pp-head span').textContent`);
const fmt = (i) => ev(`JSON.stringify(window.__starnote.renderer.pageFormatAt(${i}))`).then(JSON.parse);
await ev(`window.confirm = () => true`);

await click(".card.create .card-thumb"); await click('#pm-kind button[data-v="pages"]'); await click('#pm-paper button[data-v="a4"]'); await click("#pm-ok"); await sleep(1200);
ok(await ev(`document.getElementById('page-panel').classList.contains('hidden')`), "the page panel starts closed");
await click("#btn-page-panel");
ok(!await ev(`document.getElementById('page-panel').classList.contains('hidden')`) && await head() === "Page 1 of 1", `the top-bar button opens it on the right (${await head()})`);
const r = await ev(`JSON.stringify((() => { const p = document.getElementById('page-panel').getBoundingClientRect(), c = document.getElementById('canvas-container').getBoundingClientRect(); return { right: Math.round(c.right - p.right), top: Math.round(p.top - c.top) }; })())`).then(JSON.parse);
ok(r.right === 0 && r.top === 0, "docked to the right edge");

await chip("Orientation", "Landscape");
let f = await fmt(0);
ok(f.w > f.h && f.w === 2100, `Landscape turns the page live (${f.w}x${f.h})`);
await chip("Paper", "A5");
f = await fmt(0);
ok(f.w === 1485 && f.h === 1046, `A5 keeps the orientation (${f.w}x${f.h})`);
await chip("Line spacing", "Wide");
ok((await fmt(0)).spacing === 70, "line spacing applies");

await act("+ Page after");
ok(await head() === "Page 2 of 2", `+ Page after adds and shows page 2 (${await head()})`);
await chip("Apply to", "All pages");
await chip("Page style", "Grid");
ok((await fmt(0)).template === "grid" && (await fmt(1)).template === "grid", "All pages: the style goes to every page");
await chip("Apply to", "This page");
await chip("Page style", "Dotted");
ok((await fmt(1)).template === "dots" && (await fmt(0)).template === "grid", "This page: only the current page changes");
await act("Move up");
ok((await fmt(0)).template === "dots" && await head() === "Page 1 of 2", "Move up moves the page and follows it");
await act("Delete page");
ok(await head() === "Page 1 of 1" && (await fmt(0)).template === "grid", "Delete page removes it");
ok(await ev(`[...document.querySelectorAll('#page-panel .pp-actions button')].find(b => b.textContent === 'Delete page').disabled`), "the last page can't be deleted");

// it stays open for the next note; an infinite canvas has one style for the whole sheet
await click("#btn-back"); await sleep(800);
await click(".card.create .card-thumb"); await click('#pm-kind button[data-v="infinite"]'); await click("#pm-ok"); await sleep(1200);
ok(await head() === "Infinite canvas", "the panel stays open; an infinite canvas shows its sheet style");
await chip("Page style", "Dotted");
ok(await ev(`window.__starnote.renderer.canvasStyle().template`) === "dots", "and the style changes the whole canvas");
await click("#page-panel .pp-head button");
ok(await ev(`document.getElementById('page-panel').classList.contains('hidden')`), "× closes it");

b.close();
finish();
