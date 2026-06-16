import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, q1 } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const hasImg = `(images IS NOT NULL AND images::text NOT IN ('[]','null',''))`;

  const [summary, brands, categories, priceDist, lowStock, recentSync] = await Promise.all([
    // Global KPIs
    q1<{
      total: string; in_stock: string; out_stock: string; with_photo: string;
      no_photo: string; avg_price: string; stock_value: string;
    }>(`
      SELECT
        COUNT(*)::text                                                        AS total,
        COUNT(*) FILTER (WHERE is_in_stock)::text                            AS in_stock,
        COUNT(*) FILTER (WHERE NOT is_in_stock)::text                        AS out_stock,
        COUNT(*) FILTER (WHERE ${hasImg})::text                              AS with_photo,
        COUNT(*) FILTER (WHERE NOT ${hasImg})::text                          AS no_photo,
        COALESCE(ROUND(AVG(price) FILTER (WHERE price > 0 AND is_in_stock)), 0)::text  AS avg_price,
        COALESCE(SUM(price)  FILTER (WHERE price > 0 AND is_in_stock), 0)::text        AS stock_value
      FROM products WHERE status = 'publish'
    `),

    // Top 30 brands by stock value
    q<{
      brand: string; total: string; in_stock: string; out_stock: string;
      with_photo: string; avg_price: string; stock_value: string;
    }>(`
      SELECT
        brand,
        COUNT(*)::text                                                          AS total,
        COUNT(*) FILTER (WHERE is_in_stock)::text                              AS in_stock,
        COUNT(*) FILTER (WHERE NOT is_in_stock)::text                          AS out_stock,
        COUNT(*) FILTER (WHERE ${hasImg} AND is_in_stock)::text                AS with_photo,
        COALESCE(ROUND(AVG(price) FILTER (WHERE price > 0 AND is_in_stock)),0)::text AS avg_price,
        COALESCE(SUM(price)  FILTER (WHERE price > 0 AND is_in_stock), 0)::text     AS stock_value
      FROM products WHERE status = 'publish' AND brand <> ''
      GROUP BY brand
      ORDER BY SUM(price) FILTER (WHERE price > 0 AND is_in_stock) DESC NULLS LAST
      LIMIT 30
    `),

    // Top 20 categories
    q<{
      category: string; total: string; in_stock: string; with_photo: string; avg_price: string;
    }>(`
      SELECT
        category,
        COUNT(*)::text                                                            AS total,
        COUNT(*) FILTER (WHERE is_in_stock)::text                                AS in_stock,
        COUNT(*) FILTER (WHERE ${hasImg})::text                                  AS with_photo,
        COALESCE(ROUND(AVG(price) FILTER (WHERE price > 0 AND is_in_stock)),0)::text AS avg_price
      FROM products WHERE status = 'publish' AND category <> ''
      GROUP BY category
      ORDER BY COUNT(*) FILTER (WHERE is_in_stock) DESC
      LIMIT 20
    `),

    // Price distribution (in-stock only)
    q<{ bucket: string; cnt: string }>(`
      SELECT
        CASE
          WHEN price <  500  THEN 'До 500'
          WHEN price <  1000 THEN '500–1000'
          WHEN price <  2000 THEN '1000–2000'
          WHEN price <  5000 THEN '2000–5000'
          ELSE '5000+'
        END AS bucket,
        COUNT(*)::text AS cnt
      FROM products
      WHERE status = 'publish' AND is_in_stock AND price > 0
      GROUP BY bucket
      ORDER BY MIN(price)
    `),

    // Low stock: brands with ≤5 in-stock items
    q<{ brand: string; cnt: string }>(`
      SELECT brand, COUNT(*)::text AS cnt
      FROM products
      WHERE status = 'publish' AND is_in_stock AND brand <> ''
      GROUP BY brand
      HAVING COUNT(*) <= 5
      ORDER BY COUNT(*) ASC, brand
      LIMIT 20
    `),

    // Recent sync meta
    q<{ key: string; val: string }>(`
      SELECT key, val FROM sync_meta
      WHERE key IN ('last_sync','total_products','in_stock_products','source','sync_status')
    `),
  ]);

  const meta = Object.fromEntries((recentSync ?? []).map((r) => [r.key, r.val]));

  return NextResponse.json({
    summary: {
      total:       Number(summary?.total ?? 0),
      in_stock:    Number(summary?.in_stock ?? 0),
      out_stock:   Number(summary?.out_stock ?? 0),
      with_photo:  Number(summary?.with_photo ?? 0),
      no_photo:    Number(summary?.no_photo ?? 0),
      avg_price:   Number(summary?.avg_price ?? 0),
      stock_value: Number(summary?.stock_value ?? 0),
    },
    brands: (brands ?? []).map((b) => ({
      brand:       b.brand,
      total:       Number(b.total),
      in_stock:    Number(b.in_stock),
      out_stock:   Number(b.out_stock),
      with_photo:  Number(b.with_photo),
      avg_price:   Number(b.avg_price),
      stock_value: Number(b.stock_value),
    })),
    categories: (categories ?? []).map((c) => ({
      category:   c.category,
      total:      Number(c.total),
      in_stock:   Number(c.in_stock),
      with_photo: Number(c.with_photo),
      avg_price:  Number(c.avg_price),
    })),
    priceDist:  (priceDist ?? []).map((p) => ({ bucket: p.bucket, cnt: Number(p.cnt) })),
    lowStock:   (lowStock ?? []).map((b) => ({ brand: b.brand, cnt: Number(b.cnt) })),
    meta,
  });
}
