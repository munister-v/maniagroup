/**
 * One-off ops script: export the ENTIRE live WooCommerce catalog from the old
 * WordPress store (maniagroup.com.ua) via its public Store API, adapt it to our
 * Postgres schema shape (products + product_variants), and SAVE IT TO A FILE.
 *
 * DEFAULT BEHAVIOR: read-only against our own systems. It only makes outbound
 * GET requests to the WP Store API and writes one JSON file under data/ — the
 * current products/product_variants tables are NOT touched. This is a staging
 * export, adapted and ready for a future import, run only when explicitly
 * asked for later (see --write-db below).
 *
 * ISOLATION, for that future import (per request «изолированно от того что
 * есть»), already baked into the adapted data:
 *   - Every product's PK is  WP_id + ID_OFFSET  (default 90_000_000), so it
 *     can never collide with or overwrite an existing live row. The original
 *     WP id is always recoverable as  id - ID_OFFSET.
 *   - status='draft' + moderation_status='pending' + ever_published=false, so
 *     nothing would show on the storefront (gated on status='publish') until
 *     a human approves it through the moderation queue.
 *   - Fully reversible once imported:  DELETE FROM products WHERE id >= 90000000;
 *
 * PHOTOS: image_src/images point at the remote WP URLs (render immediately);
 *   the existing lib/photoStore.ts batch job (admin → «Фото») localizes them
 *   into public/catalog/<id>/ later, same as any other import.
 *
 * STOCK: the public Store API exposes size labels but NOT per-size quantities,
 *   so each pa_size term becomes a product_variants row with stock_qty=0. Real
 *   quantities are a later pass (needs authenticated wc/v3 keys).
 *
 * Usage:
 *   node scripts/import-from-store-api.mjs                    # fetch + adapt + save to data/wp-import.json
 *   node scripts/import-from-store-api.mjs --dry-run           # fetch + adapt + print stats only, no file
 *   node scripts/import-from-store-api.mjs --limit 40 --verbose
 *
 *   node scripts/import-from-store-api.mjs --write-db --from data/wp-import.json
 *     ↑ NOT run yet — explicit opt-in for the future actual import, reads the
 *       saved file back and writes to Postgres (needs DATABASE_URL on the VPS).
 *
 * Flags:
 *   --dry-run     fetch + adapt + print stats/samples, write NOTHING to disk or DB
 *   --limit N     only process the first N products (testing)
 *   --verbose     print every adapted product
 *   --out PATH    output file for the adapted export (default: data/wp-import.json)
 *   --write-db    (future step, not used now) write --from file's products into Postgres
 *   --from PATH   input file for --write-db (default: data/wp-import.json)
 */
import pg from "pg";
import fs from "fs";
import path from "path";

const STORE_API = "https://maniagroup.com.ua/wp-json/wc/store/products";
const ID_OFFSET = 90_000_000;
const PER_PAGE = 100;
const DEFAULT_OUT = path.join(process.cwd(), "data", "wp-import.json");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const VERBOSE = argv.includes("--verbose");
const WRITE_DB = argv.includes("--write-db");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  return i >= 0 && argv[i + 1] ? parseInt(argv[i + 1], 10) : Infinity;
})();
const OUT_PATH = (() => {
  const i = argv.indexOf("--out");
  return i >= 0 && argv[i + 1] ? argv[i + 1] : DEFAULT_OUT;
})();
const FROM_PATH = (() => {
  const i = argv.indexOf("--from");
  return i >= 0 && argv[i + 1] ? argv[i + 1] : DEFAULT_OUT;
})();

// ── Adaptation helpers ─────────────────────────────────────────────────────

/** Strip HTML + decode the handful of entities WP uses in short_description. */
function clean(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&emsp;/g, " ").replace(/&ensp;/g, " ")
    .replace(/&ndash;/g, "-").replace(/&mdash;/g, "—").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/\s+/g, " ").trim();
}

/** Parse the "• КОД ТОВАРА: … • БРЕНД: … " structured block into a map. */
function parseSpecs(shortDescription) {
  const text = clean(shortDescription);
  const out = {};
  for (const part of text.split("•")) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^([^:]+):\s*(.*)$/);
    if (m) out[m[1].trim().toUpperCase()] = m[2].trim();
  }
  return out;
}

