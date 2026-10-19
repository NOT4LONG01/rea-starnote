// The Hand tool is selected at start. Palm rejection: a finger draws until a pen has been used on this device; from then on a finger only pans (palm rejection),
// unless the user turns it off in Touch & pen, which is kept across restarts.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800, query: "?debug" });
const { ev, send, drag, newNote, sleep } = b;
const strokes = () => ev(`window.__starnote.renderer.getUserStrokes().length`);
const touch = async (pts) => {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const [x, y] of pts.slice(1)) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
};

await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await newNote();
const r = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
const at = (dx, dy) => [r.x + dx, r.y + dy];
ok(await ev(`document.getElementById('tool-pan').classList.contains('active') && window.__starnote.renderer.activeTool === 'pan'`), "the app starts with the Hand tool");
await drag([at(500, 500), at(560, 520)], "pen");
ok(await strokes() === 0, "with Hand selected even the pen only moves the page");
await ev(`localStorage.removeItem('sn.penseen')`); // (the pen above counted as a pen seen)
await ev(`window.__starnote.renderer.stylusOnly = false`);
await ev(`document.getElementById('tool-pen').click()`); await sleep(200);

ok(await ev(`window.__starnote.renderer.stylusOnly`) === false, "a device that never used a pen: palm rejection is off");
await touch([at(300, 200), at(360, 230), at(420, 200)]);
ok(await strokes() === 1, `so a finger draws (${await strokes()} strokes)`);

await drag([at(300, 300), at(360, 330), at(420, 300)], "pen");
ok(await strokes() === 2 && await ev(`window.__starnote.renderer.stylusOnly`) === true, "the first pen stroke draws and turns palm rejection on");
ok(await ev(`localStorage.getItem('sn.penseen')`) === "1", "and it is remembered for next time");
await touch([at(300, 400), at(360, 430), at(420, 400)]);
ok(await strokes() === 2, `now a finger (or a palm) does not draw (${await strokes()} strokes)`);

// turned off by hand: kept across a restart
await ev(`document.getElementById('btn-pen-settings').click()`); await sleep(300);
await ev(`[...document.querySelectorAll('#popover .pop-item')].find(e => e.textContent.includes('Stylus only')).click()`); await sleep(300);
ok(await ev(`window.__starnote.renderer.stylusOnly`) === false && await ev(`localStorage.getItem('sn.stylus')`) === "0", "Touch & pen > Stylus only turns it off, and the choice is saved");
await ev(`document.getElementById('btn-back').click()`); await sleep(1200); // saved first, so leaving the page asks nothing
await send("Page.reload"); await sleep(2500);
ok(await ev(`window.__starnote.renderer.stylusOnly`) === false, "after a restart the user's choice still wins over \"a pen was seen\"");

// a palm resting on the screen while the pen ERASES (not only while it draws): no pan, no zoom, the erase goes on; with palm
// rejection on (the palm used to pan the page) and off (the palm used to take the erase over)
// (Windows owner, 1.0.1: "palm rejection gets cancelled while using the eraser")
for (const stylusOnly of [true, false]) {
  await newNote();
  await ev(`window.__starnote.renderer.stylusOnly = ${stylusOnly}`);
  const c = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
  const P = (dx, dy) => [c.x + dx, c.y + dy];
  await ev(`document.getElementById('tool-pen').click()`); await sleep(200);
  await drag([300, 340, 380, 400, 420, 460, 500].map((x) => P(x, 320)), "pen"); // points all along, so the eraser meets one
  await ev(`window.__starnote.renderer.stylusOnly = ${stylusOnly}`); // (the first pen stroke turns it on when nobody chose)
  ok(await strokes() === 1, `palm rejection ${stylusOnly ? "on" : "off"}: a pen stroke to erase`);
  await ev(`document.getElementById('tool-eraser').click()`); await sleep(200);
  const view = () => ev(`JSON.stringify([window.__starnote.renderer.panX, window.__starnote.renderer.panY, window.__starnote.renderer.zoom])`);
  const v0 = await view();
  const mouse = (type, [x, y], buttons) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons, clickCount: 1, pointerType: "pen" });
  await mouse("mousePressed", P(400, 200), 1); await mouse("mouseMoved", P(400, 240), 1); // the pen starts erasing above the stroke
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x + 700, y: c.y + 500 }] }); // a palm lands
  for (const dy of [40, 120, 200]) await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x + 700 - dy, y: c.y + 500 - dy }] }); // and slides
  for (const y of [280, 300, 310, 320, 330, 340, 380]) await mouse("mouseMoved", P(400, y), 1); // the pen crosses the stroke (the eraser checks each reported point)
  await mouse("mouseReleased", P(400, 380), 0);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(300);
  ok(await view() === v0, `the palm neither panned nor zoomed the page while erasing (${v0} -> ${await view()})`);
  ok(await strokes() === 0, "and the erase went on: the stroke is gone");
  await ev(`document.getElementById('btn-back').click()`); await sleep(800);
}

b.close();
finish();
