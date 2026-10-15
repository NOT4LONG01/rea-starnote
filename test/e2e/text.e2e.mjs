// Typing right on the page: the Text tool puts a caret where you tap, the text shows live, tapping elsewhere or Esc commits,
// tapping the text again edits it, emptying it deletes it. No floating box for plain text.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, send, drag, newNote, sleep } = b;
const click = async (id) => { await ev(`document.getElementById('${id}').click()`); await sleep(200); };
const type = async (text) => { await send("Input.insertText", { text }); await sleep(150); };
const key = async (k) => { for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k }); await sleep(200); };
// dark pixels on a canvas (the overlay for the live text, the page canvas for committed text)
const dark = (sel) => ev(`(() => { const c = document.querySelector('${sel}'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] + d[i + 1] + d[i + 2] < 450) n++; return n; })()`);
const state = () => ev(`JSON.stringify({ ghost: document.activeElement?.id, editorHidden: document.getElementById('text-editor').classList.contains('hidden') })`).then(JSON.parse);

await newNote();
const blank = await dark("#note-canvas"); // an empty page already has ruling
await click("tool-text");
const box = await ev(`JSON.stringify(document.getElementById('note-canvas').getBoundingClientRect())`).then(JSON.parse);
const at = [box.x + box.width / 2 - 100, box.y + 260];

await drag([at]);
let s = await state();
ok(s.ghost === "text-ghost" && s.editorHidden, "tapping the page with the Text tool starts typing in place (no floating editor box)");

const overlayBefore = await dark(".note-overlay");
await type("Hello");
await key("Enter");
await type("World");
const overlayTyped = await dark(".note-overlay");
ok(overlayTyped > overlayBefore + 200, `the text shows live on the page while typing (${overlayBefore} -> ${overlayTyped} dark pixels)`);

const pageBefore = await dark("#note-canvas");
await drag([[at[0] + 400, at[1] + 200]]); // tap elsewhere: commits, and starts a new empty text there
const pageAfter = await dark("#note-canvas");
ok(pageAfter > pageBefore + 200, `tapping elsewhere commits it onto the page (${pageBefore} -> ${pageAfter})`);
await key("Escape"); // the new empty text: nothing to keep
ok(await dark("#note-canvas") === pageAfter && (await dark(".note-overlay")) < 50, "Esc on an empty text leaves the page as it was");

// edit the committed text: tap it, add a word, Esc commits
await drag([[at[0] + 5, at[1] + 5]]);
s = await state();
ok(s.ghost === "text-ghost", "tapping committed text edits it in place");
await type(" again");
await key("Escape");
const edited = await dark("#note-canvas");
ok(edited > pageAfter + 100, `the edit is committed (${pageAfter} -> ${edited})`);

// undo is one step per commit
await ev(`document.getElementById('tool-undo')?.click()`); await sleep(300);
const undone = await dark("#note-canvas");
ok(undone < edited && undone > blank + 200, `undo reverts just that edit, the first text stays (${edited} -> ${undone})`);

// emptying a text deletes it
await drag([[at[0] + 5, at[1] + 5]]);
await ev(`(() => { const g = document.getElementById('text-ghost'); g.value = ''; g.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await key("Escape");
ok(Math.abs(await dark("#note-canvas") - blank) < 50, "emptying the text and committing deletes the text box");

// switching tool commits what is being typed
await drag([at]);
await type("Switch");
await click("tool-pen");
await sleep(200);
ok(await dark("#note-canvas") > blank + 200 && (await state()).ghost !== "text-ghost", "choosing another tool commits the text");

// Math: a docked panel with the LaTeX source, the formula typeset live on the page
const panel = () => ev(`(() => { const p = document.getElementById('text-editor'); const r = p.getBoundingClientRect(); return JSON.stringify({ hidden: p.classList.contains('hidden'), left: r.left, right: r.right, err: !document.getElementById('te-error').classList.contains('hidden'), errText: document.getElementById('te-error').textContent, focus: document.activeElement?.id }); })()`).then(JSON.parse);
const base = await dark("#note-canvas");
await click("tool-text");
await ev(`[...document.querySelectorAll('#tool-options .opt-chip')].find(e => e.textContent === 'Math').click()`); await sleep(200);
const spot = [at[0] - 100, at[1] + 300];
await drag([spot]);
let pn = await panel();
ok(!pn.hidden && pn.focus === "te-input" && pn.left > box.x + box.width / 2, "Math, then a tap, opens the side panel docked at the right with the source focused");
await sleep(500);
const mathBefore = await dark(".note-overlay");
await type("x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}");
await sleep(1200);
const mathLive = await dark(".note-overlay");
ok(mathLive > mathBefore + 300, `the formula is typeset live on the page while typing (${mathBefore} -> ${mathLive})`);
ok(!(await panel()).err, "no error line for a valid formula");

// a broken formula is refused, with the same message as before; the last good picture stays
await type("\\frac{");
await sleep(900);
pn = await panel();
ok(pn.err, `an error shows under the code (${pn.errText.slice(0, 60)})`);
await key("Escape");
await sleep(500);
pn = await panel();
ok(!pn.hidden, "Esc does not commit a formula with an error: the panel stays open");
await ev(`(() => { const i = document.getElementById('te-input'); i.value = i.value.replace(/\\\\frac\{$/, ''); i.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(900);
await key("Escape");
await sleep(600);
pn = await panel();
const mathCommitted = await dark("#note-canvas");
ok(pn.hidden && mathCommitted > base + 300, `Esc commits a valid formula onto the page and closes the panel (${base} -> ${mathCommitted})`);

// tapping the formula reopens it with its source
await drag([[spot[0] + 6, spot[1] + 6]]);
await sleep(400);
pn = await panel();
ok(!pn.hidden && /frac/.test(await ev(`document.getElementById('te-input').value`)), "tapping a formula reopens the panel with its LaTeX source");
await ev(`document.getElementById('te-cancel').click()`); await sleep(300);
ok((await panel()).hidden && Math.abs(await dark("#note-canvas") - mathCommitted) < 50, "Cancel closes it and the formula is unchanged");

b.close();
finish();
