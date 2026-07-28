/**
 * Sync the freshest live state from the shop's public WooCommerce Store API.
 *
 * Why this exists alongside import-wc-csv.mjs: the CSV export drops the size
 * attribute VALUE on most variation rows (~60% come out blank), so sizes taken
 * from it are incomplete. The Store API returns them reliably — verified
 * against wp-admin on product 85675: API says 38/42/44, admin shows the same
 * three variations. It also only lists products that are actually published and
 * purchasable right now, which makes it the authority on availability.
 *
 * What it does NOT provide: quantities. Stock management is switched off in
 * this WooCommerce install at both product and variation level (checked in
 * wp-admin), so "in stock" is a boolean and nothing more. Counted per-piece
 * quantities only ever come from the MG stock file — see import-mg-stock.mjs.
 *
 * And that boolean is dead data: only 130 of the 2756 published products carry
 * is_in_stock=true, yet all 2756 are is_purchasable and the live shop renders a
 * working "В корзину" button on the flagged-false ones too (verified on sku
 * 15730, /trusy-zhenskye-ea7-3a208-162439-04833/ — no out-of-stock notice
 * anywhere on the page). The shop simply sells whatever is published. So
 * availability here follows published+purchasable, NOT is_in_stock; trusting
 * that flag would hide 2626 products the real shop is happily selling.
 *
 * Quantity policy, so the provenance stays readable in the ERP:
 *   - a size the MG file counted keeps that count      (updated_by mg-stock-import)
 *   - a size WP offers but MG never counted gets qty 1 (updated_by store-api)
 *     — it is sellable, but that 1 is "available", not "we counted one".
 *
 *   node scripts/sync-store-api.mjs [--apply]
 */
import pg from "pg";

const apply = process.argv.includes("--apply");
const BASE = "https://maniagroup.com.ua/wp-json/wc/store/products";

/** Store API quotes money in minor units (945000 = 9450.00 UAH). */
const money = (v, minor) => {
  const n = Number(v);
  return Number.isFinite(n) ? n / 10 ** (minor ?? 2) : 0;
};

const products = [];
let page = 1;
let totalPages = 1;
do {
  const res = await fetch(`${BASE}?per_page=100&page=${page}`, {
    headers: { "User-Agent": "maniagroup-sync" },
  });
  if (!res.ok) {
    console.error(`page ${page}: HTTP ${res.status}`);
    process.exit(1);
  }
  if (page === 1) totalPages = Number(res.headers.get("x-wp-totalpages") ?? 1);
  const batch = await res.json();
  if (!Array.isArray(batch) || batch.length === 0) break;

  for (const p of batch) {
    const minor = p.prices?.currency_minor_unit;
    // This Store API sometimes returns `attributes`/`images` as an object
    // rather than an array — guard every list before touching it.
    const attrs = Array.isArray(p.attributes) ? p.attributes : [];
    const imgs = Array.isArray(p.images) ? p.images : [];
    const sizeAttr = attrs.find((a) =>
      /размер|розмір|size/i.test(a.name ?? "") || a.taxonomy === "pa_size",
    );
    products.push({
      id: Number(p.id),
      sku: String(p.sku ?? "").trim(),
      name: String(p.name ?? ""),
      in_stock: Boolean(p.is_purchasable),
      wp_flag: Boolean(p.is_in_stock),
      regular: money(p.prices?.regular_price, minor),
      sale: money(p.prices?.sale_price, minor),
      price: money(p.prices?.price, minor),
      sizes: (Array.isArray(sizeAttr?.terms) ? sizeAttr.terms : [])
        .map((t) => String(t.name).trim()).filter(Boolean),
      images: imgs.map((i) => i.src).filter(Boolean),
    });
  }
  process.stdout.write(`\rfetched page ${page}/${totalPages} — ${products.length} products`);
  page++;
} while (page <= totalPages);
console.log();

const onSale = products.filter((p) => p.sale > 0 && p.sale < p.regular);
console.log(`live products:     ${products.length}`);
console.log(`  purchasable:     ${products.filter((p) => p.in_stock).length}  ← availability`);
console.log(`  wp in-stock flag:${products.filter((p) => p.wp_flag).length}  (unmaintained, ignored)`);
console.log(`  with sizes:      ${products.filter((p) => p.sizes.length > 0).length}`);
console.log(`  on sale:         ${onSale.length}`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const { rows: known } = await client.query("SELECT id FROM products");
  const knownIds = new Set(known.map((r) => Number(r.id)));
  const fresh = products.filter((p) => knownIds.has(p.id));
  console.log(`  already in DB:   ${fresh.length}`);
  console.log(`  unknown to DB:   ${products.length - fresh.length}`);

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to sync.");
    process.exit(0);
  }

  await client.query("BEGIN");

  // WP is the authority on what is live: anything it no longer lists is not
  // buyable, whatever the older stock file said.
  const liveIds = products.map((p) => p.id);
  await client.query(
    `UPDATE products SET is_in_stock = false, stock_qty = 0, updated_at = now()
      WHERE status = 'publish' AND NOT (id = ANY($1::bigint[]))`,
    [liveIds],
  );

  let n = 0;
  for (const p of fresh) {
    await client.query(
      `UPDATE products SET
         name = $2, price = $3, regular_price = $4,
         sale_price = CASE WHEN $5::numeric > 0 AND $5::numeric < $4::numeric THEN $5::numeric ELSE NULL END,
         is_in_stock = $6, status = 'publish', ever_published = true, updated_at = now()
       WHERE id = $1`,
      [p.id, p.name, p.price, p.regular, p.sale, p.in_stock],
    );

    // Sizes WP no longer offers stop being sellable.
    if (p.sizes.length > 0) {
      await client.query(
        `UPDATE product_variants SET stock_qty = 0, active = false, updated_at = now()
          WHERE product_id = $1 AND NOT (size = ANY($2::text[]))`,
        [p.id, p.sizes],
      );
    }

    for (const size of p.sizes) {
      // Keep a counted quantity if the MG file gave us one; otherwise this size
      // is merely known-available, which we record as a single unit.
      await client.query(
        `INSERT INTO product_variants (product_id, size, stock_qty, active, updated_by)
         VALUES ($1, $2, $3, true, 'store-api')
         ON CONFLICT (product_id, size) DO UPDATE SET
           stock_qty = CASE
             WHEN NOT $4 THEN 0
             WHEN product_variants.stock_qty > 0 AND product_variants.updated_by = 'mg-stock-import'
               THEN product_variants.stock_qty
             ELSE $3 END,
           active = true,
           updated_by = CASE
             WHEN product_variants.stock_qty > 0 AND product_variants.updated_by = 'mg-stock-import'
               THEN product_variants.updated_by ELSE 'store-api' END,
           updated_at = now()`,
        [p.id, size, p.in_stock ? 1 : 0, p.in_stock],
      );
    }

    // products.stock_qty mirrors the size matrix.
    await client.query(
      `UPDATE products SET stock_qty = COALESCE(
         (SELECT sum(stock_qty) FROM product_variants WHERE product_id = $1 AND active), 0)
       WHERE id = $1`,
      [p.id],
    );

    if (++n % 500 === 0) console.log(`  … ${n}/${fresh.length}`);
  }

  await client.query("COMMIT");
  console.log(`\nSynced ${n} products.`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
