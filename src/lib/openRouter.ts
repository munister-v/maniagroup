export type OMsg = { role: "system" | "user" | "assistant"; content: string };

export async function orChat(
  messages: OMsg[],
  opts?: { model?: string; maxTokens?: number; temperature?: number },
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
      model: opts?.model ?? "qwen/qwen-2.5-72b-instruct:free",
      messages,
      max_tokens: opts?.maxTokens ?? 900,
      temperature: opts?.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
  }
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}
