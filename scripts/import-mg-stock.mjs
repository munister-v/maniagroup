/**
 * Import the shop's MG stock export ("Остатки … MG.xls") into the size matrix.
 *
 * This is the only source that carries real per-piece quantities: the
 * "Размеры со всех складов" column lists sizes separated by "|", and a size
 * REPEATED n times means n pieces in stock. The WooCommerce export has no
 * quantities at all (see scripts/import-wc-csv.mjs), so this file is what turns
 * product_variants.stock_qty from 0 into something real.
 *
 * Matching bridge: МG "КОД" === products.sku (both are the shop's internal
 * item code). "АРТИКУЛ" is the manufacturer's article — we store it in
 * factory_article so the Intertop-style offers files, which key on it, can
 * match later.
 *
 * Products present in our catalog but absent from (or empty in) the file are
 * zeroed out — the export is a full snapshot of what is physically in stock.
 *
 *   node scripts/import-mg-stock.mjs <file.xls> [--apply]
 */
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import pg from "pg";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("usage: node scripts/import-mg-stock.mjs <file.xls> [--apply]");
  process.exit(1);
}

// codepage 1251 is mandatory — without it the Cyrillic comes out as mojibake.
const wb = XLSX.read(readFileSync(file), { type: "buffer", codepage: 1251 });
const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1, defval: "", blankrows: false,
});

// Row 0 is a title banner ("ОСТАТКИ … НА <date>"), row 1 is the real header.
const banner = String(grid[0]?.[0] ?? "").trim();
const header = (grid[1] ?? []).map((c) => String(c).trim());
const find = (re) => header.findIndex((h) => re.test(h));
const C = {
  code: find(/^КОД$/i),
  article: find(/^АРТИКУЛ$/i),
  brand: find(/^БРЕНД$/i),
  name: find(/^НАИМЕНОВАНИЕ$/i),
  sizes: find(/Размеры со всех складов/i),
  basePrice: find(/Цена базовая/i),
  salePrice: find(/Цена продажи/i),
  composition: find(/^Состав$/i),
  collection: find(/^Коллекция$/i),
  type: find(/^Тип$/i),
  color: find(/^Цвет$/i),
  country: find(/Страна/i),
};
if (C.code < 0 || C.sizes < 0) {
  console.error("Unexpected layout — no КОД / Размеры column found:", header);
  process.exit(1);
}

const at = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
const numOf = (v) => {
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const genderOf = (t) => (/женск/i.test(t) ? "women" : /мужск/i.test(t) ? "men" : "");

const items = [];
for (let i = 2; i < grid.length; i++) {
  const r = grid[i] ?? [];
  const code = at(r, C.code);
  if (!code) continue; // brand separator rows

  // "L| M| S" — and a size repeated is a second physical piece of that size.
  const qtyBySize = new Map();
  for (const part of at(r, C.sizes).split("|")) {
    const size = part.trim();
    if (!size) continue;
    qtyBySize.set(size, (qtyBySize.get(size) ?? 0) + 1);
  }

  items.push({
    sku: code,
    factory_article: at(r, C.article),
    brand: at(r, C.brand),
    gender: genderOf(at(r, C.type)),
    color: at(r, C.color),
    country: at(r, C.country),
    composition: at(r, C.composition),
    collection: at(r, C.collection),
    regular: numOf(at(r, C.basePrice)),
    sale: numOf(at(r, C.salePrice)),
    qtyBySize,
    total: [...qtyBySize.values()].reduce((a, b) => a + b, 0),
  });
}

const inStock = items.filter((i) => i.total > 0);
console.log(`file:              ${banner}`);
console.log(`rows with КОД:     ${items.length}`);
console.log(`  in stock:        ${inStock.length}`);
console.log(`  total pieces:    ${inStock.reduce((a, b) => a + b.total, 0)}`);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const { rows: existing } = await client.query("SELECT id, sku FROM products WHERE sku <> ''");
  const idBySku = new Map(existing.map((r) => [String(r.sku).trim(), Number(r.id)]));
  const matched = items.filter((i) => idBySku.has(i.sku));
  const matchedInStock = matched.filter((i) => i.total > 0);
  console.log(`catalog products:  ${existing.length}`);
  console.log(`  matched by КОД:  ${matched.length} (in stock: ${matchedInStock.length})`);
  console.log(`  unmatched rows:  ${items.length - matched.length}`);

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to import.");
    process.exit(0);
  }

  await client.query("BEGIN");

  // Full snapshot: everything drops to zero, then the file writes stock back.
  await client.query("UPDATE product_variants SET stock_qty = 0, updated_by = 'mg-stock-import'");
  await client.query("UPDATE products SET stock_qty = 0, is_in_stock = false");

  let n = 0;
  for (const it of matched) {
    const id = idBySku.get(it.sku);
    await client.query(
      `UPDATE products SET
         factory_article = COALESCE(NULLIF($2,''), factory_article),
         brand           = COALESCE(NULLIF(brand,''), $3),
         gender          = COALESCE(NULLIF(gender,''), $4),
         color           = COALESCE(NULLIF($5,''), color),
         country         = COALESCE(NULLIF($6,''), country),
         composition     = COALESCE(NULLIF($7,''), composition),
         collection      = COALESCE(NULLIF($8,''), collection),
         stock_qty       = $9,
         is_in_stock     = $9 > 0,
         updated_at      = now()
       WHERE id = $1`,
      [id, it.factory_article, it.brand, it.gender, it.color, it.country,
       it.composition, it.collection, it.total],
    );

    for (const [size, qty] of it.qtyBySize) {
      await client.query(
        `INSERT INTO product_variants (product_id, size, stock_qty, updated_by)
         VALUES ($1,$2,$3,'mg-stock-import')
         ON CONFLICT (product_id, size) DO UPDATE
           SET stock_qty = EXCLUDED.stock_qty, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [id, size, qty],
      );
    }
    if (++n % 500 === 0) console.log(`  … ${n}/${matched.length}`);
  }

  await client.query("COMMIT");
  console.log(`\nUpdated ${n} products.`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("FAILED, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
