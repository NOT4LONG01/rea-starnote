/**
 * AI reading through OpenRouter (one key for many models; free models available): the user's own key, typed into the app and kept
 * on this device only. Used for "Convert to LaTeX" (handwritten math -> LaTeX) and for reading handwriting for Find; the AI assistant uses the same connection.
 * Nothing is sent unless the user asks for it.
 */
import { netFetch } from "./net";

const API = "https://openrouter.ai/api/v1";
const KEY = "starnote_ai_key", MODEL = "starnote_ai_model";
const get = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const set = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } };

export const aiKey = () => get(KEY);
export const aiModel = () => get(MODEL);
export const setAiKey = (k: string) => set(KEY, k.trim());
export const setAiModel = (m: string) => set(MODEL, m.trim());
export const aiReady = () => !!aiKey() && !!aiModel();

export interface AiModel { id: string; name: string; free: boolean }
/** What a used-up rate limit or quota says (owner: free models stopped after a few pages). */
const LIMIT = "The free model's limit is used up. Free models are limited per minute and per day: wait for the reset, add a little credit on OpenRouter, or pick a paid model (More > AI settings).";
const isLimit = (message: string) => /rate.?limit|quota|limit (exceeded|reached)|too many requests|free-models-per-(day|min)/i.test(message);

/** OpenRouter's routers ("openrouter/auto", the free-models router): they pick a model per request, maybe one without vision. */
export const isRouter = (id: string) => /^openrouter\//i.test(id.trim());

/** Models that can read images, free ones first (the list is public: no key needed). */
export async function visionModels(): Promise<AiModel[]> {
  const r = await netFetch(`${API}/models`);
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: could not list the models`);
  const j = await r.json();
  return (j.data ?? [])
    .filter((m: any) => (m.architecture?.input_modalities ?? []).includes("image"))
    .filter((m: any) => !isRouter(String(m.id))) // a router is not one model: it may pass the picture to one that can't see it
    .map((m: any) => ({ id: String(m.id), name: String(m.name ?? m.id), free: String(m.id).endsWith(":free") || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0) }))
    .sort((a: AiModel, b: AiModel) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
}

const PROMPT = "The image shows handwritten mathematics (it may include a few words). Transcribe it as LaTeX for one display equation " +
  "(use aligned or gathered for several lines, \\text{} for words). Reply with the LaTeX only: no explanation, no $$ or \\[ \\] " +
  "delimiters, no code fences. If there is no mathematics, reply with the words in \\text{}.";

/** Strips what models add around LaTeX despite being asked not to: code fences, $$ / \[ \] / $ delimiters, a leading "LaTeX:". */
export function cleanLatex(s: string): string {
  let t = s.trim().replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/, "").trim();
  t = t.replace(/^latex\s*:\s*/i, "").trim();
  for (const [a, b] of [["$$", "$$"], ["\\[", "\\]"], ["\\(", "\\)"], ["$", "$"]]) {
    const inner = t.slice(a.length, t.length - b.length);
    if (t.startsWith(a) && t.endsWith(b) && t.length > a.length + b.length) { if (!inner.includes(b)) t = inner.trim(); break; } // "$a$ and $b$" is not one pair
  }
  return t;
}

const LINES_PROMPT = (n: number) => `The image shows a page of handwritten notes (Korean and/or English, maybe math). Each line of ` +
  `handwriting has a red number at its left, 1 to ${n}. Transcribe every numbered line exactly as written (math as plain text ` +
  `or LaTeX, keep the language). Reply with JSON only, no code fences: {"1": "text of line 1", "2": "...", ...}; use "" for a line ` +
  `that is not text (a drawing, a scribble).`;

/** Reads a page of handwriting whose lines are numbered 1..n in the picture (see numberedInkImage): the text of each line. */
export async function readHandwritingLines(png: string, n: number, opts: { key?: string; model?: string } = {}): Promise<string[]> {
  const w = window as any;
  const raw: string = w.__fakeAiLines ? JSON.stringify(await w.__fakeAiLines(png, n)) : await ask(png, LINES_PROMPT(n), 4096, opts); // room for models that think before answering
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let got: Record<string, unknown>;
  try { got = JSON.parse(json.slice(json.indexOf("{"), json.lastIndexOf("}") + 1)); } catch { throw new Error("The model's answer was not the expected list of lines; try again or pick another model."); }
  return Array.from({ length: n }, (_, i) => (typeof got[String(i + 1)] === "string" ? (got[String(i + 1)] as string).trim() : ""));
}

/** Reads handwritten math from a PNG (base64, no prefix) into LaTeX. Throws with a message the user can act on. */
export async function readMath(png: string, opts: { key?: string; model?: string } = {}): Promise<string> {
  const w = window as any;
  if (w.__fakeAi) return cleanLatex(await w.__fakeAi(png)); // tests
  return cleanLatex(await ask(png, PROMPT, 2048, opts));
}

/** One picture and one instruction to the chosen model; the answer's text. Throws with a message the user can act on. */
async function ask(png: string, prompt: string, maxTokens: number, opts: { key?: string; model?: string }): Promise<string> {
  const key = opts.key ?? aiKey(), model = opts.model ?? aiModel();
  if (!key) throw new Error("Add your OpenRouter key first (More > AI settings).");
  if (!model) throw new Error("Pick a model first (More > AI settings).");
  for (let attempt = 1; ; attempt++) {
    let r: Response;
    try {
      r = await netFetch(`${API}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "REA-StarNote" },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: maxTokens,
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }] }],
        }),
      });
    } catch (e: any) { throw new Error(`Could not reach OpenRouter (${e?.message ?? "network error"}).`); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const why = j?.error?.message ?? `${r.status}`;
      if (r.status === 401) throw new Error("OpenRouter did not accept the key. Check it in More > AI settings.");
      if (r.status === 402) throw new Error(`This model needs credits on OpenRouter; pick a free one (":free") in More > AI settings. (${why})`);
      if (r.status === 429 || isLimit(why)) throw new Error(`${LIMIT} (${why})`); // never retried: a retry only uses up more of the allowance
      throw new Error(`OpenRouter ${r.status}: ${why}`);
    }
    const choice = j?.choices?.[0], content = choice?.message?.content;
    // a string, or (some providers) a list of parts
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("") : "";
    if (text.trim()) return text;
    const inner = choice?.error ?? j?.error; // a limit can also come back inside a 200 reply
    if (inner && (Number(inner.code) === 429 || isLimit(String(inner.message ?? "")))) throw new Error(`${LIMIT} (${inner.message ?? inner.code})`);
    const answered = typeof j?.model === "string" && j.model !== model ? `${model} (answered by ${j.model})` : model;
    // for diagnosis only: never the key or the note
    console.warn("OpenRouter gave no text", { model, answeredBy: j?.model, attempt, status: r.status, finish: choice?.finish_reason, nativeFinish: choice?.native_finish_reason, usage: j?.usage, provider: j?.provider });
    if (attempt < 2 && choice?.finish_reason !== "length") continue; // once more: a router may pick another model, a busy one may answer
    const hint = isRouter(model) ? " A router can pass the picture to a model that cannot see; choose a specific model that reads images (More > AI settings)." : " Try again, or pick another model that reads images (More > AI settings).";
    if (choice?.finish_reason === "length") throw new Error(`${answered} ran out of room before answering (it thinks first).${hint}`);
    throw new Error(`${answered} gave no answer (${choice?.error?.message ?? j?.error?.message ?? choice?.finish_reason ?? "no reason given"}).${hint}`);
  }
}
