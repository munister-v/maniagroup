/**
 * Catalog importer: builds the local SQLite catalog (`catalog.db`) from the two
 * XLS exports the store maintains, joined with photos + post-ids from the public
 * Store API. This is the real catalog data source (we have no WC REST access).
 *
 *   MG.xls  — master list of everything ever sold (6700+), with brand, gender,
 *             composition, colour, collection, in-stock sizes, prices.
 *   WP.xls  — current WooCommerce export (3000 in-stock products / 5000 variations)
 *             with categories, per-size stock and current prices.
 *
 * Join key: MG.КОД == WP.ID(col0) == Store API `sku`.  Store API post_id
 * (≠ КОД) is needed for /product/[id] + images (`{КОД}-1.jpg`).
 *
 * Used by both the CLI (scripts/import-catalog.ts) and the admin upload route.
 * Server/script-only — never imported into a client component.
 */

import * as XLSX from "xlsx";
import { getDb, setMeta } from "./db";

const STORE_API = "https://maniagroup.com.ua/wp-json/wc/store/products";

// Products without a live Store API post (archived, or in-stock with no API match)
// get a synthetic id = OFFSET + КОД. Store post-ids on this install are < 100k,
// КОД < 100k, so OFFSET keeps the two id-spaces from ever colliding.
const SYNTH_OFFSET = 10_000_000;

export type ImportProgress = (msg: string) => void;

export type ImportResult = {
  inStock: number;
  archived: number;
  total: number;
  withImages: number;
  categories: number;
  ms: number;
};

// ── cyrillic → latin slug ─────────────────────────────────────────────────
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "i", є: "ie", ґ: "g",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normGender(t: string): string {
  const s = t.trim().toLowerCase();
  if (s.startsWith("жен")) return "women";
  if (s.startsWith("муж")) return "men";
  return "";
}

// ── MG parse ───────────────────────────────────────────────────────────────
type MgRow = {
  code: string; article: string; brand: string; name: string; sizes: string;
  base: number; sale: number; composition: string; collection: string;
  gender: string; color: string; country: string;
};

function parseMg(buf: Buffer): Map<string, MgRow> {
  const wb = XLSX.read(buf, { type: "buffer", codepage: 1251 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "", blankrows: false });
  const map = new Map<string, MgRow>();
  for (const r of rows) {
    const code = String(r[0] ?? "").trim().split(".")[0];
    if (!/^\d+$/.test(code)) continue; // skip title + section-header rows
    map.set(code, {
      code,
      article: String(r[1] ?? "").trim(),
      brand: String(r[2] ?? "").trim(),
      name: String(r[3] ?? "").trim(),
      sizes: String(r[4] ?? "").trim(),
      base: Number(r[5]) || 0,
      sale: Number(r[6]) || 0,
      composition: String(r[7] ?? "").trim(),
      collection: String(r[8] ?? "").trim(),
      gender: normGender(String(r[9] ?? "")),
      color: String(r[10] ?? "").trim(),
      country: String(r[11] ?? "").trim(),
    });
  }
  return map;
}

// ── WP parse (aggregate variations per product id) ──────────────────────────
type WpRow = {
  id: string; name: string; regular: number; sale: number; category: string;
  sizes: string[]; season: string; color: string; country: string; article: string;
};

function parseWp(buf: Buffer): Map<string, WpRow> {
  const wb = XLSX.read(buf, { type: "buffer", codepage: 1251 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "" });
  const map = new Map<string, WpRow>();
  for (const r of rows) {
    const id = String(r["ID"] ?? "").trim().split(".")[0];
    if (!/^\d+$/.test(id)) continue;
    let p = map.get(id);
    if (!p) {
      p = {
        id,
        name: String(r["Name"] ?? "").trim(),
        regular: Number(r["Regular Price"]) || 0,
        sale: Number(r["Sale Price"]) || 0,
        category: String(r["Categories"] ?? "").split(",")[0].trim(),
        sizes: [],
        season: String(r["Сезон"] ?? "").trim(),
        color: String(r["Цвет"] ?? "").trim(),
        country: String(r["Страна производитель"] ?? "").trim(),
        article: String(r["Артикул"] ?? "").trim(),
      };
      map.set(id, p);
    }
    const size = String(r["Attribute 1 Value(s)"] ?? "").trim();
    const qty = Number(r["In Stock?"]) || 0;
    if (size && qty > 0 && !p.sizes.includes(size)) p.sizes.push(size);
  }
  return map;
}

// ── Store API: sku → { postId, images, name } ────────────────────────────────
type StoreEntry = { postId: number; images: { id: number; src: string; thumbnail: string; alt: string }[]; name: string };

async function fetchStoreIndex(onProgress: ImportProgress): Promise<Map<string, StoreEntry>> {
  const index = new Map<string, StoreEntry>();
  let page = 1;
  for (;;) {
    const res = await fetch(`${STORE_API}?per_page=100&page=${page}&orderby=date&order=desc`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) break;
    const list = (await res.json()) as {
      id: number; sku: string; name: string;
      images: { id: number; src: string; thumbnail?: string; alt?: string }[];
    }[];
    if (!list.length) break;
    for (const p of list) {
      const sku = String(p.sku ?? "").trim();
      if (!sku) continue;
      const imgs = Array.isArray(p.images) ? p.images : [];
      index.set(sku, {
        postId: p.id,
        name: p.name,
        images: imgs.map((i) => ({ id: i.id, src: i.src, thumbnail: i.thumbnail ?? i.src, alt: i.alt ?? p.name })),
      });
    }
    onProgress(`Store API: сторінка ${page}, зібрано ${index.size} sku`);
    if (list.length < 100) break;
    page++;
  }
  return index;
}

