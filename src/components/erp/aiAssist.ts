/** Client helpers for the ERP card AI assist (OpenRouter via /api/admin/ai). */

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch("/api/admin/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : "ШІ недоступний");
  return d;
}

/** Infer structured fields (category/gender/color/season/composition/brand) + description from the name. */
export async function aiAutofill(product: Record<string, string>): Promise<Record<string, string>> {
  const d = await post({ action: "product-autofill", product });
  return (d.fields as Record<string, string>) ?? {};
}

/** Generate a selling description from the current fields. */
export async function aiDescription(product: Record<string, string>): Promise<string> {
  const d = await post({ action: "product-desc", product });
  return String(d.text ?? "").trim();
}
