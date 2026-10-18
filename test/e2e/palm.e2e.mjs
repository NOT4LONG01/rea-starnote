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

b.close();
finish();
