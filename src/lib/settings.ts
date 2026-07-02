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
  telegram_enabled: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  low_stock_threshold: string;
  smtp_enabled: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  /** "1" (default) = storefront hides products with no photo. "0" = show
   *  photoless products too (with a placeholder) — see productSource.ts. */
  require_product_photo: string;
};

const DEFAULTS: StoreSettings = {
  free_ship_threshold: "3000",
  store_phone: "+38 (096) 343-60-35",
  store_email: "",
  telegram_enabled: "",
  telegram_bot_token: "",
  telegram_chat_id: "",
  low_stock_threshold: "3",
  smtp_enabled: "",
  smtp_host: "smtp.gmail.com",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "",
  require_product_photo: "1",
};

export async function getStoreSettings(): Promise<StoreSettings> {
  const rows = await q<{ key: string; val: string }>("SELECT key, val FROM store_settings");
  const map = new Map(rows.map((r) => [r.key, r.val]));
  const get = (k: keyof StoreSettings) => map.get(k) ?? DEFAULTS[k];
  return {
    free_ship_threshold: get("free_ship_threshold"),
    store_phone: get("store_phone"),
    store_email: get("store_email"),
    telegram_enabled: get("telegram_enabled"),
    telegram_bot_token: get("telegram_bot_token"),
    telegram_chat_id: get("telegram_chat_id"),
    low_stock_threshold: get("low_stock_threshold"),
    smtp_enabled: get("smtp_enabled"),
    smtp_host: get("smtp_host"),
    smtp_port: get("smtp_port"),
    smtp_user: get("smtp_user"),
    smtp_pass: get("smtp_pass"),
    smtp_from: get("smtp_from"),
    require_product_photo: get("require_product_photo"),
  };
}

export async function saveStoreSettings(s: Partial<StoreSettings>): Promise<void> {
  for (const [key, val] of Object.entries(s)) {
    if (val !== undefined) await setSetting(key, String(val));
  }
}
