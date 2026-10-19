/**
 * AI reading through OpenRouter (one key for many models; free models available): the user's own key, typed into the app and kept
 * on this device only. Used for "Convert to LaTeX" (handwritten math -> LaTeX); later the 1.0.2 assistant uses the same connection.
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

/** Models that can read images, free ones first (the list is public: no key needed). */
export async function visionModels(): Promise<AiModel[]> {
  const r = await netFetch(`${API}/models`);
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: could not list the models`);
  const j = await r.json();
  return (j.data ?? [])
    .filter((m: any) => (m.architecture?.input_modalities ?? []).includes("image"))
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

/** Reads handwritten math from a PNG (base64, no prefix) into LaTeX. Throws with a message the user can act on. */
export async function readMath(png: string, opts: { key?: string; model?: string } = {}): Promise<string> {
  const w = window as any;
  if (w.__fakeAi) return cleanLatex(await w.__fakeAi(png)); // tests
  const key = opts.key ?? aiKey(), model = opts.model ?? aiModel();
  if (!key) throw new Error("Add your OpenRouter key first (More > AI settings).");
  if (!model) throw new Error("Pick a model first (More > AI settings).");
  let r: Response;
  try {
    r = await netFetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "REA-StarNote" },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: 1200,
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }] }],
      }),
    });
  } catch (e: any) { throw new Error(`Could not reach OpenRouter (${e?.message ?? "network error"}).`); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const why = j?.error?.message ?? `${r.status}`;
    if (r.status === 401) throw new Error("OpenRouter did not accept the key. Check it in More > AI settings.");
    if (r.status === 402) throw new Error(`This model needs credits on OpenRouter; pick a free one (":free") in More > AI settings. (${why})`);
    if (r.status === 429) throw new Error(`OpenRouter's limit for free models was reached; try again later or pick another model. (${why})`);
    throw new Error(`OpenRouter ${r.status}: ${why}`);
  }
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("The model gave no answer; try again or pick another model.");
  return cleanLatex(text);
}
