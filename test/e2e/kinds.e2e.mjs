// The two kinds of note from the New note dialog: pages, and an infinite canvas you can write on anywhere.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, send, drag, sleep } = b;
const click = async (sel) => { await ev(`document.querySelector('${sel}').click()`); await sleep(250); };
const wheel = async (x, y, dy, n = 1) => { for (let i = 0; i < n; i++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy }); await sleep(120); } await sleep(400); };
const dark = (sel) => ev(`(() => { const c = document.querySelector('${sel}'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] + d[i + 1] + d[i + 2] < 450) n++; return n; })()`);
const label = () => ev(`document.getElementById('page-label').textContent`);
const create = async (kind) => {
  await ev(`document.querySelector('.card.create .card-thumb').click()`); await sleep(500);
  await click(`#pm-kind button[data-v="${kind}"]`);
  const dlg = await ev(`JSON.stringify({ size: !document.getElementById('pm-size-rows').classList.contains('hidden'), note: document.getElementById('pm-kind-note').textContent, spacing: [...document.querySelectorAll('#pm-spacing button')].map(e => e.textContent) })`).then(JSON.parse);
  await click("#pm-ok"); await sleep(1500);
  return dlg;
};
const box = async () => ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);

// ---- dialog
await ev(`document.querySelector('.card.create .card-thumb').click()`); await sleep(500);
const kinds = await ev(`[...document.querySelectorAll('#pm-kind button')].map(e => e.textContent).join()`);
const spacings = await ev(`[...document.querySelectorAll('#pm-spacing button')].map(e => e.textContent).join()`);
ok(kinds === "Pages,Infinite", `the New note dialog offers the two types (${kinds})`);
ok(spacings === "Narrow,Medium,Wide", `and a line spacing (${spacings})`);
ok(await ev(`document.querySelector('#pm-spacing button.active')?.textContent`) === "Medium", "Medium (about 7 mm lines) is the default");
await click("#pm-cancel");

// ---- infinite: ink anywhere
const dlg = await create("infinite");
ok(!dlg.size, "Infinite hides paper/orientation too");
const inf = await box();
const cx = inf.x + inf.width / 2, cy = inf.y + inf.height / 2;
ok(await ev(`document.getElementById('pagenav').classList.contains('hidden')`), "no page navigation on an infinite canvas");
await click("#tool-pen");
const base = await dark("#note-canvas");
await drag([[cx - 100, cy], [cx, cy + 40], [cx + 100, cy]]);
const first = await dark("#note-canvas");
ok(first > base + 100, `a stroke is drawn (${base} -> ${first})`);
await wheel(cx, cy, 900, 20); // far below the first tile: where no tile exists yet
const far = await dark("#note-canvas");
await drag([[cx - 100, cy], [cx, cy + 40], [cx + 100, cy]]);
const second = await dark("#note-canvas");
ok(second > far + 100, `writing far outside the first tile works too (${far} -> ${second})`);
ok(await ev(`document.body.innerText.includes('Tap on a page')`) === false, "no 'stay on the page' refusal");
await wheel(cx, cy, 900, 20);
const empty = await dark("#note-canvas");
ok(empty < second, `the paper keeps going: empty ruled space further down (${empty} dark px)`);

b.close();
finish();
