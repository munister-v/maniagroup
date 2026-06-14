// Server-side Nova Poshta API client. The API key lives in NOVAPOSHTA_API_KEY
// and must never reach the browser — only the route handlers call these.

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";

export type NpCity = { ref: string; name: string; area: string };
export type NpWarehouse = { ref: string; description: string; number: string; postcode: string };

type NpResponse<T> = { success: boolean; data: T[]; errors: string[] };

async function npCall<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, string>,
): Promise<T[]> {
  const apiKey = process.env.NOVAPOSHTA_API_KEY;
  if (!apiKey) throw new Error("NOVAPOSHTA_API_KEY is not configured");

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
