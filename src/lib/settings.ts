import { q, q1 } from "./pg";

/** Key/value store for admin-editable store settings (kept out of sync_meta). */

export async function getSetting(key: string): Promise<string | null> {
  const row = await q1<{ val: string }>("SELECT val FROM store_settings WHERE key = $1", [key]);
  return row?.val ?? null;
}

export async function setSetting(key: string, val: string): Promise<void> {
  await q(
    `INSERT INTO store_settings(key, val) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val`,
    [key, val],
  );
}

export type StoreSettings = {
  free_ship_threshold: string;
  store_phone: string;
  store_email: string;
};

const DEFAULTS: StoreSettings = {
  free_ship_threshold: "3000",
  store_phone: "+38 (096) 343-60-35",
  store_email: "",
};

export async function getStoreSettings(): Promise<StoreSettings> {
  const rows = await q<{ key: string; val: string }>("SELECT key, val FROM store_settings");
  const map = new Map(rows.map((r) => [r.key, r.val]));
  return {
    free_ship_threshold: map.get("free_ship_threshold") ?? DEFAULTS.free_ship_threshold,
    store_phone: map.get("store_phone") ?? DEFAULTS.store_phone,
    store_email: map.get("store_email") ?? DEFAULTS.store_email,
  };
}

export async function saveStoreSettings(s: Partial<StoreSettings>): Promise<void> {
  for (const [key, val] of Object.entries(s)) {
    if (val !== undefined) await setSetting(key, String(val));
  }
}
