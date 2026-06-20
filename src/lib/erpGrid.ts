/**
 * ERP Grid — bulk stock editor (Excel-like).
 * Loads products+variants in one JOIN, saves changes in one transaction with
 * a before/after snapshot for rollback.
 */

import { pool, q, q1 } from "./pg";

export type GridVariant = {
  id: number;
  size: string;
  qty: number;
  active: boolean;
};

export type GridProduct = {
  id: number;
  name: string;
  brand: string;
  sku: string;
  price: number;
  cost_price: number | null;
  status: string;
  variants: GridVariant[];
};

export type GridData = {
  products: GridProduct[];
  sizes: string[];
  brands: string[];
  categories: string[];
  total: number;
};

/**
 * Junk categories left over from the WooCommerce import that the clothing
 * catalog should NOT surface (the operator's brief: only Аксесуари / Взуття /
 * Одяг and their real Cyrillic siblings — hide the English top-levels + makeup).
 */
export const HIDDEN_GRID_CATEGORIES = [
  "Beauty", "Home", "Jewelry", "Services", "Макияж", "Макіяж", "Uncategorized", "Без категорії",
];

const SIZE_ORDER = ["XXS","XS","S","M","L","XL","XXL","XXXL","3XL","4XL","5XL","One size","Один розмір","Onesize"];

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    const an = parseFloat(a), bn = parseFloat(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b, "uk");
  });
}

export async function getGridData(opts: {
  q?: string; page?: number; perPage?: number; brand?: string; status?: string;
  categories?: string[];
}): Promise<GridData> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, opts.perPage ?? 100);

  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.q?.trim()) {
    bind.push("%" + opts.q.trim() + "%");
    conds.push(`(p.name ILIKE $${bind.length} OR p.brand ILIKE $${bind.length} OR p.sku ILIKE $${bind.length})`);
  }
  if (opts.brand?.trim()) {
    bind.push(opts.brand.trim());
    conds.push(`p.brand = $${bind.length}`);
  }
  if (opts.status?.trim()) {
    bind.push(opts.status.trim());
    conds.push(`p.status = $${bind.length}`);
  }
  const cats = (opts.categories ?? []).filter(Boolean);
  if (cats.length) {
    bind.push(cats);
    conds.push(`p.category = ANY($${bind.length})`);
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  const [countRow, brands, catRows] = await Promise.all([
    q1<{ n: string }>(`SELECT COUNT(*)::text AS n FROM products p ${where}`, bind),
    q<{ brand: string }>("SELECT DISTINCT brand FROM products WHERE brand <> '' ORDER BY brand"),
    // Real categories only: those with products, minus the curated junk set.
    q<{ category: string }>(
      `SELECT category, COUNT(*)::int AS n FROM products
        WHERE category <> '' AND category <> ALL($1)
        GROUP BY category HAVING COUNT(*) > 0 ORDER BY category`,
      [HIDDEN_GRID_CATEGORIES],
    ),
  ]);

  const rows = await q<{
    id: string; name: string; brand: string; sku: string;
    price: string; cost_price: string | null; status: string;
    variant_id: string | null; size: string | null; variant_qty: string | null; active: boolean | null;
  }>(
    `SELECT p.id::text, p.name, p.brand, p.sku,
            p.price::float::text AS price, p.cost_price::float::text AS cost_price,
            p.status,
            v.id::text AS variant_id, v.size, v.stock_qty::text AS variant_qty, v.active
       FROM (
         SELECT id, name, brand, sku, price, cost_price, status
           FROM products p ${where}
           ORDER BY p.brand, p.name
           LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
       ) p
       LEFT JOIN product_variants v ON v.product_id = p.id AND v.active
       ORDER BY p.brand, p.name, v.size`,
    bind,
  );

  const productMap = new Map<string, GridProduct>();
  const allSizes = new Set<string>();

  for (const r of rows) {
    if (!productMap.has(r.id)) {
      productMap.set(r.id, {
        id: Number(r.id), name: r.name, brand: r.brand, sku: r.sku,
        price: Number(r.price), cost_price: r.cost_price ? Number(r.cost_price) : null,
        status: r.status, variants: [],
      });
    }
    if (r.variant_id && r.size) {
      allSizes.add(r.size);
      productMap.get(r.id)!.variants.push({
        id: Number(r.variant_id), size: r.size,
        qty: Number(r.variant_qty ?? 0), active: r.active ?? true,
      });
    }
  }

  return {
    products: [...productMap.values()],
    sizes: sortSizes([...allSizes]),
    brands: brands.map((b) => b.brand),
    categories: catRows.map((c) => c.category),
    total: Number(countRow?.n ?? 0),
  };
}

export type GridSaveChange = {
  variantId: number | null;
  productId: number;
  size: string;
  qty: number;
};

// Product-level field edits (price / cost) made in the spreadsheet grid.
export type GridFieldChange = {
  productId: number;
  field: "price" | "cost_price";
  value: number;
};

