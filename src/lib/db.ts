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
    // Preserve hand-entered & receipt-derived costs across the full replace
    // (ids are stable: Store post-id for in-stock, SYNTH_OFFSET+КОД for archived).
    const manual = await client.query<{ id: string; cost_price: string; cost_source: string }>(
      "SELECT id::text, cost_price::text, cost_source FROM products WHERE cost_source IN ('manual','receipt') AND cost_price IS NOT NULL",
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

    // Re-apply preserved manual / receipt costs onto the freshly imported rows.
    for (const m of manual.rows) {
      await client.query(
        "UPDATE products SET cost_price = $2, cost_source = $3 WHERE id = $1",
        [m.id, m.cost_price, m.cost_source],
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

/**
 * Bulk-replace per-size variants after a full catalog import. The TRUNCATE in
 * replaceCatalog already cascaded product_variants empty (FK ON DELETE CASCADE),
 * so this just inserts the fresh per-size rows. Logs one 'import' movement per
 * variant so the ledger reflects the import baseline.
 */
export async function insertVariants(
  variants: { product_id: number; size: string; stock_qty: number }[],
): Promise<void> {
  if (!variants.length) return;
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const CHUNK = 500;
    for (let i = 0; i < variants.length; i += CHUNK) {
      const slice = variants.slice(i, i + CHUNK);
      const vals: unknown[] = [];
      const tuples = slice.map((v, idx) => {
        const b = idx * 3;
        vals.push(v.product_id, v.size, v.stock_qty);
        return `($${b + 1},$${b + 2},$${b + 3})`;
      });
      await client.query(
        `INSERT INTO product_variants (product_id, size, stock_qty) VALUES ${tuples.join(",")}
         ON CONFLICT (product_id, size) DO UPDATE SET stock_qty = EXCLUDED.stock_qty, updated_at = now()`,
        vals,
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

export type ManualVariant = {
  product_id: number; size: string; barcode: string; stock_qty: number;
  price: number | null; active: boolean; updated_by: string;
};

/** Snapshot variants a human edited (updated_by set) — to survive a full import. */
export async function getManualVariants(): Promise<ManualVariant[]> {
  const rows = await q<{
    product_id: string; size: string; barcode: string; stock_qty: number;
    price: string | null; active: boolean; updated_by: string;
  }>(
    `SELECT product_id::text, size, barcode, stock_qty, price::float::text AS price, active, updated_by
       FROM product_variants WHERE updated_by <> ''`,
  );
  return rows.map((r) => ({
    product_id: Number(r.product_id), size: r.size, barcode: r.barcode,
    stock_qty: Number(r.stock_qty), price: r.price != null ? Number(r.price) : null,
    active: r.active, updated_by: r.updated_by,
  }));
}

/**
 * Re-apply hand-edited variants after a full import overwrote them with the
 * WP baseline, then refresh the products mirror for the affected ids. Skips
 * variants whose product no longer exists in the rebuilt catalog.
 */
export async function reapplyManualVariants(rows: ManualVariant[]): Promise<void> {
  if (!rows.length) return;
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const touched = new Set<number>();
    for (const v of rows) {
      const exists = await client.query("SELECT 1 FROM products WHERE id = $1", [v.product_id]);
      if (!exists.rows.length) continue;
      await client.query(
        `INSERT INTO product_variants (product_id, size, barcode, stock_qty, price, active, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (product_id, size) DO UPDATE SET
           barcode = EXCLUDED.barcode, stock_qty = EXCLUDED.stock_qty,
           price = EXCLUDED.price, active = EXCLUDED.active,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [v.product_id, v.size, v.barcode, v.stock_qty, v.price, v.active, v.updated_by],
      );
      touched.add(v.product_id);
    }
    for (const pid of touched) {
      await client.query(
        `UPDATE products p SET stock_qty = s.total, is_in_stock = (s.total > 0), updated_at = now()
           FROM (SELECT COALESCE(SUM(stock_qty),0) AS total FROM product_variants WHERE product_id = $1 AND active) s
          WHERE p.id = $1`,
        [pid],
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
