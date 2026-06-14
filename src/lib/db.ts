import path from "path";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "catalog.db");

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY,
  sku             TEXT    NOT NULL DEFAULT '',
  name            TEXT    NOT NULL DEFAULT '',
  slug            TEXT    NOT NULL DEFAULT '',
  brand           TEXT    NOT NULL DEFAULT '',
  category        TEXT    NOT NULL DEFAULT '',
  category_slug   TEXT    NOT NULL DEFAULT '',
  gender          TEXT    NOT NULL DEFAULT '',
  price           REAL    NOT NULL DEFAULT 0,
  regular_price   REAL    NOT NULL DEFAULT 0,
  sale_price      REAL,
  is_in_stock     INTEGER NOT NULL DEFAULT 1,
  status          TEXT    NOT NULL DEFAULT 'publish',
  image_src       TEXT    NOT NULL DEFAULT '',
  images          TEXT    NOT NULL DEFAULT '[]',
  attributes      TEXT    NOT NULL DEFAULT '[]',
  description     TEXT    NOT NULL DEFAULT '',
  short_description TEXT  NOT NULL DEFAULT '',
  color           TEXT    NOT NULL DEFAULT '',
  country         TEXT    NOT NULL DEFAULT '',
  season          TEXT    NOT NULL DEFAULT '',
  collection      TEXT    NOT NULL DEFAULT '',
  composition     TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT '',
  updated_at      TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_products_category_slug ON products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_price         ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_status        ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_brand         ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_gender        ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_in_stock      ON products(is_in_stock);

CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, brand, category,
  content=products,
  content_rowid=id,
  tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS categories (
  id     INTEGER PRIMARY KEY,
  name   TEXT    NOT NULL,
  slug   TEXT    NOT NULL,
  parent INTEGER NOT NULL DEFAULT 0,
  count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_categories_count ON categories(count DESC);

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  val   TEXT NOT NULL DEFAULT ''
);
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterDb = any;

let _db: BetterDb | null = null;

export function getDb(): BetterDb | null {
  if (_db) return _db;
  try {
    // Dynamic import so the server doesn't crash if native addon isn't built yet
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3");
    const db = new BetterSqlite3(DB_PATH) as BetterDb;
    db.exec(SCHEMA);
    _db = db;
    return db;
  } catch (e) {
    console.warn("[db] SQLite unavailable:", (e as Error).message);
    return null;
  }
}

export function getMeta(key: string): string {
  const db = getDb();
  if (!db) return "";
  const row = db.prepare("SELECT val FROM sync_meta WHERE key = ?").get(key) as { val: string } | undefined;
  return row?.val ?? "";
}

export function setMeta(key: string, val: string): void {
  const db = getDb();
  if (!db) return;
  db.prepare("INSERT OR REPLACE INTO sync_meta(key, val) VALUES (?, ?)").run(key, val);
}

export function isDbReady(): boolean {
  const db = getDb();
  if (!db) return false;
  const count = (db.prepare("SELECT COUNT(*) as n FROM products WHERE status = 'publish'").get() as { n: number }).n;
  return count > 0;
}