const GENDER_ROOTS = {
  zhenskoe: "Жіночий",
  muzhskoe: "Чоловічий",
  detskoe: "Дитячий",
};
// Broad umbrella categories that shouldn't win as the specific product "type".
const UMBRELLA = new Set([
  "zhenskaya-odezhda", "muzhskaya-odezhda", "detskaya-odezhda",
  "zhenskaya-verhniaya-odezhda", "muzhskaya-verhniaya-odezhda",
  "spidnia-bilyzna-zhenskaya-odezhda", "aksessuaryi", "obuv",
]);

/** Derive {brand, gender, category, category_slug} from categories + specs. */
function adaptTaxonomy(cats, specs, name = "") {
  const brand = specs["БРЕНД"] || (cats[0]?.name ?? "");
  const brandSlug = (brand || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let gender = "";
  for (const c of cats) {
    if (GENDER_ROOTS[c.slug]) { gender = GENDER_ROOTS[c.slug]; break; }
    if (/(^|-)zhensk/.test(c.slug)) gender ||= "Жіночий";
    else if (/(^|-)muzhsk/.test(c.slug)) gender ||= "Чоловічий";
    else if (/(^|-)detsk/.test(c.slug)) gender ||= "Дитячий";
  }
  // Fallback: a few clothing items (LANCASTER, J.B4…) lack a gender-root
  // category but state it in the name. Home fragrance (Millefiori) stays blank.
  if (!gender) {
    if (/(жіноч|женск)/i.test(name)) gender = "Жіночий";
    else if (/(чолов|мужск)/i.test(name)) gender = "Чоловічий";
    else if (/(дитяч|детск)/i.test(name)) gender = "Дитячий";
  }

  // Type = most specific category that is not the brand, not a gender root.
  // WooCommerce orders categories parent→child, so scan from the end (deepest
  // first) and prefer a non-umbrella leaf; fall back to any non-root category.
  const candidates = cats.filter(
    (c) => c.slug !== brandSlug && c.name !== brand && !GENDER_ROOTS[c.slug],
  );
  const leaf =
    [...candidates].reverse().find((c) => !UMBRELLA.has(c.slug)) ||
    [...candidates].reverse()[0] ||
    cats[0] || { name: "", slug: "" };

  return { brand, gender, category: leaf.name || "", category_slug: leaf.slug || "" };
}

/** Slug from the WP permalink's last path segment (stable, human-readable). */
function slugFromPermalink(permalink, fallbackId) {
  try {
    const path = new URL(permalink).pathname.replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean).pop();
    return seg || `p-${fallbackId}`;
  } catch {
    return `p-${fallbackId}`;
  }
}

/** WooCommerce Store API prices are integer minor units (kopecks). */
function toMajor(minor) {
  const n = Number(minor);
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Build the attributes JSON the storefront reads for size chips. Mirrors the
 *  shape emitted by the old importer: a single "Размеры" attribute. */
function sizeAttributes(sizes) {
  if (!sizes.length) return [];
  return [{ name: "Размеры", options: sizes }];
}

/** Some Store API fields arrive as {} / null / false when empty — coerce. */
const arr = (v) => (Array.isArray(v) ? v : []);

// Парфумерія / інтер'єрні аромати (Millefiori) — не імпортуємо.
const FRAGRANCE_SLUGS = new Set([
  "millefiori-milano", "aromatizatory", "aromadiffuzory",
  "smennyye_bloki", "interyernyye_dukhi", "aromaticheskiye_sashe",
]);

/** True if this product is home fragrance / perfume (to be skipped). */
function isFragrance(p) {
  const cats = arr(p.categories);
  if (cats.some((c) => FRAGRANCE_SLUGS.has(c.slug))) return true;
  const specs = parseSpecs(p.short_description);
  const brand = (specs["БРЕНД"] || cats[0]?.name || "").toLowerCase();
  return brand.includes("millefiori");
}

/** Adapt one Store API product → { product, sizes }. */
function adaptProduct(p) {
  const specs = parseSpecs(p.short_description);
  const { brand, gender, category, category_slug } = adaptTaxonomy(arr(p.categories), specs, p.name || "");

  const sizeAttr = arr(p.attributes).find((a) => a.taxonomy === "pa_size" || /размер/i.test(a.name || ""));
  const sizes = arr(sizeAttr?.terms).map((t) => String(t.name).trim()).filter(Boolean);

  const prices = p.prices || {};
  const regular = toMajor(prices.regular_price ?? prices.price);
  const sale = p.on_sale ? toMajor(prices.sale_price) : null;
  const price = sale ?? regular;

  const images = arr(p.images).map((img) => ({
    id: img.id, src: img.src, thumbnail: img.src, alt: img.alt || "",
  }));

  return {
    product: {
      id: Number(p.id) + ID_OFFSET,
      sku: specs["КОД ТОВАРА"] || p.sku || "",
      name: p.name || "",
      slug: slugFromPermalink(p.permalink, p.id),
      brand,
      category,
      category_slug,
      gender,
      price,
      regular_price: regular,
      sale_price: sale,
      is_in_stock: Boolean(p.is_in_stock),
      status: "draft",
      moderation_status: "pending",
      ever_published: false,
      image_src: images[0]?.src || "",
      images: JSON.stringify(images),
      attributes: JSON.stringify(sizeAttributes(sizes)),
      description: clean(p.description),
      short_description: clean(p.short_description),
      factory_article: specs["АРТИКУЛ"] || "",
      country: specs["СТРАНА"] || "",
      composition: specs["СОСТАВ"] || "",
      season: specs["СЕЗОН"] || "",
      color: specs["ЦВЕТ"] || "",
    },
    sizes,
  };
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchPage(page) {
  const url = `${STORE_API}?per_page=${PER_PAGE}&page=${page}&orderby=date&order=desc`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; mg-catalog-import/1.0)" },
  });
  if (!res.ok) throw new Error(`Store API page ${page} → HTTP ${res.status}`);
  const total = Number(res.headers.get("x-wp-totalpages") || 0);
  return { items: await res.json(), totalPages: total };
}

