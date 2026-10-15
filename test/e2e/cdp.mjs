// Tiny browser-test harness: starts the dev server if it is not running, launches headless Chrome with a fresh profile and
// talks to it over the DevTools protocol. Needs Google Chrome (or CHROME=/path/to/chrome). Used by the *.e2e.mjs scripts.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const URL_APP = "http://localhost:1420/";

async function up() { try { return (await fetch(URL_APP)).ok; } catch { return false; } }

export async function launch({ width = 1280, height = 800, dpr = 1, query = "" } = {}) {
  const children = [];
  if (!(await up())) {
    const vite = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { cwd: root, stdio: "ignore" });
    children.push(vite);
    for (let i = 0; i < 60 && !(await up()); i++) await sleep(500);
    if (!(await up())) throw new Error("the dev server did not start");
  }
  const profile = mkdtempSync(join(tmpdir(), "rea-e2e-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(process.env.CHROME || "google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  children.push(chrome);
  let target;
  for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { await sleep(250); } }
  if (!target) throw new Error("Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
  await send("Page.navigate", { url: URL_APP + query });
  await sleep(2500);
  const mouse = (type, x, y, buttons = 0, pointerType = "mouse") => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount: 1, pointerType });
  const drag = async (pts, pointerType = "mouse") => { await mouse("mousePressed", ...pts[0], 1, pointerType); for (const p of pts.slice(1)) await mouse("mouseMoved", ...p, 1, pointerType); await mouse("mouseReleased", ...pts.at(-1), 0, pointerType); await sleep(250); };
  const close = () => { ws.close(); for (const c of children) c.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  const newNote = async () => { await ev(`document.querySelector('.card.create .card-thumb').click();document.getElementById('pm-ok').click()`); await sleep(1200); };
  return { send, ev, mouse, drag, close, newNote, sleep };
}

let failures = 0;
export const ok = (cond, msg) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
export const finish = () => { console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed"); process.exit(failures ? 1 : 0); };
