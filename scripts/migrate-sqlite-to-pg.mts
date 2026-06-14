/**
 * One-shot migration: SQLite catalog.db → Postgres. Run once per environment
 * to carry the existing imported catalog into the new store engine.
 *
 *   DATABASE_URL=postgresql://... DB_PATH=./data/catalog.db \
 *     npx tsx scripts/migrate-sqlite-to-pg.mts
 */
import path from "path";
import { replaceCatalog, setMeta, type ProductRow } from "../src/lib/db";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "catalog.db");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = (await import("better-sqlite3")).default;
const db = new Database(DB_PATH, { readonly: true });

const products = db.prepare("SELECT * FROM products").all() as Record<string, unknown>[];
const categories = db.prepare("SELECT name, slug, count FROM categories ORDER BY count DESC").all() as {
  name: string; slug: string; count: number;
}[];

console.log(`SQLite: ${products.length} products, ${categories.length} categories`);

const rows: ProductRow[] = products.map((p) => ({
  id: Number(p.id),
  sku: String(p.sku ?? ""),
  name: String(p.name ?? ""),
  slug: String(p.slug ?? ""),
  brand: String(p.brand ?? ""),
  category: String(p.category ?? ""),
  category_slug: String(p.category_slug ?? ""),
  gender: String(p.gender ?? ""),
  price: Number(p.price ?? 0),
  regular_price: Number(p.regular_price ?? 0),
  sale_price: p.sale_price === null || p.sale_price === undefined ? null : Number(p.sale_price),
  is_in_stock: p.is_in_stock === 1 || p.is_in_stock === true,
  status: String(p.status ?? "publish"),
  image_src: String(p.image_src ?? ""),
  images: String(p.images ?? "[]"),
  attributes: String(p.attributes ?? "[]"),
  description: String(p.description ?? ""),
  short_description: String(p.short_description ?? ""),
  color: String(p.color ?? ""),
  country: String(p.country ?? ""),
  season: String(p.season ?? ""),
  collection: String(p.collection ?? ""),
  composition: String(p.composition ?? ""),
}));

await replaceCatalog(rows, categories);

const inStock = rows.filter((r) => r.is_in_stock).length;
await setMeta("last_sync", new Date().toISOString());
await setMeta("source", "sqlite-migration");
await setMeta("total_products", String(rows.length));
await setMeta("in_stock_products", String(inStock));
await setMeta("sync_status", "idle");

console.log(`Postgres: imported ${rows.length} products (${inStock} in stock).`);
process.exit(0);