export async function saveGridChanges(
  changes: GridSaveChange[],
  label?: string,
  fieldChanges: GridFieldChange[] = [],
): Promise<{ snapshotId: number; applied: number; fieldsApplied: number }> {
  if (!changes.length && !fieldChanges.length) return { snapshotId: 0, applied: 0, fieldsApplied: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const snapRow = await client.query<{ id: string }>(
      "INSERT INTO grid_snapshots(label) VALUES ($1) RETURNING id::text",
      [label ?? new Date().toLocaleString("uk-UA")],
    );
    const snapshotId = Number(snapRow.rows[0].id);

    let applied = 0;

    for (const ch of changes) {
      let variantId = ch.variantId;
      let qtyBefore = 0;

      if (variantId) {
        const cur = await client.query<{ stock_qty: string }>(
          "SELECT stock_qty::text FROM product_variants WHERE id = $1",
          [variantId],
        );
        qtyBefore = Number(cur.rows[0]?.stock_qty ?? 0);
      } else {
        const ins = await client.query<{ id: string; stock_qty: string }>(
          `INSERT INTO product_variants(product_id, size, stock_qty, updated_by)
           VALUES ($1, $2, 0, 'grid')
           ON CONFLICT (product_id, size) DO UPDATE SET updated_by = 'grid'
           RETURNING id::text, stock_qty::text`,
          [ch.productId, ch.size],
        );
        variantId = Number(ins.rows[0].id);
        qtyBefore = Number(ins.rows[0].stock_qty ?? 0);
      }

      const qtyAfter = Math.max(0, Math.round(ch.qty));
      if (qtyBefore === qtyAfter) continue;

      await client.query(
        "UPDATE product_variants SET stock_qty=$2, updated_at=now(), updated_by='grid' WHERE id=$1",
        [variantId, qtyAfter],
      );

      const delta = qtyAfter - qtyBefore;
      await client.query(
        `INSERT INTO stock_movements(product_id,variant_id,size,type,delta,qty_after,note,author)
         VALUES ($1,$2,$3,'adjust',$4,$5,'Таблиця (grid)','grid')`,
        [ch.productId, variantId, ch.size, delta, qtyAfter],
      );

      await client.query(
        `INSERT INTO grid_snapshot_items(snapshot_id,variant_id,product_id,size,qty_before,qty_after)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [snapshotId, variantId, ch.productId, ch.size, qtyBefore, qtyAfter],
      );

      applied++;
    }

    // Recompute mirrors for all affected products
    const productIds = [...new Set(changes.map((c) => c.productId))];
    for (const pid of productIds) {
      await client.query(
        `UPDATE products SET stock_qty=s.total, is_in_stock=(s.total>0), updated_at=now()
           FROM (SELECT COALESCE(SUM(stock_qty),0) AS total FROM product_variants WHERE product_id=$1 AND active) s
          WHERE id=$1`,
        [pid],
      );
    }

    // Product-level price / cost edits (formulas already resolved client-side).
    let fieldsApplied = 0;
    for (const fc of fieldChanges) {
      const val = Math.max(0, Math.round(fc.value));
      if (fc.field === "price") {
        // Editing the selling price sets both price and the regular (list) price.
        await client.query(
          "UPDATE products SET price=$2, regular_price=$2, updated_at=now() WHERE id=$1",
          [fc.productId, val],
        );
      } else if (fc.field === "cost_price") {
        await client.query(
          "UPDATE products SET cost_price=$2, cost_source='manual', updated_at=now() WHERE id=$1",
          [fc.productId, val > 0 ? val : null],
        );
      } else continue;
      fieldsApplied++;
    }

    await client.query("COMMIT");
    return { snapshotId, applied, fieldsApplied };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export type GridSnapshot = {
  id: number;
  label: string;
  created_at: string;
  item_count: number;
};

export async function listGridSnapshots(): Promise<GridSnapshot[]> {
  return q<GridSnapshot>(
    `SELECT s.id, s.label, s.created_at,
            COUNT(i.id)::int AS item_count
       FROM grid_snapshots s
       LEFT JOIN grid_snapshot_items i ON i.snapshot_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 30`,
  );
}

export async function rollbackGridSnapshot(snapshotId: number): Promise<{ restored: number }> {
  const items = await q<{ variant_id: string; product_id: string; size: string; qty_before: string }>(
    "SELECT variant_id::text, product_id::text, size, qty_before::text FROM grid_snapshot_items WHERE snapshot_id=$1",
    [snapshotId],
  );
  if (!items.length) throw new Error("Знімок не знайдено або порожній");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of items) {
      const variantId = Number(item.variant_id);
      const productId = Number(item.product_id);
      const qty = Number(item.qty_before);

      const cur = await client.query<{ stock_qty: string }>(
        "SELECT stock_qty::text FROM product_variants WHERE id=$1",
        [variantId],
      );
      const qtyNow = Number(cur.rows[0]?.stock_qty ?? 0);

      await client.query(
        "UPDATE product_variants SET stock_qty=$2, updated_at=now(), updated_by='grid-rollback' WHERE id=$1",
        [variantId, qty],
      );

      if (qty !== qtyNow) {
        await client.query(
          `INSERT INTO stock_movements(product_id,variant_id,size,type,delta,qty_after,note,author)
           VALUES ($1,$2,$3,'adjust',$4,$5,'Відкат (grid rollback)','grid')`,
          [productId, variantId, item.size, qty - qtyNow, qty],
        );
      }
    }

    const productIds = [...new Set(items.map((i) => Number(i.product_id)))];
    for (const pid of productIds) {
      await client.query(
        `UPDATE products SET stock_qty=s.total, is_in_stock=(s.total>0), updated_at=now()
           FROM (SELECT COALESCE(SUM(stock_qty),0) AS total FROM product_variants WHERE product_id=$1 AND active) s
          WHERE id=$1`,
        [pid],
      );
    }

    await client.query("COMMIT");
    return { restored: items.length };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
