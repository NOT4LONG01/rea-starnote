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

await test("readHandwritingLines asks for the numbered lines and takes them by number, also inside fences or with gaps", async () => {
  reply(200, { choices: [{ message: { content: '```json\n{"1": " Claim ", "3": "명제"}\n```' } }] });
  assert.deepEqual(await ai.readHandwritingLines("iVBORw0", 3), ["Claim", "", "명제"]);
  const body = JSON.parse(sent.init.body);
  assert.match(body.messages[0].content[0].text, /red number at its left, 1 to 3/);
  reply(200, { choices: [{ message: { content: "Sorry, I can't read this." } }] });
  await assert.rejects(ai.readHandwritingLines("x", 2), /not the expected list of lines/);
});

await test("an empty answer names the model and why; a list-of-parts answer is read; the budget leaves room to think", async () => {
  reply(200, { choices: [{ message: { content: "" }, finish_reason: "length" }] });
  await assert.rejects(ai.readHandwritingLines("x", 2), /vendor\/model:free ran out of room/);
  assert.equal(JSON.parse(sent.init.body).max_tokens, 4096);
  reply(200, { choices: [{ message: { content: null }, finish_reason: "content_filter" }] });
  await assert.rejects(ai.readMath("x"), /vendor\/model:free gave no answer \(content_filter\)/);
  reply(200, { choices: [{ message: { content: [{ type: "text", text: '{"1": "a", ' }, { type: "text", text: '"2": "b"}' }] } }] });
  assert.deepEqual(await ai.readHandwritingLines("x", 2), ["a", "b"]);
});

await test("a router: tried twice, the error names the model that answered and says to pick one that reads images", async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => { calls++; sent = { url, init }; return new Response(JSON.stringify({ model: "some/text-only-model", choices: [{ message: { content: "" }, finish_reason: "stop" }] }), { status: 200 }); };
  await assert.rejects(ai.readHandwritingLines("x", 1, { key: "k", model: "openrouter/free" }), /openrouter\/free \(answered by some\/text-only-model\) gave no answer.*A router can pass the picture to a model that cannot see/);
  assert.equal(calls, 2, "one retry");
  assert.equal(ai.isRouter("openrouter/auto"), true);
  assert.equal(ai.isRouter("qwen/qwen2.5-vl-72b-instruct:free"), false);
});

await test("visionModels keeps image readers only, free ones first", async () => {
  reply(200, { data: [
    { id: "a/text", name: "Text only", architecture: { input_modalities: ["text"] } },
    { id: "b/paid", name: "Alpha", architecture: { input_modalities: ["text", "image"] }, pricing: { prompt: "0.001", completion: "0.002" } },
    { id: "c/free:free", name: "Zeta", architecture: { input_modalities: ["image", "text"] } },
    { id: "openrouter/free", name: "Free Models Router", architecture: { input_modalities: ["image", "text"] }, pricing: { prompt: "0", completion: "0" } },
  ] });
  const list = await ai.visionModels();
  assert.deepEqual(list.map((m) => [m.id, m.free]), [["c/free:free", true], ["b/paid", false]], "routers are left out");
});

console.log(`\n${passed} ai tests passed`);
