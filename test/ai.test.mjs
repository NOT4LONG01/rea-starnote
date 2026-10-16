// The OpenRouter connection used by Convert to LaTeX: what is sent, what comes back, and the messages for each failure.
// No network: fetch is replaced. Run: node test/ai.test.mjs
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "sn-ai-"));
writeFileSync(join(tmp, "entry.ts"), `export * from ${JSON.stringify(join(here, "../src/integrations/ai.ts"))};`);
await build({ entryPoints: [join(tmp, "entry.ts")], bundle: true, platform: "node", format: "esm", outfile: join(tmp, "bundle.mjs"), logLevel: "error", external: ["@tauri-apps/*"] });
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const ai = await import(pathToFileURL(join(tmp, "bundle.mjs")).href);

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
let sent = null;
const reply = (status, body) => { globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify(body), { status }); }; };

await test("cleanLatex strips fences, delimiters and a label, and leaves bare LaTeX alone", () => {
  assert.equal(ai.cleanLatex("```latex\n\\frac{a}{b}\n```"), "\\frac{a}{b}");
  assert.equal(ai.cleanLatex("$$x^2$$"), "x^2");
  assert.equal(ai.cleanLatex("\\[ e^{i\\pi}+1=0 \\]"), "e^{i\\pi}+1=0");
  assert.equal(ai.cleanLatex("LaTeX: a+b"), "a+b");
  assert.equal(ai.cleanLatex("$a$ and $b$"), "$a$ and $b$", "two inline pairs are left for the user to see");
  assert.equal(ai.cleanLatex("  \\sum_{i=1}^n i  "), "\\sum_{i=1}^n i");
});

await test("the key and model live on this device; ready only with both", () => {
  assert.equal(ai.aiReady(), false);
  ai.setAiKey("  sk-or-test  "); assert.equal(ai.aiKey(), "sk-or-test");
  assert.equal(ai.aiReady(), false);
  ai.setAiModel("vendor/model:free"); assert.equal(ai.aiReady(), true);
  ai.setAiKey(""); assert.equal(store.has("starnote_ai_key"), false, "Remove key deletes it, not an empty string");
  ai.setAiKey("sk-or-test");
});

await test("readMath sends the picture with the key and model, and returns cleaned LaTeX", async () => {
  reply(200, { choices: [{ message: { content: "```latex\nx=\\frac{1}{2}\n```" } }] });
  assert.equal(await ai.readMath("iVBORw0"), "x=\\frac{1}{2}");
  assert.equal(sent.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent.init.headers.Authorization, "Bearer sk-or-test");
  const body = JSON.parse(sent.init.body);
  assert.equal(body.model, "vendor/model:free");
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,iVBORw0");
});

await test("each failure says what to do", async () => {
  for (const [status, re] of [[401, /did not accept the key/], [402, /needs credits/], [429, /limit for free models/], [500, /OpenRouter 500: boom/]]) {
    reply(status, { error: { message: "boom" } });
    await assert.rejects(ai.readMath("x"), re);
  }
  reply(200, { choices: [{ message: { content: "  " } }] });
  await assert.rejects(ai.readMath("x"), /no answer/);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(ai.readMath("x"), /Could not reach OpenRouter \(offline\)/);
  await assert.rejects(ai.readMath("x", { key: "" }), /Add your OpenRouter key/);
});

await test("visionModels keeps image readers only, free ones first", async () => {
  reply(200, { data: [
    { id: "a/text", name: "Text only", architecture: { input_modalities: ["text"] } },
    { id: "b/paid", name: "Alpha", architecture: { input_modalities: ["text", "image"] }, pricing: { prompt: "0.001", completion: "0.002" } },
    { id: "c/free:free", name: "Zeta", architecture: { input_modalities: ["image", "text"] } },
  ] });
  const list = await ai.visionModels();
  assert.deepEqual(list.map((m) => [m.id, m.free]), [["c/free:free", true], ["b/paid", false]]);
});

console.log(`\n${passed} ai tests passed`);
