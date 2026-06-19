import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, pool } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { productId } = await req.json();
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const src = await client.query(
      `SELECT * FROM products WHERE id = $1`, [productId]
    );
    if (!src.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const p = src.rows[0];

    // New id = max + 1 (avoid serial collision)
    const maxId = await client.query("SELECT COALESCE(MAX(id),0)+1 AS nid FROM products");
    const newId = maxId.rows[0].nid;

    await client.query(
      `INSERT INTO products
        (id, sku, name, slug, brand, category, category_slug, gender, price, regular_price,
         sale_price, is_in_stock, stock_qty, status, image_src, images, attributes, description,
         short_description, color, country, season, collection, composition, cost_price,
         cost_source, factory_article, featured, meta_title, meta_description, created_at, updated_at)
       VALUES
        ($1, $2, $3||' (копія)', $3||'-copy-'||$1, $4, $5, $6, $7, $8, $9,
         $10, false, 0, 'draft', $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20, $21,
         $22, $23, false, '', '', now(), now())`,
      [newId, p.sku ? p.sku + '-c' : '', p.name, p.brand, p.category, p.category_slug,
       p.gender, p.price, p.regular_price, p.sale_price, p.image_src,
       JSON.stringify(p.images ?? []), JSON.stringify(p.attributes ?? []), p.description,
       p.short_description, p.color, p.country, p.season, p.collection, p.composition,
       p.cost_price, p.cost_source, p.factory_article]
    );

    // Copy variants (reset stock to 0)
    const vars = await client.query(
      "SELECT * FROM product_variants WHERE product_id = $1", [productId]
    );
    for (const v of vars.rows) {
      await client.query(
        `INSERT INTO product_variants (product_id, size, barcode, stock_qty, price, sale_price, offer_code, active, updated_by)
         VALUES ($1, $2, '', 0, $3, $4, '', $5, 'duplicate')`,
        [newId, v.size, v.price, v.sale_price, v.active]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, newId });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
