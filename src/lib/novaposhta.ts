// Server-side Nova Poshta API client. The key must never reach the browser —
// only route handlers call these.
//
// Key resolution mirrors the OpenRouter one: the NOVAPOSHTA_API_KEY env var
// wins, otherwise the value saved in Налаштування → Доставка. That lets an
// admin rotate the key from the browser without SSH, while a key pinned in
// .env.local still takes precedence.

import { getSetting } from "./settings";

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";

export type NpCity = { ref: string; name: string; area: string };
export type NpWarehouse = { ref: string; description: string; number: string; postcode: string };

type NpResponse<T> = { success: boolean; data: T[]; errors: string[] };

export async function resolveNpKey(): Promise<string | null> {
  return process.env.NOVAPOSHTA_API_KEY || (await getSetting("novaposhta_api_key")) || null;
}

/** Where the active key came from — the settings screen shows this. */
export async function npKeySource(): Promise<"env" | "settings" | "none"> {
  if (process.env.NOVAPOSHTA_API_KEY) return "env";
  return (await getSetting("novaposhta_api_key")) ? "settings" : "none";
}

async function npCall<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, string>,
  keyOverride?: string,
): Promise<T[]> {
  const apiKey = keyOverride || (await resolveNpKey());
  if (!apiKey) throw new Error("Ключ Нової Пошти не налаштовано — Налаштування → Доставка");

  const res = await fetch(NP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  const json = (await res.json()) as NpResponse<T>;
  if (!json.success) throw new Error(json.errors.join("; ") || "Nova Poshta API error");
  return json.data;
}

type RawCity = { Ref: string; Description: string; AreaDescription: string };
type RawWarehouse = { Ref: string; Description: string; Number: string; PostalCodeUA: string };

export async function searchCities(query: string): Promise<NpCity[]> {
  if (query.trim().length < 2) return [];
  const data = await npCall<RawCity>("Address", "getCities", {
    FindByString: query.trim(),
    Limit: "15",
  });
  return data.map((c) => ({ ref: c.Ref, name: c.Description, area: c.AreaDescription }));
}

export async function getWarehouses(cityRef: string, query = ""): Promise<NpWarehouse[]> {
  const props: Record<string, string> = { CityRef: cityRef, Limit: "50" };
  if (query.trim()) props.FindByString = query.trim();
  const data = await npCall<RawWarehouse>("Address", "getWarehouses", props);
  return data.map((w) => ({
    ref: w.Ref,
    description: w.Description,
    number: w.Number,
    postcode: w.PostalCodeUA,
  }));
}

/**
 * Probe a key against the API without saving it — powers the «Перевірити»
 * button, so a wrong key is caught before it breaks checkout. Uses the
 * cheapest read method there is (a single area lookup).
 */
export async function testNpKey(key?: string): Promise<{ ok: true; areas: number } | { ok: false; error: string }> {
  try {
    const data = await npCall<{ Ref: string }>("Address", "getAreas", {}, key);
    return { ok: true, areas: data.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Помилка з'єднання" };
  }
}
