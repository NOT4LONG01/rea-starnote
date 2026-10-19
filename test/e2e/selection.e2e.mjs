// Selections made with the pen's side button (any tool, the Hand included) move by dragging inside their box, with the plain
// pen or a finger, whatever tool is chosen; a finger outside the box still pans. (Windows owner, 1.0.1: lassoed ink could not
// be moved, and the side button did nothing with the Hand tool.)
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, drag, send, sleep, newNote } = b;
const pen = (type, [x, y], button = "left", buttons = 1) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : button, buttons, clickCount: 1, pointerType: "pen" });
const sideLasso = async (pts) => { await pen("mousePressed", pts[0], "right", 2); for (const p of pts.slice(1)) await pen("mouseMoved", p, "right", 2); await pen("mouseReleased", pts.at(-1), "right", 0); await sleep(300); };
const touch = async (pts) => {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const [x, y] of pts.slice(1)) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(300);
};
const strokes = () => ev(`JSON.stringify(window.__starnote.renderer.getUserStrokes().map(s => [Math.round(s.points[0].x), Math.round(s.points[0].y)]))`).then(JSON.parse);
const selected = () => ev(`window.__starnote.renderer.hasSelection()`);
const view = () => ev(`JSON.stringify([window.__starnote.renderer.panX, window.__starnote.renderer.panY])`);

await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await newNote();
const c = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
const P = (x, y) => [c.x + x, c.y + y];
const box = [P(250, 250), P(450, 250), P(450, 380), P(250, 380), P(250, 250)];

// the Lasso tool (the owner's 1.0.1 case): lasso, open the selection's options, drag inside the box with the pen
await ev(`document.getElementById('tool-pen').click()`); await sleep(200);
await drag([P(300, 500), P(340, 530), P(380, 500), P(400, 530)], "pen");
await ev(`document.getElementById('tool-lasso').click()`); await sleep(200);
await drag([P(250, 450), P(450, 450), P(450, 580), P(250, 580), P(250, 450)], "pen");
await ev(`document.getElementById('tool-lasso').click()`); await sleep(300); // its options ("pick a color or size") open over the page
const l0 = await strokes();
ok(await selected() && !await ev(`document.getElementById('tool-options').classList.contains('hidden')`), "the Lasso tool selects it; the selection's options are open");
await drag([P(330, 515), P(380, 545), P(430, 575)], "pen");
const l1 = await strokes();
ok(l1.length === 1 && l1[0][0] > l0[0][0] + 50, `a pen drag inside the box moves it (${JSON.stringify(l0)} -> ${JSON.stringify(l1)})`);
await newNote(); // a fresh page for the next case

// the pen tool: lasso with the side button, then drag inside the box with the plain pen
await ev(`document.getElementById('tool-pen').click()`); await sleep(200);
await drag([P(300, 300), P(340, 330), P(380, 300), P(400, 330)], "pen");
const s0 = await strokes();
await sideLasso(box);
ok(await selected(), "the side button lassoes the stroke with the pen tool");
await drag([P(330, 315), P(380, 345), P(430, 375)], "pen");
let s1 = await strokes();
ok(s1.length === 1 && s1[0][0] > s0[0][0] + 50 && s1[0][1] > s0[0][1] + 30, `a plain-pen drag inside the box moves it, it does not draw (${JSON.stringify(s0)} -> ${JSON.stringify(s1)})`);

// the Hand tool: the side button still lassoes; a finger inside the box moves it (palm rejection on), outside it pans
await ev(`document.getElementById('tool-pan').click()`); await sleep(200);
await ev(`window.__starnote.renderer.stylusOnly = true`);
const [x1, y1] = [s1[0][0], s1[0][1]]; // world; back to the screen to lasso around the moved stroke
const scr = await ev(`(() => { const r = window.__starnote.renderer, k = r.zoom / devicePixelRatio; return JSON.stringify([${c.x} + (${x1} * r.zoom + r.panX) / devicePixelRatio, ${c.y} + (${y1} * r.zoom + r.panY) / devicePixelRatio, k]); })()`).then(JSON.parse);
const [sx, sy] = scr;
await sideLasso([[sx - 40, sy - 40], [sx + 160, sy - 40], [sx + 160, sy + 90], [sx - 40, sy + 90], [sx - 40, sy - 40]]);
ok(await selected(), "with the Hand tool the side button lassoes too");
const v0 = await view();
await touch([[sx + 30, sy + 15], [sx + 60, sy + 45], [sx + 90, sy + 75]]);
const s2 = await strokes();
ok(s2[0][0] > s1[0][0] + 30 && await view() === v0, `a finger drag inside the box moves it (palm rejection on), no pan (${JSON.stringify(s1)} -> ${JSON.stringify(s2)})`);
await touch([[c.x + 900, c.y + 600], [c.x + 860, c.y + 560]]);
ok(await view() !== v0 && JSON.stringify(await strokes()) === JSON.stringify(s2), "a finger outside the box pans the page and leaves the ink");

b.close();
finish();
