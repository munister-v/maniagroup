/**
 * Sync catalog from WooCommerce REST API v3 → local SQLite.
 * Runs server-side only. Does NOT depend on Store API.
 */

import { getDb, setMeta } from "./db";

const WC_BASE = "https://maniagroup.com.ua/wp-json/wc/v3";

// ── WC REST v3 types ────────────────────────────────────────────────────

type V3Image = { id: number; src: string; name: string; alt: string };

type V3Attribute = {
  id: number;
  name: string;
  slug: string;   // e.g. "pa_size"
  visible: boolean;
  options: string[];  // e.g. ["S", "M", "L"]
};

type V3Category = { id: number; name: string; slug: string; parent: number; count: number };

type V3Product = {
  id: number;
  name: string;
  slug: string;
  status: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;   // "instock" | "outofstock"
  images: V3Image[];
  categories: V3Category[];
  attributes: V3Attribute[];
  description: string;
  short_description: string;
  date_created: string;
  date_modified: string;
};

// ── Auth ────────────────────────────────────────────────────────────────

function authHeader(): string {
  const k = process.env.WOOCOMMERCE_KEY ?? "";
  const s = process.env.WOOCOMMERCE_SECRET ?? "";
  return "Basic " + Buffer.from(`${k}:${s}`).toString("base64");
}

async function wcV3Get<T>(path: string): Promise<{ data: T; total: number }> {
  const res = await fetch(`${WC_BASE}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WC v3 ${path}: ${res.status}`);
  const total = parseInt(res.headers.get("x-wp-total") ?? "0", 10);
  return { data: (await res.json()) as T, total };
}

// ── Mapping ─────────────────────────────────────────────────────────────

const BRAND_RE = /^[A-Z0-9][A-Z0-9 .&']+$/;

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function mapProduct(p: V3Product): Record<string, unknown> {
  const brand = p.categories.find((c) => BRAND_RE.test(c.name))?.name ?? "Mania Group";
  const catEntry = p.categories.find((c) => c.name !== brand);

  const regular = parseFloat(p.regular_price) || parseFloat(p.price) || 0;
  const sale = p.sale_price ? parseFloat(p.sale_price) : null;
  const onSale = sale !== null && sale > 0 && sale < regular;

  const images = p.images.map((img) => ({
    id: img.id,
    src: img.src,
    thumbnail: img.src,
    alt: img.alt || p.name,
  }));

  const attributes = p.attributes
    .filter((a) => a.visible && a.options.length > 0)
    .map((a) => ({
      taxonomy: a.slug || slugify(a.name),
      name: a.name,
      terms: a.options.map((opt) => ({ name: opt, slug: slugify(opt) })),
    }));

  return {
    id: p.id,
    name: p.name.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    slug: p.slug || String(p.id),
    brand,
    category: catEntry?.name ?? "Одяг",
    category_slug: catEntry?.slug ?? "",
    price: onSale ? sale! : regular,
    regular_price: regular,
    sale_price: onSale ? sale : null,
    is_in_stock: p.stock_status === "instock" ? 1 : 0,
    status: p.status,
    image_src: images[0]?.src ?? "",
    images: JSON.stringify(images),
    attributes: JSON.stringify(attributes),
    description: p.description ?? "",
    short_description: p.short_description ?? "",
    created_at: p.date_created ?? "",
    updated_at: p.date_modified ?? "",
  };
}

// ── Public sync ─────────────────────────────────────────────────────────

export type SyncResult = {
  synced: number;
  pages: number;
  ms: number;
  error?: string;
};

export async function syncCatalog(): Promise<SyncResult> {
  const db = getDb();
  if (!db) throw new Error("SQLite unavailable");

  const start = Date.now();
  setMeta("sync_status", "syncing");

  try {
    // ── 1. categories ──
    const catRes = await wcV3Get<V3Category[]>("/categories?per_page=100&hide_empty=false");
    const insertCat = db.prepare(`
      INSERT OR REPLACE INTO categories(id, name, slug, parent, count) VALUES (?,?,?,?,?)
    `);
    db.prepare("DELETE FROM categories").run();
    const insertCatsTx = db.transaction((cats: V3Category[]) => {
      for (const c of cats) insertCat.run(c.id, c.name, c.slug, c.parent, c.count);
    });
    insertCatsTx(catRes.data);

    // ── 2. products (paginated) ──
    const insertProd = db.prepare(`
      INSERT OR REPLACE INTO products
        (id, name, slug, brand, category, category_slug, price, regular_price,
         sale_price, is_in_stock, status, image_src, images, attributes,
         description, short_description, created_at, updated_at)
      VALUES
        (@id,@name,@slug,@brand,@category,@category_slug,@price,@regular_price,
         @sale_price,@is_in_stock,@status,@image_src,@images,@attributes,
         @description,@short_description,@created_at,@updated_at)
    `);

    let page = 1;
    let pages = 0;
    let synced = 0;

    // Full replace in one transaction per page
    const insertPageTx = db.transaction((rows: Record<string, unknown>[]) => {
      for (const row of rows) insertProd.run(row);
    });

    // Clear existing products before re-sync
    db.prepare("DELETE FROM products").run();

    while (true) {
      const { data: products } = await wcV3Get<V3Product[]>(
        `/products?status=publish&per_page=100&page=${page}&orderby=id&order=asc`
      );
      if (!products.length) break;

      insertPageTx(products.map(mapProduct));
      synced += products.length;
      pages++;
      page++;

      if (products.length < 100) break; // last page
    }

    // ── 3. Rebuild FTS index ──
    db.exec(`
      INSERT INTO products_fts(products_fts) VALUES('rebuild');
    `);

    // ── 4. Update meta ──
    const now = new Date().toISOString();
    setMeta("last_sync", now);
    setMeta("total_products", String(synced));
    setMeta("sync_status", "idle");

    return { synced, pages, ms: Date.now() - start };
  } catch (err) {
    setMeta("sync_status", "error");
    setMeta("sync_error", String(err));
    throw err;
  }
}
