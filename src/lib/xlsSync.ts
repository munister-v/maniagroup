/**
 * XLS sync engine — parses the MG/WP exports and computes a precise diff against
 * the live Postgres catalog, then applies *selected* change types with targeted
 * SQL (no full TRUNCATE, no slow Store API photo re-fetch). This is the fast,
 * incremental counterpart to importCatalog() in catalogImport.ts.
 *
 * Server-only.
 */

import * as XLSX from "xlsx";
import { pool, q } from "./pg";

// ── parsed shapes ─────────────────────────────────────────────────────────────

export type MgEntry = { brand: string; name: string; base: number; sale: number; gender: string; color: string; composition: string };
export type WpEntry = { name: string; regular: number; sale: number; category: string; sizes: string[]; sizeQty: Record<string, number> };

export function parseMg(buf: Buffer): Map<string, MgEntry> {
  const wb = XLSX.read(buf, { type: "buffer", codepage: 1251 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "", blankrows: false });
  const map = new Map<string, MgEntry>();
  for (const r of rows) {
    const a = r as string[];
    const code = String(a[0] ?? "").trim().split(".")[0];
    if (!/^\d+$/.test(code)) continue;
    const g = String(a[9] ?? "").trim().toLowerCase();
    map.set(code, {
      brand:       String(a[2] ?? "").trim(),
      name:        String(a[3] ?? "").trim(),
      base:        Number(a[5]) || 0,
      sale:        Number(a[6]) || 0,
      composition: String(a[7] ?? "").trim(),
      gender:      g.startsWith("жен") ? "women" : g.startsWith("муж") ? "men" : "",
      color:       String(a[10] ?? "").trim(),
    });
  }
  return map;
}

export function parseWp(buf: Buffer): Map<string, WpEntry> {
  const wb = XLSX.read(buf, { type: "buffer", codepage: 1251 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "" });
  const map = new Map<string, WpEntry>();
  for (const r of rows) {
    const id = String(r["ID"] ?? "").trim().split(".")[0];
    if (!/^\d+$/.test(id)) continue;
    let p = map.get(id);
    if (!p) {
      const regular = Number(r["Regular Price"]) || 0;
      const sale    = Number(r["Sale Price"])    || 0;
      p = {
        name:     String(r["Name"] ?? "").trim(),
        regular,
        sale:     sale > 0 && sale < regular ? sale : 0,
        category: String(r["Categories"] ?? "").split(",")[0].trim(),
        sizes:    [],
        sizeQty:  {},
      };
      map.set(id, p);
    }
    const size = String(r["Attribute 1 Value(s)"] ?? "").trim();
    const qty  = Number(r["In Stock?"]) || 0;
    if (size && qty > 0) {
      if (!p.sizes.includes(size)) p.sizes.push(size);
      p.sizeQty[size] = (p.sizeQty[size] ?? 0) + qty;   // sum duplicate rows per size
    }
  }
  return map;
}

// ── diff ──────────────────────────────────────────────────────────────────────

export type ChangeType = "new" | "price_up" | "price_down" | "now_in_stock" | "now_out" | "unchanged";

export type DiffItem = {
  sku: string; name: string; brand: string; change: ChangeType;
  db_price?: number; xls_price?: number; db_in_stock?: boolean; xls_in_stock: boolean;
};

export type DiffCounts = {
  total: number; new_products: number; price_up: number; price_down: number;
  now_in_stock: number; now_out: number; unchanged: number; db_total: number;
  wp_with_qty: number;   // WP products that carry per-size quantities
  wp_units: number;      // total units across all WP sizes
};

type DbRow = { id: number; sku: string; name: string; brand: string; price: number; is_in_stock: boolean };

function xlsPriceFor(sku: string, mg: Map<string, MgEntry>, wp: Map<string, WpEntry>): number {
  const w = wp.get(sku);
  if (w) return w.sale > 0 ? w.sale : w.regular;
  const m = mg.get(sku);
  if (m) return m.sale > 0 && m.sale < m.base ? m.sale : m.base;
  return 0;
}

