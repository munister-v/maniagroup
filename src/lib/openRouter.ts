export type OMsg = { role: "system" | "user" | "assistant"; content: string };

// Ordered list of free models to try. First one is preferred.
// Verified live on OpenRouter (older :free slugs like qwen-2.5/gemini-flash-exp
// were retired — these are the ones that currently respond). The fallback loop
// skips any model that returns 404/429 and tries the next.
const FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

async function callModel(
  model: string,
  messages: OMsg[],
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

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
  const models = opts?.model ? [opts.model, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  let lastError: Error = new Error("No models tried");

  for (const model of models) {
    try {
      return await callModel(model, messages, opts);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(`[orChat] ${model} failed: ${lastError.message.slice(0, 120)}`);
    }
  }
  throw lastError;
}
