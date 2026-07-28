/**
 * Import a WooCommerce product CSV export (the Ukrainian-labelled one produced
 * by WooCommerce → Товари → Експорт) into our PostgreSQL catalog.
 *
 * Why a dedicated script instead of lib/stockImport.ts: that importer is built
 * for OFFERS files, where a row is a size-offer carrying a real quantity. This
 * export carries neither — `Запас` is empty on every row (the shop never turned
 * on per-variation stock management) and the size attribute VALUE is blank on
 * most variations. So this is a catalog importer: products, prices, photos,
 * categories, and the in-stock flag. Quantities still have to come from the
 * MG/WP stock files.
 *
 * Layout of the export: one `variable` row per product (name, description,
 * categories, images, SKU=КОД) followed by its `variation` rows, which are the
 * only rows carrying prices. Variations point at their parent by SKU in
 * `Предок`, not by the usual `id:NNN`.
 *
 *   node scripts/import-wc-csv.mjs <file.csv> [--apply]
 *
 * Without --apply it parses, reports, and touches nothing.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("usage: node scripts/import-wc-csv.mjs <file.csv> [--apply]");
  process.exit(1);
}

/** RFC4180 parser — descriptions contain both commas and embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** WooCommerce escapes commas inside a category name as `\,`. */
function splitCats(s) {
  return s
    .split(/(?<!\\),/)
    .map((p) => p.trim().replace(/\\,/g, ","))
    .filter(Boolean);
}

const decodeEntities = (s) =>
  s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&emsp;/g, " ").replace(/&quot;/g, '"');

const slugify = (s) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9а-яіїєґё]+/gi, "-")
    .replace(/^-+|-+$/g, "");

const GENERIC_CAT = /^Каталог\s/i;

const raw = readFileSync(file);
const text = raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
  ? raw.subarray(3).toString("utf8")
  : raw.toString("utf8");

const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim());
const col = (name) => header.indexOf(name);

const C = {
  id: col("ID"),
  type: col("Тип"),
  sku: col("Артикул"),
  name: col("Ім'я"),
  published: col("Опубліковано"),
  shortDesc: col("Короткий опис"),
  desc: col("Опис"),
  inStock: col("В наявності?"),
  salePrice: col("Ціна зі знижкою"),
  regularPrice: col("Звичайна ціна"),
  cats: col("Категорії"),
  images: col("Зображення"),
  parent: col("Предок"),
};
const ATTRS = [1, 2, 3].map((i) => ({
  name: col(`Назва ${i} атрибуту`),
  value: col(`${i} значення атрибуту`),
}));

const at = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
const numOf = (v) => {
  const n = Number(String(v).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Pass 1. `all` holds every product row; `bySku` resolves a variation to its
// parent. A handful of WP products share a КОД, so bySku can only point at one
// of them (the most recent, which is the one whose variations follow) — but
// both still get imported, since they are distinct WP posts with distinct ids.
const bySku = new Map();
const all = [];
const variations = [];

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length < 3) continue;
  const type = at(r, C.type);

  if (type === "variable" || type === "simple") {
    const sku = at(r, C.sku);
    const id = Number(at(r, C.id));
    if (!id || !sku) continue;

    const cats = splitCats(at(r, C.cats)).map(decodeEntities);
    // The first entry is the brand term; the rest are "Каталог … > … > leaf".
    const brand = cats.find((c) => !GENERIC_CAT.test(c) && !c.includes(">")) ?? "";
    const paths = cats.filter((c) => c.includes(">"));
    const leaves = paths.map((p) => p.split(">").pop().trim());
    // Prefer the most specific leaf ("Жіночі джинси" over "Жіночий одяг").
    const category = leaves.sort((a, b) => b.length - a.length)[0] ?? "";
    const catText = at(r, C.cats);
    const gender = /жіноч|женск/i.test(catText) ? "women" : /чолов|мужск/i.test(catText) ? "men" : "";

    let season = "";
    for (const a of ATTRS) {
      const an = at(r, a.name);
      if (/сезон/i.test(an)) season = at(r, a.value);
    }

    const images = at(r, C.images).split(",").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));

    const product = {
      id, sku,
      name: decodeEntities(at(r, C.name)),
      brand, category, gender, season,
      images,
      description: at(r, C.desc),
      short_description: at(r, C.shortDesc),
      published: at(r, C.published) === "1",
      in_stock: at(r, C.inStock) === "1",
      regular: numOf(at(r, C.regularPrice)),
      sale: numOf(at(r, C.salePrice)),
      sizes: new Set(),
    };
    all.push(product);
    bySku.set(sku, product);
  } else if (type === "variation") {
    const parentSku = at(r, C.parent) || at(r, C.sku);
    if (!parentSku) continue;
    let size = "";
    for (const a of ATTRS) {
      const an = at(r, a.name);
      if (/размер|розмір|size/i.test(an)) size = at(r, a.value);
    }
    variations.push({
      parentSku,
      size,
      regular: numOf(at(r, C.regularPrice)),
      sale: numOf(at(r, C.salePrice)),
    });
  }
}

