import { getSetting } from "./settings";

export type OMsg = { role: "system" | "user" | "assistant"; content: string };

/** Env var wins if set (ops-level override); otherwise falls back to the
 *  admin-configurable Налаштування field — see lib/settings.ts. This lets an
 *  admin set the key from the browser instead of SSH + .env.local. */
async function resolveKey(): Promise<string | null> {
  return process.env.OPENROUTER_API_KEY || (await getSetting("openrouter_api_key")) || null;
}

// Ordered list of free models to try, biggest/most-capable general-chat
// models first, small/niche ones last as a final safety net. Cross-checked
// live against GET https://openrouter.ai/api/v1/models on 2026-07-11 (23
// ":free" models existed; excluded here: content-safety classifiers,
// code-only models, and vision-language variants — this assistant is plain
// text chat). Free-tier models get rate-limited independently of each
// other and somewhat randomly, so trying the next one on any failure (not
// just 429) is the actual safety net — see orChat's loop below.
const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "tencent/hy3:free",
  "poolside/laguna-m.1:free",
  "poolside/laguna-xs-2.1:free",
];

async function callModel(
  model: string,
  messages: OMsg[],
  key: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://maniagroup.munister.com.ua",
      "X-Title": "Mania Group Admin",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts?.maxTokens ?? 900,
      temperature: opts?.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status} (${model}): ${txt.slice(0, 200)}`);
  }
  const d = await res.json();
  const text = d.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response from ${model}`);
  return text;
}

export async function orChat(
  messages: OMsg[],
  opts?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  const key = await resolveKey();
  if (!key) throw new Error("OPENROUTER_API_KEY not set — додайте в Налаштування → AI-генератор або в .env.local");

  const models = opts?.model ? [opts.model, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  const failures: string[] = [];

  for (const model of models) {
    try {
      return await callModel(model, messages, key, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${model}: ${msg.slice(0, 120)}`);
      console.error(`[orChat] ${model} failed: ${msg.slice(0, 120)}`);
    }
  }
  // Every model in the fallback chain failed — this is not "one model is
  // down", so say so plainly instead of surfacing just the last error as if
  // it were the whole story (that used to hide that 16 other models were
  // also tried and failed first).
  throw new Error(`Усі ${models.length} безкоштовних моделей недоступні. Остання помилка: ${failures[failures.length - 1] ?? "?"}`);
}