export async function computeDiff(mg: Map<string, MgEntry>, wp: Map<string, WpEntry>) {
  const dbRows = await q<DbRow>(
    `SELECT id::int AS id, sku, name, brand, price::int AS price, is_in_stock FROM products WHERE status = 'publish'`,
  );
  const dbMap = new Map(dbRows.map((r) => [r.sku, r]));

  const allSkus = new Set([...wp.keys(), ...mg.keys()]);
  const diff: DiffItem[] = [];

  for (const sku of allSkus) {
    const w = wp.get(sku);
    const m = mg.get(sku);
    const db = dbMap.get(sku);

    const xlsInStock = !!w;
    const xlsPrice   = xlsPriceFor(sku, mg, wp);
    const name  = w?.name  || m?.name  || sku;
    const brand = m?.brand || "";

    if (!db) {
      diff.push({ sku, name, brand, change: "new", xls_price: xlsPrice, xls_in_stock: xlsInStock });
      continue;
    }

    if (!db.is_in_stock && xlsInStock) {
      diff.push({ sku, name, brand, change: "now_in_stock", db_price: db.price, xls_price: xlsPrice, db_in_stock: false, xls_in_stock: true });
    } else if (db.is_in_stock && !xlsInStock) {
      diff.push({ sku, name, brand, change: "now_out", db_price: db.price, xls_price: xlsPrice, db_in_stock: true, xls_in_stock: false });
    } else if (xlsPrice && db.price && Math.abs(xlsPrice - db.price) > 1) {
      diff.push({ sku, name, brand, change: xlsPrice > db.price ? "price_up" : "price_down", db_price: db.price, xls_price: xlsPrice, db_in_stock: db.is_in_stock, xls_in_stock: xlsInStock });
    } else {
      diff.push({ sku, name, brand, change: "unchanged", db_price: db.price, xls_price: xlsPrice, db_in_stock: db.is_in_stock, xls_in_stock: xlsInStock });
    }
  }

  const counts: DiffCounts = {
    total:        diff.length,
    new_products: diff.filter((d) => d.change === "new").length,
    price_up:     diff.filter((d) => d.change === "price_up").length,
    price_down:   diff.filter((d) => d.change === "price_down").length,
    now_in_stock: diff.filter((d) => d.change === "now_in_stock").length,
    now_out:      diff.filter((d) => d.change === "now_out").length,
    unchanged:    diff.filter((d) => d.change === "unchanged").length,
    db_total:     dbMap.size,
    wp_with_qty:  [...wp.values()].filter((w) => Object.keys(w.sizeQty).length > 0).length,
    wp_units:     [...wp.values()].reduce((s, w) => s + Object.values(w.sizeQty).reduce((a, b) => a + b, 0), 0),
  };

  return { diff, counts, dbCount: dbMap.size };
}

// ── selective apply ───────────────────────────────────────────────────────────

const SYNTH_OFFSET = 10_000_000;