// Pass 2: fold variation prices and sizes into their parent.
let orphanVariations = 0;
for (const v of variations) {
  const p = bySku.get(v.parentSku);
  if (!p) { orphanVariations++; continue; }
  if (v.regular > 0) p.regular = Math.max(p.regular, v.regular);
  if (v.sale > 0) p.sale = p.sale > 0 ? Math.min(p.sale, v.sale) : v.sale;
  if (v.size) p.sizes.add(v.size);
}

const list = all;
const withPrice = list.filter((p) => p.regular > 0 || p.sale > 0);
const withSizes = list.filter((p) => p.sizes.size > 0);
const withImages = list.filter((p) => p.images.length > 0);

console.log(`parsed:            ${rows.length - 1} CSV rows`);
console.log(`products:          ${list.length}`);
console.log(`  published:       ${list.filter((p) => p.published).length}`);
console.log(`  in stock:        ${list.filter((p) => p.in_stock).length}`);
console.log(`  with price:      ${withPrice.length}`);
console.log(`  with images:     ${withImages.length}`);
console.log(`  with sizes:      ${withSizes.length}`);
console.log(`variations:        ${variations.length} (orphans: ${orphanVariations})`);
console.log(`brands:            ${new Set(list.map((p) => p.brand).filter(Boolean)).size}`);
console.log(`categories:        ${new Set(list.map((p) => p.category).filter(Boolean)).size}`);

if (!apply) {
  console.log("\nDry run — nothing written. Re-run with --apply to import.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  let n = 0;
  for (const p of list) {
    const price = p.sale > 0 ? p.sale : p.regular;
    const sizes = [...p.sizes];
    const attributes = sizes.length ? [{ name: "Розмір", options: sizes }] : [];
    await client.query(
      `INSERT INTO products
         (id, sku, name, slug, brand, category, category_slug, gender,
          price, regular_price, sale_price, is_in_stock, status,
          image_src, images, attributes, description, short_description,
          season, ever_published, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20, now())
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku, name = EXCLUDED.name, brand = EXCLUDED.brand,
         category = EXCLUDED.category, category_slug = EXCLUDED.category_slug,
         gender = EXCLUDED.gender, price = EXCLUDED.price,
         regular_price = EXCLUDED.regular_price, sale_price = EXCLUDED.sale_price,
         is_in_stock = EXCLUDED.is_in_stock, status = EXCLUDED.status,
         image_src = EXCLUDED.image_src, images = EXCLUDED.images,
         attributes = EXCLUDED.attributes, description = EXCLUDED.description,
         short_description = EXCLUDED.short_description, season = EXCLUDED.season,
         updated_at = now()`,
      [
        p.id, p.sku, p.name, String(p.id), p.brand, p.category, slugify(p.category), p.gender,
        price, p.regular, p.sale > 0 ? p.sale : null, p.in_stock,
        p.published ? "publish" : "draft",
        // `images` must be [{src}], not bare URL strings — productSource.ts
        // reads `images[0].src`, and a string array silently renders no photo.
        p.images[0] ?? "", JSON.stringify(p.images.map((src) => ({ src }))), JSON.stringify(attributes),
        p.description, p.short_description, p.season, p.published,
      ],
    );

    // Seed the size matrix at qty 0 — these are real sizes the shop sells, but
    // the export carries no quantities, so stock stays 0 until a stock file lands.
    for (const size of sizes) {
      await client.query(
        `INSERT INTO product_variants (product_id, size, stock_qty, price, updated_by)
         VALUES ($1,$2,0,$3,'wc-csv-import')
         ON CONFLICT (product_id, size) DO NOTHING`,
        [p.id, size, price || null],
      );
    }
    if (++n % 500 === 0) console.log(`  … ${n}/${list.length}`);
  }

  // Refresh the category list the storefront facets read from.
  await client.query("DELETE FROM categories");
  await client.query(
    `INSERT INTO categories (id, name, slug, count)
     SELECT row_number() OVER (ORDER BY category), category, category_slug, count(*)
       FROM products WHERE category <> '' AND status = 'publish'
       GROUP BY category, category_slug`,
  );

  await client.query("COMMIT");
  console.log(`\nImported ${n} products.`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("FAILED, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
