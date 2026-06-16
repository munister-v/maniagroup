/**
 * Catalog data layer — now Postgres-backed (see pg.ts). Keeps the same
 * function names the importers and routes already use (getMeta/setMeta/
 * isDbReady) plus a bulk replaceCatalog() helper for the importers.
 */
import { pool, q, q1, ensureSchema } from "./pg";

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

export type ProductRow = {
  id: number;
  sku: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  category_slug: string;
  gender: string;
  price: number;
  regular_price: number;
  sale_price: number | null;
  is_in_stock: boolean;
  status: string;
  image_src: string;
  images: string; // JSON string
  attributes: string; // JSON string
  description: string;
  short_description: string;
  color: string;
  country: string;
  season: string;
  collection: string;
  composition: string;
  stock_qty?: number | null;
  cost_price?: number | null;
  cost_source?: string;
};

const PRODUCT_COLS = [
  "id", "sku", "name", "slug", "brand", "category", "category_slug", "gender",
  "price", "regular_price", "sale_price", "is_in_stock", "status",
  "image_src", "images", "attributes", "description", "short_description",
  "color", "country", "season", "collection", "composition",
  "stock_qty", "cost_price", "cost_source",
] as const;

/**
 * Full catalog replace used by the XLS/WC importers. Wraps everything in a
 * transaction: truncate, bulk-insert products in chunks, rebuild categories.
 */
export async function replaceCatalog(
  rows: ProductRow[],
  categories: { name: string; slug: string; count: number }[],
): Promise<void> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Preserve hand-entered costs across the full replace (ids are stable:
    // Store post-id for in-stock, SYNTH_OFFSET+КОД for archived).
    const manual = await client.query<{ id: string; cost_price: string }>(
      "SELECT id::text, cost_price::text FROM products WHERE cost_source = 'manual' AND cost_price IS NOT NULL",
    );
    await client.query("TRUNCATE products, categories");

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = slice.map((r, idx) => {
        const base = idx * PRODUCT_COLS.length;
        PRODUCT_COLS.forEach((c) => values.push((r as Record<string, unknown>)[c]));
        return `(${PRODUCT_COLS.map((_, j) => `$${base + j + 1}`).join(",")})`;
      });
      await client.query(
        `INSERT INTO products (${PRODUCT_COLS.join(",")}) VALUES ${tuples.join(",")}`,
        values,
      );
    }

    let cid = 1;
    for (const c of categories) {
      await client.query(
        "INSERT INTO categories(id, name, slug, parent, count) VALUES ($1,$2,$3,0,$4)",
        [cid++, c.name, c.slug, c.count],
      );
    }

    // Re-apply preserved manual costs onto the freshly imported rows.
    for (const m of manual.rows) {
      await client.query(
        "UPDATE products SET cost_price = $2, cost_source = 'manual' WHERE id = $1",
        [m.id, m.cost_price],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
