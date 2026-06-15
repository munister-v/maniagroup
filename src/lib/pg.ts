import { Pool } from "pg";

/**
 * Single Postgres connection pool for the whole app. The catalog, accounts,
 * cart and orders all run through this. Replaces the previous SQLite layer
 * (better-sqlite3) and the WooCommerce Store/REST hybrid — Postgres is now
 * the single source of truth.
 */

export const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.PGUSER ?? process.env.USER ?? "postgres"}@${
    process.env.PGHOST ?? "localhost"
  }:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE ?? "maniagroup"}`;

declare global {
  // eslint-disable-next-line no-var
  var __mgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __mgSchemaReady: Promise<void> | undefined;
}

export const pool: Pool =
  global.__mgPool ??
  new Pool({
    connectionString: CONNECTION_STRING,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") global.__mgPool = pool;

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS products (
  id                BIGINT PRIMARY KEY,
  sku               TEXT NOT NULL DEFAULT '',
  name              TEXT NOT NULL DEFAULT '',
  slug              TEXT NOT NULL DEFAULT '',
  brand             TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT '',
  category_slug     TEXT NOT NULL DEFAULT '',
  gender            TEXT NOT NULL DEFAULT '',
  price             NUMERIC NOT NULL DEFAULT 0,
  regular_price     NUMERIC NOT NULL DEFAULT 0,
  sale_price        NUMERIC,
  is_in_stock       BOOLEAN NOT NULL DEFAULT TRUE,
  stock_qty         INTEGER,
  status            TEXT NOT NULL DEFAULT 'publish',
  image_src         TEXT NOT NULL DEFAULT '',
  images            JSONB NOT NULL DEFAULT '[]',
  attributes        JSONB NOT NULL DEFAULT '[]',
  description       TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  color             TEXT NOT NULL DEFAULT '',
  country           TEXT NOT NULL DEFAULT '',
  season            TEXT NOT NULL DEFAULT '',
  collection        TEXT NOT NULL DEFAULT '',
  composition       TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category_slug ON products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_price         ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_status        ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_brand         ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_gender        ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_in_stock      ON products(is_in_stock);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm     ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm    ON products USING gin (brand gin_trgm_ops);

CREATE TABLE IF NOT EXISTS categories (
  id     BIGINT PRIMARY KEY,
  name   TEXT NOT NULL,
  slug   TEXT NOT NULL,
  parent BIGINT NOT NULL DEFAULT 0,
  count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_count ON categories(count DESC);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  val TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS store_settings (
  key TEXT PRIMARY KEY,
  val TEXT NOT NULL DEFAULT ''
);

-- ── Newsletter subscribers ──
CREATE TABLE IF NOT EXISTS subscribers (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at DESC);

-- ── Accounts ──
CREATE TABLE IF NOT EXISTS accounts (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

CREATE TABLE IF NOT EXISTS wishlist (
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, product_id)
);

-- ── Cart ──
CREATE TABLE IF NOT EXISTS carts (
  token      TEXT PRIMARY KEY,
  account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         BIGSERIAL PRIMARY KEY,
  cart_token TEXT NOT NULL REFERENCES carts(token) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  variation  TEXT NOT NULL DEFAULT '',
  quantity   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (cart_token, product_id, variation)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_token);

-- ── Orders ──
CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  number          TEXT NOT NULL DEFAULT '',
  account_id      BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  payment_method  TEXT NOT NULL DEFAULT 'cod',
  shipping_method TEXT NOT NULL DEFAULT 'novaposhta',
  shipping_city   TEXT NOT NULL DEFAULT '',
  shipping_branch TEXT NOT NULL DEFAULT '',
  comment         TEXT NOT NULL DEFAULT '',
  subtotal        NUMERIC NOT NULL DEFAULT 0,
  shipping_cost   NUMERIC NOT NULL DEFAULT 0,
  total           NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_email   ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   BIGINT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  brand        TEXT NOT NULL DEFAULT '',
  slug         TEXT NOT NULL DEFAULT '',
  image_src    TEXT NOT NULL DEFAULT '',
  variation    TEXT NOT NULL DEFAULT '',
  price        NUMERIC NOT NULL DEFAULT 0,
  quantity     INTEGER NOT NULL DEFAULT 1,
  line_total   NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`;

/** Idempotent schema creation. Awaited by every data-layer call via withDb(). */
export function ensureSchema(): Promise<void> {
  if (!global.__mgSchemaReady) {
    global.__mgSchemaReady = pool.query(SCHEMA).then(() => undefined);
  }
  return global.__mgSchemaReady;
}

/** Run a query after guaranteeing the schema exists. */
export async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const res = await pool.query(text, params);
  return res.rows as T[];
}

/** Single-row helper. Returns null when no row matches. */
export async function q1<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Is the catalog populated? Mirrors the old isDbReady() gate. */
export async function isDbReady(): Promise<boolean> {
  try {
    const row = await q1<{ n: string }>("SELECT count(*)::text AS n FROM products");
    return Number(row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
