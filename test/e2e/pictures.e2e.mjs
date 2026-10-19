// Pictures in a note: paste (Ctrl+V) or drop one onto the page; it is drawn under the ink, selected with the select tool,
// moved, resized (proportions kept), deleted, undone; it is saved with the note and comes back when the note is reopened.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, drag, sleep, newNote, send } = b;
const pics = () => ev(`JSON.stringify([...window.__starnote.renderer.doc.tiles.values()].flatMap(t => (t.images ?? []).map(i => ({ ...i.rect, tag: t.pageTag, saved: !!i.saved, drawn: !!i.bitmap }))))`).then(JSON.parse);
// a 200 x 100 red picture made in the page, as a File
const makePic = `(() => new Promise(res => { const c = document.createElement('canvas'); c.width = 200; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#e02020'; g.fillRect(0, 0, 200, 100); c.toBlob(bl => res(new File([bl], 'red.png', { type: 'image/png' })), 'image/png'); }))()`;
// the screen position (CSS px) of a world point
const screen = (x, y) => ev(`(() => { const r = window.__starnote.renderer, c = document.getElementById('note-canvas').getBoundingClientRect(), d = devicePixelRatio; return JSON.stringify([c.left + (${x} * r.zoom + r.panX) / d, c.top + (${y} * r.zoom + r.panY) / d]); })()`).then(JSON.parse);
const world = async (p) => { const t = await ev(`JSON.stringify(window.__starnote.renderer.doc.tiles.get(${JSON.stringify(p.tag)}).rect)`).then(JSON.parse); return { l: t.left + p.left, t: t.top + p.top, r: t.left + p.right, b: t.top + p.bottom }; };
const pixelAt = (x, y) => ev(`(() => { const c = document.getElementById('note-canvas'), r = c.getBoundingClientRect(), d = devicePixelRatio; const p = c.getContext('2d').getImageData(Math.round((${x} - r.left) * d), Math.round((${y} - r.top) * d), 1, 1).data; return [p[0], p[1], p[2]].join(','); })()`);
const key = async (k) => { for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: k === "Delete" ? 46 : 0 }); await sleep(300); };

await newNote();
// paste
await ev(`(async () => { const f = await ${makePic}; const dt = new DataTransfer(); dt.items.add(f); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); })()`);
await sleep(1200);
let p = await pics();
ok(p.length === 1 && p[0].drawn && !p[0].saved, `a pasted picture is on the page (${JSON.stringify(p)})`);
ok(Math.abs((p[0].right - p[0].left) / (p[0].bottom - p[0].top) - 2) < 0.01, "with its proportions (2:1)");
ok(await ev(`window.__starnote.renderer.hasPicture() && document.getElementById('tool-lasso').classList.contains('active') && !document.getElementById('sel-delete').classList.contains('hidden')`), "selected, with the select tool and the delete button ready");
let w = await world(p[0]);
const [cx, cy] = await screen((w.l + w.r) / 2, (w.t + w.b) / 2);
ok(await pixelAt(cx, cy) === "224,32,32", `it is drawn on the page (${await pixelAt(cx, cy)})`);

// move
await drag([[cx, cy], [cx + 60, cy + 40], [cx + 120, cy + 80]]); await sleep(300);
let q = await pics();
ok(q.length === 1 && q[0].left > p[0].left + 20 && q[0].top > p[0].top + 20, `dragging moves it (${Math.round(p[0].left)},${Math.round(p[0].top)} -> ${Math.round(q[0].left)},${Math.round(q[0].top)})`);

// resize from the corner handle, proportions kept
w = await world(q[0]);
const [hx, hy] = await screen(w.r, w.b);
await drag([[hx, hy], [hx + 50, hy + 10], [hx + 100, hy + 20]]); await sleep(300);
let s = await pics();
ok(s.length === 1 && s[0].right - s[0].left > q[0].right - q[0].left + 30 && Math.abs((s[0].right - s[0].left) / (s[0].bottom - s[0].top) - 2) < 0.02, `the corner handle resizes it, still 2:1 (${Math.round(q[0].right - q[0].left)} -> ${Math.round(s[0].right - s[0].left)} wide)`);

// undo, redo, delete
await ev(`document.getElementById('tool-undo').click()`); await sleep(300);
ok(Math.abs((await pics())[0].right - q[0].right) < 0.5, "Undo takes the resize back");
await ev(`document.getElementById('tool-redo').click()`); await sleep(300);
ok(Math.abs((await pics())[0].right - s[0].right) < 0.5, "Redo does it again");
w = await world(s[0]);
const [mx, my] = await screen((w.l + w.r) / 2, (w.t + w.b) / 2);
await drag([[mx, my]]); // a tap selects it
await key("Delete");
ok((await pics()).length === 0, "Delete removes the selected picture");
await ev(`document.getElementById('tool-undo').click()`); await sleep(300);
ok((await pics()).length === 1, "and Undo brings it back");

// a finger moves the selected picture with palm rejection on (a finger elsewhere only pans)
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await ev(`window.__starnote.renderer.stylusOnly = true`);
{
  const cur = (await pics())[0], cw = await world(cur);
  const [fx, fy] = await screen((cw.l + cw.r) / 2, (cw.t + cw.b) / 2);
  await drag([[fx, fy]]); // a tap with the select tool selects it (Undo had cleared the selection)
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fx, y: fy }] });
  for (const d of [20, 40, 60]) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fx + d, y: fy + d }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(400);
  const moved = (await pics())[0];
  ok(moved.left > cur.left + 20 && moved.top > cur.top + 20, `a finger drags the selected picture (palm rejection on) (${Math.round(cur.left)} -> ${Math.round(moved.left)})`);
  await ev(`window.__starnote.renderer.stylusOnly = false`);
}

// drop a second one
const [dx, dy] = await screen(w.l + 100, w.b + 300);
await ev(`(async () => { const f = await ${makePic}; const dt = new DataTransfer(); dt.items.add(f); const z = document.getElementById('canvas-container'); z.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: ${dx}, clientY: ${dy}, bubbles: true, cancelable: true })); })()`);
await sleep(1200);
ok((await pics()).length === 2, "a picture dropped onto the page is placed there too");

// saved with the note, back when reopened
await ev(`document.getElementById('btn-back').click()`); await sleep(1500);
await ev(`document.querySelector('#lib-grid .card:not(.create) .card-thumb').click()`); await sleep(1800);
const back = await pics();
ok(back.length === 2 && back.every((x) => x.saved && x.drawn), `both are saved and drawn after reopening (${back.length})`);
ok(back.some((x) => Math.abs(x.right - x.left - (s[0].right - s[0].left)) < 0.5), "the resized one kept its size");

b.close();
finish();
