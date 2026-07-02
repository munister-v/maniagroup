/**
 * Small shared helpers on top of Postgres (see pg.ts) — sync metadata and a
 * cheap "does the catalog have anything published" check used by a couple of
 * routes. The old bulk replaceCatalog/insertVariants/manual-variant helpers
 * were removed with the TRUNCATE-based catalog importer (lib/catalogImport.ts,
 * deleted) — the ERP import (lib/stockImport.ts) writes products/variants
 * directly and never needed them.
 */
import { q, q1, ensureSchema } from "./pg";

export { ensureSchema };

export async function getMeta(key: string): Promise<string> {
  const row = await q1<{ val: string }>("SELECT val FROM sync_meta WHERE key = $1", [key]);
  return row?.val ?? "";
}

export async function setMeta(key: string, val: string): Promise<void> {
  await q(
    `INSERT INTO sync_meta(key, val) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val`,
    [key, String(val)],
  );
}

export async function isDbReady(): Promise<boolean> {
  try {
    const row = await q1<{ n: string }>(
      "SELECT count(*)::text AS n FROM products WHERE status = 'publish'",
    );
    return Number(row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
