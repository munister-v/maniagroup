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

-- ── CRM: order fulfilment + timeline ──
-- orders already exists in prod, so add columns idempotently.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ttn          TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'site';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_applied BOOLEAN NOT NULL DEFAULT FALSE;

-- Unified order timeline: status changes, notes, ttn, stock events.
CREATE TABLE IF NOT EXISTS order_events (
  id         BIGSERIAL PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'note',
  message    TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at DESC);

-- ── CRM: customer notes + tags ──
CREATE TABLE IF NOT EXISTS customer_notes (
  id         BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body       TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_acct ON customer_notes(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_tags (
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  PRIMARY KEY (account_id, tag)
);

-- ── Catalog: homepage curation ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured) WHERE featured;

-- ── Finance: cost basis for profit/margin ──
-- The XLS exports carry no purchase cost, so cost is resolved by priority:
--   1. products.cost_price (manual edit or imported absolute cost)
--   2. per-brand rule (cost_rules.pct)
--   3. global markup / base-pct (store_settings: finance_markup_pct, finance_cost_basis)
ALTER TABLE products    ADD COLUMN IF NOT EXISTS cost_price  NUMERIC;          -- NULL ⇒ derive
ALTER TABLE products    ADD COLUMN IF NOT EXISTS cost_source TEXT NOT NULL DEFAULT ''; -- 'manual'|'import'|''
-- Snapshot the cost into each order line at order time so historical profit
-- stays correct even when cost settings change later.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price  NUMERIC NOT NULL DEFAULT 0;

-- Per-brand cost override. pct is interpreted per the global finance_cost_basis:
--   basis markup: cost = price * 100/(100+pct)
--   basis base:   cost = regular_price * pct/100
CREATE TABLE IF NOT EXISTS cost_rules (
  brand      TEXT PRIMARY KEY,
  pct        NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operating-expense ledger (for net profit, beyond COGS).
CREATE TABLE IF NOT EXISTS expenses (
  id         BIGSERIAL PRIMARY KEY,
  spent_on   DATE NOT NULL DEFAULT current_date,
  category   TEXT NOT NULL DEFAULT 'other',  -- ads|rent|salary|shipping|goods|tax|fee|other
  amount     NUMERIC NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(spent_on DESC);

-- ── ERP: warehouse core (size-matrix variants + stock movement ledger) ──
-- The admin/ERP becomes the system of record for assortment & stock. A product
-- breaks into per-size variants (= the bookkeeper's "size present ⇒ available"
-- model). products.stock_qty is kept as a mirror (sum of variant stock) so the
-- storefront/cart/orders keep working during the transition.
CREATE TABLE IF NOT EXISTS product_variants (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT NOT NULL DEFAULT '',
  barcode    TEXT NOT NULL DEFAULT '',
  stock_qty  INTEGER NOT NULL DEFAULT 0,
  price      NUMERIC,                       -- NULL ⇒ inherit product price
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT '',
  UNIQUE (product_id, size)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- Every stock change, for a full audit trail ("Оновлено / Ким оновлено").
CREATE TABLE IF NOT EXISTS stock_movements (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL,
  variant_id BIGINT,
  size       TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL DEFAULT 'adjust', -- import|receipt|sale|return|adjust|writeoff
  delta      INTEGER NOT NULL DEFAULT 0,      -- signed change in units
  qty_after  INTEGER,                         -- resulting stock for that variant
  note       TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at DESC);

-- ── ERP: receiving documents (приход) — feed real purchase cost ──
-- Posting a receipt adds stock (receipt movements) and updates the product's
-- weighted-average cost_price (cost_source='receipt'), which the finance engine
-- already prefers over the derived markup — closing the "no cost" gap.
CREATE TABLE IF NOT EXISTS receipts (
  id         BIGSERIAL PRIMARY KEY,
  supplier   TEXT NOT NULL DEFAULT '',
  doc_date   DATE NOT NULL DEFAULT current_date,
  note       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'draft',  -- draft | posted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(doc_date DESC);

CREATE TABLE IF NOT EXISTS receipt_items (
  id         BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  variant_id BIGINT,
  size       TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL DEFAULT '',
  qty        INTEGER NOT NULL DEFAULT 0,
  unit_cost  NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON receipt_items(receipt_id);

-- ── ERP: suppliers directory (постачальники) ──
-- Reusable supplier records; receipts reference one (snapshotting the name in
-- receipts.supplier for historical accuracy even if a supplier is renamed).
CREATE TABLE IF NOT EXISTS suppliers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS supplier_id BIGINT;

-- ── Marketing: discount coupons ──
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS coupons (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL DEFAULT 'percent',  -- 'percent' | 'fixed'
  value        NUMERIC NOT NULL DEFAULT 0,
  min_subtotal NUMERIC NOT NULL DEFAULT 0,
  expires_at   DATE,
  usage_limit  INTEGER,
  used_count   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(lower(code));

-- ── CMS: site content (published 'current' + working 'draft') ──
-- Single source of truth for all editable site copy. Lives in Postgres so it
-- survives rsync deploys (the old data/site-content.json was wiped by --delete).
CREATE TABLE IF NOT EXISTS content_store (
  key        TEXT PRIMARY KEY,           -- 'current' | 'draft'
  val        JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CMS: version history (snapshots for restore / "копії") ──
CREATE TABLE IF NOT EXISTS content_versions (
  id         BIGSERIAL PRIMARY KEY,
  label      TEXT NOT NULL DEFAULT '',
  content    JSONB NOT NULL,
  author     TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_versions_created ON content_versions(created_at DESC);

-- ── Brand logos (manual upload + auto from logo CDN) ──
CREATE TABLE IF NOT EXISTS brand_logos (
  brand      TEXT PRIMARY KEY,             -- exact products.brand value
  logo_url   TEXT NOT NULL,                -- /uploads/brands/x.png or external CDN URL
  source     TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'auto'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
