import { q, q1 } from "./pg";

/**
 * Variant/offer level of the catalog — one row per size (product_variants),
 * mirroring Intertop's «Торгові пропозиції» screen. Each variant carries its
 * own barcode / stock / price, joined with the parent product for display.
 * See memory: maniagroup-intertop-reskin.
 */
export type AdminVariant = {
  id: string;
  product_id: string;
  size: string;
  barcode: string;
  offer_code: string;          // mp-code of the offer (Intertop «Код товару»)
  stock_qty: number;
  price: number | null;        // per-variant override; NULL ⇒ inherits base_price
  sale_price: number | null;
  active: boolean;
  updated_at?: string;
  // joined product columns
  sku: string;
  name: string;
  brand: string;
  category: string;
  category_slug: string;
  gender: string;
  factory_article: string;     // Intertop «Заводський артикул»
  status: string;              // parent product status (publish/draft)
  is_in_stock: boolean;        // parent stock mirror
  base_price: number | null;   // parent regular_price (fallback for price)
  image_src: string;
};

export type VariantFilter = { q?: string; active?: string; inStock?: string; category?: string; siteStatus?: string };

export async function listAdminVariants(
  opts: VariantFilter & { page?: number; perPage?: number },
): Promise<{ variants: AdminVariant[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, Math.max(1, opts.perPage ?? 50));
  const offset = (page - 1) * perPage;

  const where: string[] = [];
  const bind: unknown[] = [];
  if (opts.q?.trim()) {
    bind.push(`%${opts.q.trim()}%`);
    const i = bind.length;
    where.push(`(v.barcode ILIKE $${i} OR p.sku ILIKE $${i} OR p.name ILIKE $${i} OR v.size ILIKE $${i})`);
  }
  if (opts.active === "1") where.push(`v.active = TRUE`);
  else if (opts.active === "0") where.push(`v.active = FALSE`);
  if (opts.inStock === "in") where.push(`v.stock_qty > 0`);
  else if (opts.inStock === "out") where.push(`v.stock_qty = 0`);
  if (opts.category?.trim()) { bind.push(opts.category.trim()); where.push(`p.category = $${bind.length}`); }
  // «На сайті» = parent published, offer active, stock mirror on; «hidden» = not.
  if (opts.siteStatus === "live") where.push(`(p.status = 'publish' AND v.active AND p.is_in_stock)`);
  else if (opts.siteStatus === "hidden") where.push(`NOT (p.status = 'publish' AND v.active AND p.is_in_stock)`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const variants = await q<AdminVariant>(
    `SELECT v.id::text AS id, v.product_id::text AS product_id, v.size, v.barcode,
            v.offer_code, v.stock_qty, v.price::float AS price, v.sale_price::float AS sale_price, v.active,
            to_char(v.updated_at, 'DD.MM.YYYY HH24:MI') AS updated_at,
            p.sku, p.name, p.brand, p.category, p.category_slug, p.gender,
            p.factory_article, p.status, p.is_in_stock,
            p.regular_price::float AS base_price, p.image_src
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       ${whereSql}
       ORDER BY v.updated_at DESC NULLS LAST, v.id DESC
       LIMIT ${perPage} OFFSET ${offset}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM product_variants v JOIN products p ON p.id = v.product_id ${whereSql}`,
    bind,
  );
  return { variants: variants as AdminVariant[], total: Number(countRow?.cnt ?? 0) };
}

export type VariantPatch = {
  stock_qty?: number;
  price?: number | null;
  sale_price?: number | null;
  active?: boolean;
};

/**
 * Bulk-edit prices/stock/active on selected variants — Intertop's «Редагувати
 * ціни та залишки». After a stock change we recompute each affected parent's
 * `is_in_stock` mirror (products.is_in_stock = SUM(active variant stock) > 0),
 * the same contract lib/products.ts relies on so the storefront stays correct.
 */
export async function bulkUpdateVariants(ids: string[], patch: VariantPatch): Promise<number> {
  const idNums = ids.map(Number).filter((n) => Number.isFinite(n));
  if (idNums.length === 0) return 0;

  const sets: string[] = [];
  const bind: unknown[] = [];
  if (patch.stock_qty !== undefined) { bind.push(patch.stock_qty); sets.push(`stock_qty = $${bind.length}`); }
  if (patch.price !== undefined) { bind.push(patch.price); sets.push(`price = $${bind.length}`); }
  if (patch.sale_price !== undefined) { bind.push(patch.sale_price); sets.push(`sale_price = $${bind.length}`); }
  if (patch.active !== undefined) { bind.push(patch.active); sets.push(`active = $${bind.length}`); }
  if (sets.length === 0) return 0;
  sets.push(`updated_at = now()`, `updated_by = 'admin'`);

  bind.push(idNums);
  await q(`UPDATE product_variants SET ${sets.join(", ")} WHERE id = ANY($${bind.length})`, bind);

  // Recompute the stock mirror on the parent products of the edited variants.
  await q(
    `UPDATE products p
        SET is_in_stock = (sub.total > 0), updated_at = now()
       FROM (SELECT product_id, COALESCE(SUM(stock_qty), 0) AS total
               FROM product_variants WHERE active GROUP BY product_id) sub
      WHERE p.id = sub.product_id
        AND p.id IN (SELECT product_id FROM product_variants WHERE id = ANY($1))`,
    [idNums],
  );
  return idNums.length;
}