async function* fetchAll() {
  let page = 1;
  let totalPages = 1;
  let yielded = 0;
  do {
    const { items, totalPages: tp } = await fetchPage(page);
    totalPages = tp || totalPages;
    for (const it of items) {
      if (yielded >= LIMIT) return;
      yield it;
      yielded++;
    }
    console.log(`  · сторінка ${page}/${totalPages} (${items.length} товарів)`);
    page++;
  } while (page <= totalPages && yielded < LIMIT);
}

// ── DB write ────────────────────────────────────────────────────────────────

const PRODUCT_COLS = [
  "id", "sku", "name", "slug", "brand", "category", "category_slug", "gender",
  "price", "regular_price", "sale_price", "is_in_stock", "status", "moderation_status",
  "ever_published", "image_src", "images", "attributes", "description",
  "short_description", "factory_article", "country", "composition", "season", "color",
];

async function upsertProduct(client, prod) {
  const vals = PRODUCT_COLS.map((c) => prod[c]);
  const ph = PRODUCT_COLS.map((_, i) => `$${i + 1}`).join(",");
  const setCols = PRODUCT_COLS.filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  await client.query(
    `INSERT INTO products (${PRODUCT_COLS.join(",")}) VALUES (${ph})
     ON CONFLICT (id) DO UPDATE SET ${setCols}, updated_at = now()`,
    vals,
  );
}

async function upsertVariants(client, productId, sizes) {
  // Replace the size set for this product; stock_qty=0 (public API has no qty).
  await client.query("DELETE FROM product_variants WHERE product_id = $1", [productId]);
  for (const size of sizes) {
    await client.query(
      `INSERT INTO product_variants (product_id, size, stock_qty, active)
       VALUES ($1, $2, 0, TRUE)
       ON CONFLICT (product_id, size) DO NOTHING`,
      [productId, size],
    );
  }
}

// ── Step 2 (future, --write-db only): load the saved file into Postgres ────

