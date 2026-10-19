// A library already upgraded by a newer build (1.0.x and 1.1 builds share one profile) still opens: no "requested version is
// less than the existing version" error, and notes can be made and kept.
import { launch, ok, finish } from "./cdp.mjs";

const b = await launch({ width: 1280, height: 800 });
const { ev, send, sleep, newNote } = b;
// before the app's own code runs on the next load: upgrade the library to a far newer version (stores a newer build might add)
await send("Page.addScriptToEvaluateOnNewDocument", { source: `if (!sessionStorage.seeded) { sessionStorage.seeded = 1; const r = indexedDB.open("starnote-library", 9); r.onupgradeneeded = () => { const d = r.result; for (const s of ["meta", "data", "ink", "future"]) if (!d.objectStoreNames.contains(s)) s === "meta" ? d.createObjectStore(s, { keyPath: "id" }) : d.createObjectStore(s); }; r.onsuccess = () => r.result.close(); }` });
await send("Page.reload"); await sleep(3000);
ok(await ev(`new Promise(r => { const q = indexedDB.open("starnote-library"); q.onsuccess = () => { r(q.result.version); q.result.close(); }; })`) === 9, "the library is at a newer version than this build knows");
ok(!await ev(`[...document.querySelectorAll('.toast')].some(t => /version/i.test(t.textContent))`), "no version error");
await newNote();
await ev(`document.getElementById('btn-back').click()`); await sleep(1200);
ok(await ev(`document.querySelectorAll('#lib-grid .card:not(.create)').length`) >= 0 && !await ev(`[...document.querySelectorAll('.toast.error')].length`), "making a note works, no error");
await send("Page.reload"); await sleep(2500);
ok(!await ev(`[...document.querySelectorAll('.toast.error')].length`), "and after a restart it still opens without an error");

b.close();
finish();