const TRANSLIT: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"i",к:"k",л:"l",м:"m",
  н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",
  ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",і:"i",ї:"i",є:"ie",ґ:"g",
};
function slugify(s: string): string {
  return s.toLowerCase().split("").map((c) => (c in TRANSLIT ? TRANSLIT[c] : c)).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type ApplyOptions = {
  prices?: boolean;     // update price/regular/sale where they differ (in-stock products)
  stockIn?: boolean;    // mark products present in WP as in-stock
  stockOut?: boolean;   // mark products absent from WP as out-of-stock
  newItems?: boolean;   // insert products that exist in XLS but not the DB (no photos)
  quantities?: boolean; // seed per-size unit counts (product_variants.stock_qty) from WP
};

export type ApplyResult = {
  pricesUpdated: number;
  markedInStock: number;
  markedOutOfStock: number;
  newInserted: number;
  quantitiesSet: number;       // variant rows whose stock_qty was set
  productsRecounted: number;   // products whose mirror stock_qty was recomputed
};

/**
 * Apply only the selected change types. Runs in one transaction. Fast: pure SQL,
 * no Store API. New products are inserted without photos — they get pictures on
 * the next full import.
 */
export async function applySync(
  mg: Map<string, MgEntry>,
  wp: Map<string, WpEntry>,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const result: ApplyResult = { pricesUpdated: 0, markedInStock: 0, markedOutOfStock: 0, newInserted: 0, quantitiesSet: 0, productsRecounted: 0 };

  const dbRows = await q<DbRow>(
    `SELECT id::int AS id, sku, name, brand, price::int AS price, is_in_stock FROM products WHERE status = 'publish'`,
  );
  const dbMap = new Map(dbRows.map((r) => [r.sku, r]));
  const now = new Date().toISOString();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Price updates (only products already in the DB)
    if (opts.prices) {
      for (const [sku, db] of dbMap) {
        const w = wp.get(sku);
        const m = mg.get(sku);
        if (!w && !m) continue;
        const regular = w ? w.regular : (m?.base ?? 0);
        const sale    = w ? w.sale : (m && m.sale > 0 && m.sale < m.base ? m.sale : 0);
        const price   = sale > 0 ? sale : regular;
        if (price > 0 && Math.abs(price - db.price) > 1) {
          await client.query(
            `UPDATE products SET price=$1, regular_price=$2, sale_price=$3, updated_at=$4 WHERE sku=$5`,
            [price, regular, sale > 0 ? sale : null, now, sku],
          );
          result.pricesUpdated++;
        }
      }
    }

    // 2. Mark in-stock (sku present in WP but DB says out)
    if (opts.stockIn) {
      for (const sku of wp.keys()) {
        const db = dbMap.get(sku);
        if (db && !db.is_in_stock) {
          await client.query(`UPDATE products SET is_in_stock=TRUE, updated_at=$1 WHERE sku=$2`, [now, sku]);
          result.markedInStock++;
        }
      }
    }

    // 3. Mark out-of-stock (DB in-stock but missing from WP)
    if (opts.stockOut) {
      for (const [sku, db] of dbMap) {
        if (db.is_in_stock && !wp.has(sku)) {
          await client.query(`UPDATE products SET is_in_stock=FALSE, updated_at=$1 WHERE sku=$2`, [now, sku]);
          result.markedOutOfStock++;
        }
      }
    }

    // 4. Insert new products (in XLS, not in DB) — no photos
    if (opts.newItems) {
      const allSkus = new Set([...wp.keys(), ...mg.keys()]);
      for (const sku of allSkus) {
        if (dbMap.has(sku)) continue;
        const w = wp.get(sku);
        const m = mg.get(sku);
        const inStock = !!w;
        const brand = m?.brand || "Mania Group";
        const category = w?.category || m?.name || "Одяг";
        const catSlug = slugify(category) || "tovar";
        const regular = w ? w.regular : (m?.base ?? 0);
        const sale    = w ? w.sale : (m && m.sale > 0 && m.sale < m.base ? m.sale : 0);
        const price   = sale > 0 ? sale : regular;
        const pid     = SYNTH_OFFSET + Number(sku);
        const name    = w?.name || m?.name || `Товар ${sku}`;
        const attrs   = w && w.sizes.length
          ? JSON.stringify([{ taxonomy: "pa_size", name: "Розмір", terms: w.sizes.map((s) => ({ name: s, slug: slugify(s) || s.toLowerCase() })) }])
          : "[]";

        await client.query(
          `INSERT INTO products
            (id, sku, name, slug, brand, category, category_slug, gender,
             price, regular_price, sale_price, is_in_stock, status,
             image_src, images, attributes, description, short_description,
             color, country, season, collection, composition, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'publish',
             '', '[]', $13, '', '', $14, '', '', $15, $16, $17, $17)
           ON CONFLICT (id) DO NOTHING`,
          [
            pid, sku, name, String(pid), brand, category, catSlug, m?.gender || "",
            price, regular, sale > 0 ? sale : null, inStock,
            attrs, m?.color || "", /* collection */ "", m?.composition || "", now,
          ],
        );
        result.newInserted++;
      }
    }

    // 5. Seed per-size unit counts (product_variants.stock_qty) from WP, then
    //    recompute the products mirror. Logs one summary movement per product.
    if (opts.quantities) {
      // Refresh the id map to include products inserted in step 4 this transaction.
      const idRows = (await client.query<{ id: number; sku: string }>(
        "SELECT id::int AS id, sku FROM products WHERE status = 'publish'",
      )).rows;
      const idBySku = new Map(idRows.map((r) => [r.sku, r.id]));

      for (const [sku, w] of wp) {
        const pid = idBySku.get(sku);
        if (!pid) continue;
        const sizes = Object.entries(w.sizeQty);
        if (!sizes.length) continue;

        const prevRow = await client.query<{ t: number }>(
          "SELECT COALESCE(SUM(stock_qty),0)::int AS t FROM product_variants WHERE product_id = $1 AND active", [pid],
        );
        const prevTotal = prevRow.rows[0]?.t ?? 0;

        for (const [size, qty] of sizes) {
          await client.query(
            `INSERT INTO product_variants (product_id, size, stock_qty, updated_at, updated_by)
             VALUES ($1, $2, $3, now(), 'wp-sync')
             ON CONFLICT (product_id, size)
             DO UPDATE SET stock_qty = EXCLUDED.stock_qty, active = TRUE, updated_at = now(), updated_by = 'wp-sync'`,
            [pid, size, qty],
          );
          result.quantitiesSet++;
        }

        const recount = await client.query<{ total: number }>(
          `UPDATE products p SET stock_qty = s.total, is_in_stock = (s.total > 0), updated_at = now()
             FROM (SELECT COALESCE(SUM(stock_qty),0)::int AS total FROM product_variants WHERE product_id = $1 AND active) s
            WHERE p.id = $1 RETURNING p.stock_qty AS total`,
          [pid],
        );
        const newTotal = recount.rows[0]?.total ?? 0;
        result.productsRecounted++;

        if (newTotal !== prevTotal) {
          await client.query(
            `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
             VALUES ($1, NULL, '', 'import', $2, $3, 'Синхронізація кількостей з WP', 'wp-sync')`,
            [pid, newTotal - prevTotal, newTotal],
          );
        }
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return result;
}