async function writeDbFromFile() {
  if (!fs.existsSync(FROM_PATH)) {
    console.error(`✗ Файл не знайдено: ${FROM_PATH} — спочатку запустіть без --write-db, щоб зберегти експорт.`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL не заданий. На VPS: set -a; . /opt/maniagroup/.env.local; set +a");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(FROM_PATH, "utf8"));
  const items = data.products || [];
  console.log(`▶ Запис у Postgres з ${FROM_PATH}: ${items.length} товарів (isolated ids ≥ ${ID_OFFSET})\n`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let ok = 0, failed = 0;
  try {
    for (const { product, sizes } of items) {
      await client.query("BEGIN");
      try {
        await upsertProduct(client, product);
        await upsertVariants(client, product.id, sizes);
        await client.query("COMMIT");
        ok++;
      } catch (e) {
        await client.query("ROLLBACK");
        failed++;
        console.error(`  ✗ ${product.id} (${product.name}): ${e.message}`);
      }
      if ((ok + failed) % 200 === 0) console.log(`  … ${ok + failed} оброблено`);
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`\n✓ Записано: ${ok}, помилок: ${failed}`);
  console.log(`  Відкат за потреби: DELETE FROM products WHERE id >= ${ID_OFFSET};`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (WRITE_DB) return writeDbFromFile();

  console.log(DRY_RUN ? "▶ DRY RUN — нічого не зберігаємо\n" : `▶ Експорт + адаптація → ${OUT_PATH}\n`);

  const stats = {
    total: 0, skippedFragrance: 0, withImages: 0, withSizes: 0, onSale: 0,
    brands: new Set(), genders: {}, noBrand: 0, noCategory: 0,
  };
  const samples = [];
  const adapted = [];

  for await (const raw of fetchAll()) {
    if (isFragrance(raw)) { stats.skippedFragrance++; continue; }
    const { product, sizes } = adaptProduct(raw);
    stats.total++;
    if (product.image_src) stats.withImages++;
    if (sizes.length) stats.withSizes++;
    if (product.sale_price != null) stats.onSale++;
    if (product.brand) stats.brands.add(product.brand); else stats.noBrand++;
    if (!product.category) stats.noCategory++;
    stats.genders[product.gender || "—"] = (stats.genders[product.gender || "—"] || 0) + 1;
    if (samples.length < 6) samples.push({ product, sizes });
    if (VERBOSE) console.log(`  ${product.id} ${product.brand} | ${product.gender} | ${product.category} | ${product.name} | ${sizes.join("/")}`);
    if (!DRY_RUN) adapted.push({ product, sizes });
    if (stats.total % 200 === 0) console.log(`  … ${stats.total} оброблено`);
  }

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({
      exportedAt: new Date().toISOString(),
      source: STORE_API,
      idOffset: ID_OFFSET,
      count: adapted.length,
      products: adapted,
    }, null, 0));
    console.log(`\n💾 Збережено: ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(1)} МБ)`);
  }

  console.log("\n═══ ПІДСУМОК ═══");
  console.log(`  усього товарів : ${stats.total}`);
  console.log(`  пропущено парфюм: ${stats.skippedFragrance}`);
  console.log(`  з фото         : ${stats.withImages}`);
  console.log(`  з розмірами    : ${stats.withSizes}`);
  console.log(`  зі знижкою     : ${stats.onSale}`);
  console.log(`  унікальних брендів: ${stats.brands.size}`);
  console.log(`  без бренду     : ${stats.noBrand}`);
  console.log(`  без категорії  : ${stats.noCategory}`);
  console.log(`  за статтю      : ${JSON.stringify(stats.genders, null, 0)}`);

  console.log("\n═══ ЗРАЗКИ (адаптовані) ═══");
  for (const { product: p, sizes } of samples) {
    console.log(`\n  id ${p.id}  sku ${p.sku}`);
    console.log(`    name    : ${p.name}`);
    console.log(`    brand   : ${p.brand}`);
    console.log(`    gender  : ${p.gender}`);
    console.log(`    category: ${p.category}  /${p.category_slug}`);
    console.log(`    price   : ${p.price} (reg ${p.regular_price}, sale ${p.sale_price ?? "—"})`);
    console.log(`    article : ${p.factory_article}`);
    console.log(`    country : ${p.country}   season: ${p.season}   color: ${p.color}`);
    console.log(`    compos. : ${p.composition.slice(0, 70)}`);
    console.log(`    sizes   : ${sizes.join(" / ") || "—"}`);
    console.log(`    slug    : ${p.slug}`);
    console.log(`    image   : ${p.image_src.slice(0, 80)}`);
    console.log(`    status  : ${p.status} / ${p.moderation_status} (ever_published=${p.ever_published})`);
  }

  if (DRY_RUN) console.log("\n✓ DRY RUN завершено — нічого не збережено, БД не займана.");
  else console.log(`\n✓ Експорт збережено у ${OUT_PATH}. БД не займана. Коли будете готові імпортувати:\n    node scripts/import-from-store-api.mjs --write-db`);
}

main().catch((e) => {
  console.error("✗ Помилка:", e);
  process.exit(1);
});
