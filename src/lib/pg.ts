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

-- Admin login brute-force protection. Postgres-backed (not in-memory) because
-- PM2 runs 2 cluster workers behind a shared port — an in-memory counter
-- would only see half the attempts on each worker, roughly halving the
-- effective lockout threshold.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip            TEXT PRIMARY KEY,
  count         INT NOT NULL DEFAULT 1,
  first_attempt TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ
);

-- Unified admin activity log — one row per meaningful operation (import,
-- export, bulk save, delete, backup, login…). Powers the Monitoring section
-- so import/export/saving are all observable in one feed instead of scattered.
CREATE TABLE IF NOT EXISTS admin_activity (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT NOT NULL,                 -- import | export | save | delete | backup | login | login_fail | photos | settings
  summary    TEXT NOT NULL DEFAULT '',      -- human-readable one-liner
  count      INT,                           -- affected rows, when relevant
  author     TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity(created_at DESC);

-- Per-product activity feed ("Історія статусів" tab, Intertop-style). Nullable —
-- only entries logged after this column existed can be attributed to a product;
-- older rows just don't show up in that product's history, which is honest.
ALTER TABLE admin_activity ADD COLUMN IF NOT EXISTS product_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_admin_activity_product ON admin_activity(product_id, created_at DESC) WHERE product_id IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_accounts_phone ON accounts(phone);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_account ON password_reset_tokens(account_id);

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

-- ── ERP: factory article (Заводський артикул) ──
-- The supplier's own article (e.g. 8MG6719 / AL067N020_999), distinct from our
-- internal sku/код. Present in every Intertop & MG export, shown as a list
-- column and used to reconcile rows on price/stock import.
ALTER TABLE products ADD COLUMN IF NOT EXISTS factory_article TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_products_factory_article ON products(factory_article);

-- ── Finance: cost basis for profit/margin ──
-- The XLS exports carry no purchase cost, so cost is resolved by priority:
--   1. products.cost_price (manual edit or imported absolute cost)
--   2. per-brand rule (cost_rules.pct)
--   3. global markup / base-pct (store_settings: finance_markup_pct, finance_cost_basis)
ALTER TABLE products    ADD COLUMN IF NOT EXISTS cost_price  NUMERIC;          -- NULL ⇒ derive
ALTER TABLE products    ADD COLUMN IF NOT EXISTS cost_source TEXT NOT NULL DEFAULT ''; -- 'manual'|'import'|''
-- Photo storage core: TRUE once images were pulled off WordPress into the
-- server's own /public/catalog storage (self-contained catalog, no WP dependency).
ALTER TABLE products    ADD COLUMN IF NOT EXISTS photos_migrated BOOLEAN NOT NULL DEFAULT FALSE;
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
  price      NUMERIC,                       -- NULL ⇒ inherit product price (base_price)
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT '',
  UNIQUE (product_id, size)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- ── ERP: trade-offer (торгова пропозиція) extra fields ──
-- The Intertop/MG exports carry price AND a sale price per offer, plus the
-- marketplace offer code (mp…). Mirror that on the variant.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_price NUMERIC;            -- акційна ціна (NULL ⇒ none)
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS offer_code TEXT NOT NULL DEFAULT ''; -- mp-код оффера
CREATE INDEX IF NOT EXISTS idx_variants_offer_code ON product_variants(offer_code) WHERE offer_code <> '';

-- Intertop 2.1 guide's «Створити торгову пропозицію» panel — packaging
-- dimensions per offer (kg/cm). Nullable: unknown until an admin measures it.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS weight_pack NUMERIC;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS height_pack NUMERIC;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS width_pack  NUMERIC;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS length_pack NUMERIC;

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

-- ── ERP: stocktaking (інвентаризація) — physical count vs expected ──
-- Posting sets each counted variant's stock_qty to the physical count, logs an
-- 'adjust' movement for the variance, and recomputes the products mirror.
CREATE TABLE IF NOT EXISTS stocktakes (
  id         BIGSERIAL PRIMARY KEY,
  note       TEXT NOT NULL DEFAULT '',
  scope      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'draft',   -- draft | posted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS stocktake_items (
  id           BIGSERIAL PRIMARY KEY,
  stocktake_id BIGINT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  product_id   BIGINT NOT NULL,
  variant_id   BIGINT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  brand        TEXT NOT NULL DEFAULT '',
  size         TEXT NOT NULL DEFAULT '',
  expected     INTEGER NOT NULL DEFAULT 0,    -- variant stock_qty snapshot at add time
  counted      INTEGER,                       -- NULL until physically counted
  UNIQUE (stocktake_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_doc ON stocktake_items(stocktake_id);

-- ── ERP: purchasing (закупівлі) — purchase orders to suppliers ──
-- A PO is the PLAN (what we intend to buy); receiving a PO creates a receipt
-- (the FACT) via the proven receiving engine → stock + weighted-average cost.
-- Lifecycle: draft → sent → received | cancelled.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id          BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT,
  supplier    TEXT NOT NULL DEFAULT '',        -- snapshot name (frozen on the doc)
  status      TEXT NOT NULL DEFAULT 'draft',   -- draft | sent | received | cancelled
  note        TEXT NOT NULL DEFAULT '',
  expected_at DATE,                            -- очікувана дата поставки
  receipt_id  BIGINT,                          -- the receipt created on "receive"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ,
  received_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id         BIGSERIAL PRIMARY KEY,
  po_id      BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  variant_id BIGINT,
  size       TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL DEFAULT '',
  brand      TEXT NOT NULL DEFAULT '',
  qty        INTEGER NOT NULL DEFAULT 0,       -- ordered units
  unit_cost  NUMERIC NOT NULL DEFAULT 0        -- expected purchase cost / unit
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

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

-- ── ERP: SEO fields per-product ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title       TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT NOT NULL DEFAULT '';

-- Per-product override of the storefront's "hide products with no photo"
-- default (see lib/productSource.ts hasImg / store_settings.require_product_photo)
-- — lets an admin publish one specific product before its photo is ready,
-- without flipping the site-wide setting.
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_without_photo BOOLEAN NOT NULL DEFAULT FALSE;

-- ── ERP: Returns / RMA ──
CREATE TABLE IF NOT EXISTS returns (
  id           BIGSERIAL PRIMARY KEY,
  order_id     BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|received|refunded|exchanged|rejected
  reason       TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  total        NUMERIC NOT NULL DEFAULT 0,
  author       TEXT NOT NULL DEFAULT 'admin',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_returns_order  ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status, created_at DESC);

CREATE TABLE IF NOT EXISTS return_items (
  id         BIGSERIAL PRIMARY KEY,
  return_id  BIGINT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  variant_id BIGINT,
  name       TEXT NOT NULL DEFAULT '',
  size       TEXT NOT NULL DEFAULT '',
  qty        INTEGER NOT NULL DEFAULT 1,
  price      NUMERIC NOT NULL DEFAULT 0,
  action     TEXT NOT NULL DEFAULT 'refund' -- refund | exchange | store_credit
);
CREATE INDEX IF NOT EXISTS idx_return_items ON return_items(return_id);

-- ── ERP: Size charts / розмірні таблиці ──
CREATE TABLE IF NOT EXISTS size_charts (
  id         BIGSERIAL PRIMARY KEY,
  brand      TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL DEFAULT '',
  gender     TEXT NOT NULL DEFAULT '',
  chart      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ERP: Price rules / правила цін ──
CREATE TABLE IF NOT EXISTS price_rules (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  condition_field TEXT NOT NULL DEFAULT 'all', -- all|brand|category|gender
  condition_value TEXT NOT NULL DEFAULT '',
  action          TEXT NOT NULL DEFAULT 'set_markup', -- set_markup|set_discount|set_sale_pct|set_price
  value           NUMERIC NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ERP: Email templates ──
CREATE TABLE IF NOT EXISTS email_templates (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  slug       TEXT NOT NULL UNIQUE,
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ERP Grid: bulk-edit snapshots for rollback ──
CREATE TABLE IF NOT EXISTS grid_snapshots (
  id         BIGSERIAL PRIMARY KEY,
  label      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS grid_snapshot_items (
  id          BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES grid_snapshots(id) ON DELETE CASCADE,
  variant_id  BIGINT NOT NULL,
  product_id  BIGINT NOT NULL,
  size        TEXT NOT NULL DEFAULT '',
  qty_before  INTEGER NOT NULL DEFAULT 0,
  qty_after   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_grid_snap_items ON grid_snapshot_items(snapshot_id);

-- ── External photo sources (Каталог → Фото масово → З WP): any number of
-- WordPress (or future other) sites, tried in order, each independently
-- toggleable — replaces the single wp_photo_source_url setting.
CREATE TABLE IF NOT EXISTS photo_sources (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  base_url   TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'wp',
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ERP: named import templates (Intertop agora "Шаблони даних") ──
-- Explicit column→property mapping the admin defines once per supplier file
-- layout, instead of relying purely on stockImport.ts's synonym auto-detect.
-- Matching is by exact raw column label text in the file's header row.
CREATE TABLE IF NOT EXISTS import_templates (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  format         TEXT NOT NULL DEFAULT 'csv',   -- csv | xlsx
  encoding       TEXT NOT NULL DEFAULT 'utf-8', -- csv only
  delimiter      TEXT NOT NULL DEFAULT ';',     -- csv only
  header_row     INTEGER NOT NULL DEFAULT 1,    -- 1-based row with column labels
  data_start_row INTEGER NOT NULL DEFAULT 2,    -- 1-based row where data begins
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_template_columns (
  id           BIGSERIAL PRIMARY KEY,
  template_id  BIGINT NOT NULL REFERENCES import_templates(id) ON DELETE CASCADE,
  raw_label    TEXT NOT NULL,               -- exact column header text in the file
  property_key TEXT NOT NULL,               -- our canonical field, see importTemplates.ts PROPERTY_LIST
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_import_template_columns_template ON import_template_columns(template_id, sort_order);

-- ── ERP: import sources registry (Intertop agora "Джерела даних") ──
-- Named, persistent import channels — for us today always feed_type='file'
-- (a supplier's recurring upload, re-run manually each time), updated on
-- every apply. feed_type='url' is a placeholder for a future recurring
-- XML/Google-feed puller (not implemented — see importTemplates memory,
-- Стадія 2) and is accepted by the schema but not actionable yet.
CREATE TABLE IF NOT EXISTS import_sources (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  feed_type    TEXT NOT NULL DEFAULT 'file',  -- file | url
  template_id  BIGINT REFERENCES import_templates(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'new',   -- new | ok | error
  error_count  INTEGER NOT NULL DEFAULT 0,
  feed_url     TEXT,
  last_run_at  TIMESTAMPTZ,
  next_run_at  TIMESTAMPTZ,
  last_feed_created_at TEXT,  -- guide 2.8: XML <catalog created_at="…"> last seen — unchanged ⇒ skip
  last_run_summary TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_sources_name ON import_sources(name);

-- ── ERP: value lists (Intertop agora "Списки значень") ──
-- Controlled vocabularies (e.g. valid colors, genders, seasons) an import
-- template's mapped values can be checked/normalized against.
CREATE TABLE IF NOT EXISTS value_lists (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS value_list_items (
  id         BIGSERIAL PRIMARY KEY,
  list_id    BIGINT NOT NULL REFERENCES value_lists(id) ON DELETE CASCADE,
  value      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_value_list_items_list ON value_list_items(list_id, sort_order);

-- ── Intertop-style moderation workflow (2.1 guide) — layered ON TOP of the
-- existing products.status (publish/draft), which still gates real storefront
-- visibility. moderation_status is the admin-facing review state a product
-- moves through before an admin flips it live: draft → pending → approved
-- (sets status='publish') | rejected (sent back for edits). Existing rows
-- default to 'approved' since they're already live, properly-configured
-- products that never needed this review step.
ALTER TABLE products ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';

-- Intertop 2.1 guide splits the product card into «Мова Українська» /
-- «Мова Російська» (separate name+opис per language). Our existing name/
-- description columns are already Russian-language content (verified against
-- real rows — "Джинси"/"Сарафан" etc. are actually Russian spellings), so
-- they map onto «Мова Російська» as-is. name_uk/description_uk are new,
-- genuinely empty until an admin fills them in — nothing fabricated. The
-- storefront still reads name/description only; wiring an actual uk/ru
-- switcher there is separate, future work.
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_uk        TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_uk TEXT NOT NULL DEFAULT '';

-- Real Intertop odezda export (2026-07-10, ~4100 rows) confirmed the exact
-- product-attribute column set their partners fill in for clothing: of the
-- 55 template columns, only a handful are ever actually populated for this
-- vertical (everything else — style, technology, print, filler, cup_size,
-- packaging dims, etc. — is 0% filled even in Intertop's own real file, so
-- NOT modeled here; adding empty columns nobody fills isn't worth it). The
-- two genuinely-used fields we didn't have yet: "Матеріал верху" (100%
-- filled) and "Підвид" (94% filled — the classifier level one step more
-- specific than our existing category column, e.g. category="Джинси" →
-- subtype="Прямі джинси"). See AdminClassifier.tsx for the reference tree.
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS subtype  TEXT NOT NULL DEFAULT '';

-- Intertop 2.7 guide: full deletion ("Видалити") is only allowed for a
-- product that has NEVER been live ("ще не були вивантажені на сайт") — once
-- it's gone live even once, only archiving is available, forever, even if
-- it's later sent back to Чернетка (which would otherwise look identical to
-- a fresh, never-published draft — moderation_status alone can't tell them
-- apart). DEFAULT TRUE grandfathers all pre-existing rows as already-live
-- real inventory; createAdminProduct explicitly inserts FALSE for new ones,
-- and updateAdminProduct flips it to TRUE the moment moderation_status ever
-- becomes 'approved' — see lib/products.ts.
ALTER TABLE products ADD COLUMN IF NOT EXISTS ever_published BOOLEAN NOT NULL DEFAULT TRUE;

-- Intertop 2.8 guide: a "Джерела даних" source with feed_type='url' can now
-- actually be fetched/parsed/applied (see lib/importSources.ts's
-- runImportSource), either on demand or from a VPS cron hitting
-- /api/admin/import-sources/run-due every 3 hours. These two columns support
-- that: the XML feed's own created_at (skip reprocessing if unchanged) and a
-- short human-readable outcome for the admin table.
ALTER TABLE import_sources ADD COLUMN IF NOT EXISTS last_feed_created_at TEXT;
ALTER TABLE import_sources ADD COLUMN IF NOT EXISTS last_run_summary TEXT NOT NULL DEFAULT '';

-- Intertop 2.9 guide ("Зіставлення властивостей"): a value list isn't just a
-- flat vocabulary — it's scoped to ONE property and its rows are a raw→
-- canonical MAPPING ("Значення продавця" → "Значення"), used to translate a
-- supplier's own labels (e.g. "42"/"XL") into our canonical values before
-- import writes them. template_type mirrors "Тип шаблону" (Товари/Торгові
-- пропозиції) — schema-only for now, our importer only ever produces offer
-- rows (see stockImport.ts), so this doesn't change parsing behavior yet.
ALTER TABLE value_lists ADD COLUMN IF NOT EXISTS property_key TEXT NOT NULL DEFAULT '';
ALTER TABLE value_list_items ADD COLUMN IF NOT EXISTS seller_value TEXT NOT NULL DEFAULT '';
ALTER TABLE import_templates ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'offers';
ALTER TABLE import_template_columns ADD COLUMN IF NOT EXISTS value_list_id BIGINT REFERENCES value_lists(id) ON DELETE SET NULL;

-- Intertop 2.10 guide ("Розмірні сітки"): real charts are typed (одяг/
-- взуття/аксесуари/ювелірні вироби/для дому), each type with its own fixed
-- property set (see AdminSizeCharts.tsx SIZE_CHART_TYPES), and bound to a
-- product by an explicit code rather than a brand+gender best-match guess.
-- chart rows stay a flexible JSONB array (now free-form {size,...props} —
-- old {label,eu,us,uk,cm} rows still render fine, SizeChartModal iterates
-- whatever keys are present instead of hardcoding eu/us/uk/cm).
ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS type       TEXT NOT NULL DEFAULT 'clothing';
ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS code       TEXT NOT NULL DEFAULT '';
ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE products    ADD COLUMN IF NOT EXISTS size_chart_code TEXT NOT NULL DEFAULT '';

-- Brand-logo background hint: many high-res Logo.dev icons are a solid dark
-- fill (e.g. white "PINKO" text on black) which looks like a black box on the
-- white brand strip. logoDownloader.ts samples each downloaded logo's corner
-- pixels and marks it 'dark' (needs a dark tile — renders as an intentional
-- brand badge) or 'light' (dark ink / transparent — renders on the white
-- tile). See BrandLogo / homepage BrandStrip.
ALTER TABLE brand_logos ADD COLUMN IF NOT EXISTS bg TEXT NOT NULL DEFAULT 'light';
`;

/**
 * Idempotent schema creation. Uses a PostgreSQL advisory lock so that two
 * cluster workers starting simultaneously don't deadlock on concurrent DDL
 * (each ALTER TABLE acquires AccessExclusiveLock; two workers racing = deadlock).
 * pg_advisory_xact_lock(N) is held for the duration of the transaction and
 * auto-released on commit — the second worker then runs IF NOT EXISTS no-ops.
 */
export function ensureSchema(): Promise<void> {
  if (global.__mgSchemaReady) return global.__mgSchemaReady;
  const p = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(887766554)");
      await client.query(SCHEMA);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      global.__mgSchemaReady = undefined; // allow retry on next request
      throw e;
    } finally {
      client.release();
    }
  })();
  global.__mgSchemaReady = p;
  return p;
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