// ── build a DB row ───────────────────────────────────────────────────────────
function sizeAttributes(sizes: string[]): string {
  if (!sizes.length) return "[]";
  return JSON.stringify([
    {
      taxonomy: "pa_size",
      name: "Розмір",
      terms: sizes.map((s) => ({ name: s, slug: slugify(s) || s.toLowerCase() })),
    },
  ]);
}

// ── public import ─────────────────────────────────────────────────────────────
export async function importCatalog(opts: {
  mgBuffer: Buffer;
  wpBuffer: Buffer;
  onProgress?: ImportProgress;
}): Promise<ImportResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const db = getDb();
  if (!db) throw new Error("SQLite unavailable (better-sqlite3 not built?)");

  const start = Date.now();
  setMeta("sync_status", "syncing");

  try {
    onProgress("Парсинг MG.xls…");
    const mg = parseMg(opts.mgBuffer);
    onProgress(`MG: ${mg.size} товарів`);

    onProgress("Парсинг WP.xls…");
    const wp = parseWp(opts.wpBuffer);
    onProgress(`WP: ${wp.size} товарів у наявності`);

    onProgress("Завантаження фото зі Store API…");
    const store = await fetchStoreIndex(onProgress);
    onProgress(`Store API: ${store.size} товарів із фото`);

    const now = new Date().toISOString();
    type Row = Record<string, unknown>;
    const rows: Row[] = [];
    const categories = new Map<string, { name: string; slug: string; count: number }>();
    let withImages = 0;

    // 1. in-stock products (from WP, enriched by MG + Store API)
    for (const [id, w] of wp) {
      const m = mg.get(id);
      const entry = store.get(id);
      const pid = entry?.postId ?? SYNTH_OFFSET + Number(id);
      if (entry?.images.length) withImages++;

      const brand = m?.brand || "Mania Group";
      const gender = m?.gender || "";
      const category = w.category || m?.name || "Одяг";
      const catSlug = slugify(category) || "tovar";
      const regular = w.regular || m?.base || 0;
      const sale = w.sale && w.sale < regular ? w.sale : (m && m.sale && m.sale < (m.base || 0) ? m.sale : 0);
      const price = sale > 0 ? sale : regular;

      if (category) {
        const c = categories.get(catSlug) ?? { name: category, slug: catSlug, count: 0 };
        c.count++;
        categories.set(catSlug, c);
      }

      rows.push({
        id: pid, sku: id, name: entry?.name || w.name, slug: String(pid),
        brand, category, category_slug: catSlug, gender,
        price, regular_price: regular, sale_price: sale > 0 ? sale : null,
        is_in_stock: 1, status: "publish",
        image_src: entry?.images[0]?.src ?? "",
        images: JSON.stringify(entry?.images ?? []),
        attributes: sizeAttributes(w.sizes),
        description: "", short_description: "",
        color: w.color || m?.color || "", country: w.country || m?.country || "",
        season: w.season || "", collection: m?.collection || "",
        composition: m?.composition || "",
        created_at: now, updated_at: now,
      });
    }

    // 2. archived products (in MG, not currently in WP) — no Store API photo
    for (const [code, m] of mg) {
      if (wp.has(code)) continue;
      const category = m.name || "Одяг";
      const catSlug = slugify(category) || "tovar";
      const sale = m.sale && m.sale < m.base ? m.sale : 0;
      rows.push({
        id: SYNTH_OFFSET + Number(code), sku: code, name: `${m.name} ${m.brand}`.trim(), slug: code,
        brand: m.brand || "Mania Group", category, category_slug: catSlug, gender: m.gender,
        price: sale > 0 ? sale : m.base, regular_price: m.base, sale_price: sale > 0 ? sale : null,
        is_in_stock: 0, status: "publish",
        image_src: "", images: "[]", attributes: "[]",
        description: "", short_description: "",
        color: m.color, country: m.country, season: "", collection: m.collection,
        composition: m.composition,
        created_at: now, updated_at: now,
      });
    }

    onProgress(`Запис у БД: ${rows.length} товарів…`);

    const cols = [
      "id", "sku", "name", "slug", "brand", "category", "category_slug", "gender",
      "price", "regular_price", "sale_price", "is_in_stock", "status",
      "image_src", "images", "attributes", "description", "short_description",
      "color", "country", "season", "collection", "composition", "created_at", "updated_at",
    ];
    const insert = db.prepare(
      `INSERT OR REPLACE INTO products (${cols.join(",")}) VALUES (${cols.map((c) => "@" + c).join(",")})`,
    );
    const insertCat = db.prepare(
      "INSERT OR REPLACE INTO categories(id, name, slug, parent, count) VALUES (?,?,?,?,?)",
    );

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM products").run();
      db.prepare("DELETE FROM categories").run();
      for (const r of rows) insert.run(r);
      let cid = 1;
      for (const c of categories.values()) insertCat.run(cid++, c.name, c.slug, 0, c.count);
      db.exec("INSERT INTO products_fts(products_fts) VALUES('rebuild');");
    });
    tx();

    const inStock = rows.filter((r) => r.is_in_stock === 1).length;
    const archived = rows.length - inStock;

    setMeta("last_sync", now);
    setMeta("source", "xls");
    setMeta("total_products", String(rows.length));
    setMeta("in_stock_products", String(inStock));
    setMeta("sync_status", "idle");
    setMeta("sync_error", "");

    return {
      inStock, archived, total: rows.length, withImages,
      categories: categories.size, ms: Date.now() - start,
    };
  } catch (err) {
    setMeta("sync_status", "error");
    setMeta("sync_error", String(err));
    throw err;
  }
}
