// Pen input in a real browser: strokes keep every sample exactly once, in order, with pen events (the hook is ?debug).
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ query: "?debug" });
const { ev, drag, newNote, sleep } = b;
await newNote();
const box = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
const pts = [...Array(60)].map((_, i) => [box.x + 200 + i * 6, box.y + 250 + Math.sin(i / 6) * 40]);
let seenRaw = 0;
await ev(`window.__raw = 0; document.getElementById('note-canvas').addEventListener('pointerrawupdate', () => window.__raw++)`);
await drag(pts, "pen");
seenRaw = await ev(`window.__raw`);
const stroke = await ev(`JSON.stringify(window.__starnote.renderer.getUserStrokes().at(-1)?.points ?? [])`).then(JSON.parse);
ok(stroke.length >= 55 && stroke.length <= 61, `the pen stroke has one point per sample (${stroke.length} points for ${pts.length} samples; rawupdate events seen: ${seenRaw})`);
ok(stroke.every((p, i) => i === 0 || p.dt >= stroke[i - 1].dt), "time never goes backwards");
ok(stroke.every((p, i) => i === 0 || p.x !== stroke[i - 1].x || p.y !== stroke[i - 1].y), "no point is repeated");
// a mouse stroke is unchanged
await drag(pts.map(([x, y]) => [x, y + 100]));
const mouse = await ev(`JSON.stringify(window.__starnote.renderer.getUserStrokes().at(-1)?.points ?? [])`).then(JSON.parse);
ok(mouse.length >= 55 && mouse.length <= 61, `a mouse stroke is the same (${mouse.length} points)`);
// the ink really is painted
const ink = await ev(`(() => { const c = document.getElementById('note-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i + 1] < 90 && d[i + 2] < 90) n++; return n; })()`);
ok(ink > 300, `both strokes are on the page (${ink} red pixels)`);
b.close();
finish();
