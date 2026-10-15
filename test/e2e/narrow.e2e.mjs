// A narrow window (a desktop window snapped small, a phone in portrait): nothing overflows sideways, and the Math panel
// becomes a bottom sheet so the page stays visible above it.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 400, height: 760 });
const { ev, drag, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(300); };
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);

ok(await overflow() <= 0, `the library fits a 400 px window (overflow ${await overflow()} px)`);
await click(".card.create .card-thumb");
ok(await ev(`(() => { const r = document.querySelector('#page-modal .modal-card').getBoundingClientRect(); return r.left >= 0 && r.right <= 400; })()`), "the Create dialog fits");
await click('#pm-kind button[data-v="pages"]');
await click("#pm-ok"); await sleep(1500);
ok(await overflow() <= 0, `the editor fits (overflow ${await overflow()} px)`);
await click("#tool-text");
await ev(`[...document.querySelectorAll('#tool-options .opt-chip')].find(e => e.textContent === 'Math').click()`); await sleep(200);
const box = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
await drag([[box.x + 120, box.y + 120]]); await sleep(500);
const p = await ev(`JSON.stringify((() => { const r = document.getElementById('text-editor').getBoundingClientRect(); const c = document.getElementById('canvas-container').getBoundingClientRect(); return { hidden: document.getElementById('text-editor').classList.contains('hidden'), left: r.left - c.left, right: c.right - r.right, bottom: c.bottom - r.bottom, top: r.top - c.top, ch: c.height }; })())`).then(JSON.parse);
ok(!p.hidden && Math.abs(p.left) < 2 && Math.abs(p.right) < 2 && Math.abs(p.bottom) < 2 && p.top > p.ch * 0.4, `the Math panel is a bottom sheet, the page shows above it (${JSON.stringify(p)})`);

b.close();
finish();
