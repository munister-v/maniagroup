/**
 * ERP "Завантажити товари" — price & stock import for the two real client
 * formats (see docs/intertop-formats.md):
 *
 *   • OFFERS  — Intertop prices.csv (8 cols, one row per trade offer / size):
 *               external_Id, factory_article, barcode, size, offer_code,
 *               quantity, base_price, discount_price.
 *               Also accepts the odezda.xlsx template (Ukrainian labels).
 *   • MASTER  — MG general DB (.xls, cp1251, one row per product):
 *               КОД, АРТИКУЛ, БРЕНД, НАИМЕНОВАНИЕ, «Размеры со всех складов»,
 *               Цена базовая, Цена продажи, Состав, Коллекция, Тип, Цвет, …
 *
 * The MASTER file is the BRIDGE: its КОД == our products.sku (≈100% overlap),
 * so importing it fills products.factory_article — after which the OFFERS file
 * matches our catalogue by factory_article + size.
 *
 * Every import has a dry-run PREVIEW (no writes) and an APPLY (one transaction,
 * 'import' stock movements, mirror recompute). Server-only.
 *
 * OWNERSHIP: writes both `products` (create/update via MASTER) and
 * `product_variants` (stock/price via OFFERS or MASTER), then recomputes the
 * products.is_in_stock / stock_qty mirror from variants — see lib/erp.ts
 * header. This recompute silently overwrites any manual is_in_stock toggle
 * made in the admin grid (lib/products.ts) since the last import.
 */

import * as XLSX from "xlsx";
import "./xlsxCodepage";
import { pool, q } from "./pg";
import { aiDetectImport } from "./aiImport";

export type ImportKind = "offers" | "master" | "unknown";

export type OfferRow = {
  external_id: string; factory_article: string; barcode: string; size: string;
  offer_code: string; quantity: number | null; base_price: number; discount_price: number;
};
export type MasterRow = {
  kod: string; factory_article: string; brand: string; name: string;
  sizes: Record<string, number>; base_price: number; sale_price: number;
  composition: string; collection: string; color: string; gender: string;
  category: string;
};

export type Parsed =
  | { kind: "offers"; filename: string; rows: OfferRow[] }
  | { kind: "master"; filename: string; rows: MasterRow[] }
  | { kind: "unknown"; filename: string; rows: never[] };

export type PreviewItem = {
  name: string;
  sku?: string;
  size?: string;
  oldQty: number | null;
  newQty: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  discountPrice: number | null;
  isNew: boolean;
};
/**
 * An OFFERS row with no matching product. Carries the raw row fields (not
 * just the display key) so the admin can create the missing product directly
 * from this row — see POST /api/admin/products — instead of having to build
 * a whole MG master file just to cover a couple of genuinely new items.
 */
export type UnmatchedItem = {
  key: string; size?: string;
  factory_article?: string; external_id?: string; barcode?: string;
  quantity?: number | null; base_price?: number; discount_price?: number;
};

/* ── parsing ─────────────────────────────────────────────────────────────── */

// Strip a UTF-8 BOM (U+FEFF) — CSV exports often prepend one, and it otherwise
// sticks to the first header cell ("﻿external_Id") so that column never
// matches a synonym and silently parses as empty (broke SKU matching).
const norm = (v: unknown) => String(v ?? "").replace(/﻿/g, "").trim().toLowerCase();
function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Split MG "Размеры со всех складов (с повторами)" → {size: count}. */
export function parseSizesString(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const tokens = String(raw ?? "").split(/[\s,;/|]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) out[t] = (out[t] ?? 0) + 1;
  return out;
}

export function readGrid(buf: Buffer, filename: string): unknown[][] {
  const isXls = /\.xls$/i.test(filename);
  // Strip a leading UTF-8 BOM (EF BB BF). SheetJS with codepage 65001 mishandles
  // it on CSVs and eats the first 2 chars of cell 0 ("external_Id" → "ternal_Id"),
  // so that column silently parses as empty — which broke SKU matching.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }
  const wb = XLSX.read(buf, { type: "buffer", codepage: isXls ? 1251 : 65001 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "", blankrows: false });
}

// Column synonyms for the OFFERS format (machine keys + Ukrainian labels).
const OFFER_SYN: Record<keyof OfferRow, string[]> = {
  external_id:     ["external_id", "код товару", "external_code"],
  factory_article: ["factory_article", "заводський артикул"],
  barcode:         ["barcode", "штрихкод"],
  size:            ["size", "розмір", "розмір одягу", "clother_size"],
  offer_code:      ["offer_code", "код оффера", "артикул"],
  quantity:        ["quantity", "кількість", "наявність", "qty"],
  base_price:      ["base_price", "базова ціна", "ціна"],
  discount_price:  ["discount_price", "акційна ціна"],
};

function offerColumns(cells: string[]): Record<keyof OfferRow, number> | null {
  const idx = {} as Record<keyof OfferRow, number>;
  (Object.keys(OFFER_SYN) as (keyof OfferRow)[]).forEach((k) => {
    idx[k] = cells.findIndex((c) => OFFER_SYN[k].includes(c));
  });
  // A price/stock file must have a size and at least one of price/quantity.
  if (idx.size < 0) return null;
  if (idx.base_price < 0 && idx.quantity < 0) return null;
  return idx;
}

export function parseImport(buf: Buffer, filename: string): Parsed {
  const grid = readGrid(buf, filename);
  const head = grid.slice(0, 12);

  // MASTER: a header row carrying cyrillic КОД + АРТИКУЛ.
  for (let i = 0; i < head.length; i++) {
    const cells = (grid[i] ?? []).map(norm);
    if (cells.includes("код") && cells.some((c) => c.startsWith("артикул"))) {
      return { kind: "master", filename, rows: parseMaster(grid, i) };
    }
  }
  // WP (WooCommerce export): has Type column with variable/variation values.
  for (let i = 0; i < head.length; i++) {
    const cells = (grid[i] ?? []).map(norm);
    if (cells.includes("type") && cells.some((c) => c === "sku" || c === "id") && cells.some((c) => c.includes("attribute"))) {
      const typeCol = cells.indexOf("type");
      // Classic WC export uses separate "variation" child rows → treat as offers
      // (update only). A manual table where every row is a "variable" with its
      // own size and no "variation" rows → treat as a full product source.
      const hasVariationRows = grid.slice(i + 1, i + 400).some((r) => {
        const t = norm((r as unknown[])[typeCol]);
        return t === "variation" || t === "варіація" || t === "вариація";
      });
      if (!hasVariationRows) {
        const mrows = parseWpMaster(grid, i);
        if (mrows.length > 0) return { kind: "master", filename, rows: mrows };
      }
      const rows = parseWp(grid, i);
      if (rows.length > 0) return { kind: "offers", filename, rows };
    }
  }
  // OFFERS: a header row with size + price/quantity columns.
  for (let i = 0; i < head.length; i++) {
    const cells = (grid[i] ?? []).map(norm);
    const idx = offerColumns(cells);
    if (idx) return { kind: "offers", filename, rows: parseOffers(grid, i + 1, idx) };
  }
  return { kind: "unknown", filename, rows: [] };
}

/** Parse WooCommerce product export (variable/variation rows) into OfferRow[]. */
function parseWp(grid: unknown[][], headerRow: number): OfferRow[] {
  const cells = (grid[headerRow] ?? []).map(norm);
  const ci = (names: string[]) => cells.findIndex((c) => names.some((n) => c === n || c.replace(/\s/g, "_") === n));
  const typeCol = ci(["type"]);
  const idCol = ci(["id"]);
  const skuCol = ci(["sku"]);
  const nameCol = ci(["name"]);
  const priceCol = ci(["regular price", "regular_price"]);
  const salePriceCol = ci(["sale price", "sale_price"]);
  const stockCol = ci(["stock", "in stock?", "in_stock", "stock_qty", "quantity"]);
  const parentSkuCol = ci(["parent", "parent sku", "parent_sku"]);

  // Find size attribute column: "Attribute 1 value(s)" where name col says "Розмір"
  let sizeAttrVal = -1;
  for (let ci2 = 0; ci2 < cells.length; ci2++) {
    const c = cells[ci2];
    if (/attribute.*value/i.test(c) || /значення/i.test(c)) {
      // Find corresponding name column — usually one before
      const nameIdx = cells.findIndex((x, idx) =>
        idx < ci2 && (/attribute.*name/i.test(x) || /назва.*атрибут/i.test(x))
      );
      if (nameIdx >= 0) {
        // Check any data row to see if this attribute is size
        for (let ri = headerRow + 1; ri < Math.min(headerRow + 20, grid.length); ri++) {
          const attrName = norm(grid[ri]?.[nameIdx]);
          if (attrName.includes("розмір") || attrName.includes("размер") || attrName.toLowerCase() === "size") {
            sizeAttrVal = ci2; break;
          }
        }
        if (sizeAttrVal >= 0) break;
      }
      // Fallback: if no name column found, check if values look like sizes
      if (sizeAttrVal < 0) {
        const sample = grid.slice(headerRow + 1, headerRow + 10)
          .map((r) => norm((r as unknown[])[ci2]))
          .filter(Boolean);
        if (sample.some((v) => /^(xs|s|m|l|xl|xxl|xxxl|\d{2,3})$/i.test(v))) {
          sizeAttrVal = ci2; break;
        }
      }
    }
  }
  if (sizeAttrVal < 0) return []; // can't map without size

  const at = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: OfferRow[] = [];
  let lastParentSku = "";
  let lastParentId = "";
  let lastParentPrice = 0;

  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const type = norm(at(r, typeCol));
    if (!type) continue;

    if (type === "variable" || type === "змінний") {
      lastParentSku = at(r, skuCol);
      lastParentId = at(r, idCol);
      lastParentPrice = priceCol >= 0 ? num(r[priceCol]) : 0;
      continue;
    }

    if (type !== "variation" && type !== "вариація" && type !== "варіація") continue;

    const size = at(r, sizeAttrVal);
    if (!size) continue;

    const sku = at(r, skuCol);
    const extId = at(r, idCol) || lastParentId;
    const fa = parentSkuCol >= 0 ? at(r, parentSkuCol) : lastParentSku;
    const price = priceCol >= 0 && at(r, priceCol) ? num(r[priceCol]) : lastParentPrice;
    const saleP = salePriceCol >= 0 ? num(r[salePriceCol]) : 0;
    const qty = stockCol >= 0 && at(r, stockCol) !== "" ? Math.max(0, Math.round(num(r[stockCol]))) : null;

    rows.push({
      external_id: extId,
      factory_article: fa || lastParentSku,
      barcode: "",
      size,
      offer_code: sku,
      quantity: qty,
      base_price: price,
      discount_price: saleP,
    });
  }
  return rows;
}

/** Locate the "Attribute N value(s)" column that actually holds clothing sizes. */
function findSizeAttrCol(grid: unknown[][], headerRow: number, cells: string[]): number {
  for (let c = 0; c < cells.length; c++) {
    if (!(/attribute.*value/i.test(cells[c]) || /значення/i.test(cells[c]))) continue;
    const nameIdx = cells.findIndex((x, idx) => idx < c && (/attribute.*name/i.test(x) || /назва.*атрибут/i.test(x)));
    if (nameIdx >= 0) {
      for (let ri = headerRow + 1; ri < Math.min(headerRow + 30, grid.length); ri++) {
        const an = norm(grid[ri]?.[nameIdx]);
        if (an.includes("розмір") || an.includes("размер") || an === "size") return c;
      }
    }
    const sample = grid.slice(headerRow + 1, headerRow + 15).map((r) => norm((r as unknown[])[c])).filter(Boolean);
    if (sample.some((v) => /^(xs|s|m|l|xl|xxl|xxxl|\d{2,3}([.,]5)?)$/i.test(v))) return c;
  }
  return -1;
}

/**
 * Manual WooCommerce stock table (the format a person kept by hand): one row per
 * product+size, Type=variable, size in "Attribute 1 value(s)", plus Артикул and
 * Categories columns. Richer than the MG master — it carries categories, which MG
 * lacks. Grouped by ID into MasterRow[] so the import CREATES products (with
 * category) and seeds per-size stock.
 */
function parseWpMaster(grid: unknown[][], headerRow: number): MasterRow[] {
  const cells = (grid[headerRow] ?? []).map(norm);
  const ci = (pred: (c: string) => boolean) => cells.findIndex(pred);
  const idCol    = ci((c) => c === "id");
  const skuCol   = ci((c) => c === "sku");
  const nameCol  = ci((c) => c === "name" || c.startsWith("назва"));
  const regCol   = ci((c) => c.includes("regular price") || c === "regular_price" || c.includes("базов"));
  const saleCol  = ci((c) => c.includes("sale price") || c === "sale_price" || c.includes("продаж") || c.includes("акці"));
  const stockCol = ci((c) => c === "stock" || c === "stock_qty");
  const instCol  = ci((c) => c.includes("in stock") || c.includes("наявн"));
  const catCol   = ci((c) => c.startsWith("categor") || c.startsWith("категор"));
  const artCol   = ci((c) => c.startsWith("артикул") || c.startsWith("factory"));
  const colorCol = ci((c) => c.startsWith("цвет") || c.startsWith("колір") || c === "color");
  const compCol  = ci((c) => c.startsWith("состав") || c.startsWith("склад") || c === "composition");
  const seasCol  = ci((c) => c.startsWith("сезон") || c.startsWith("season") || c.startsWith("коллек") || c.startsWith("колекц"));
  const sizeCol  = findSizeAttrCol(grid, headerRow, cells);
  if (idCol < 0 || sizeCol < 0) return [];

  const at = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const byId = new Map<string, MasterRow>();
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const size = at(r, sizeCol);
    if (!size) continue;                                  // parent rows w/o a size
    const kod = at(r, idCol).split(".")[0];
    if (!/^\d+$/.test(kod)) continue;

    const stockNum = stockCol >= 0 ? Math.max(0, Math.round(num(r[stockCol]))) : 0;
    const inStock = instCol >= 0 ? /^(1|yes|так|true|\+)/i.test(at(r, instCol)) : true;
    const qty = stockNum > 0 ? stockNum : (inStock ? 1 : 0);

    let m = byId.get(kod);
    if (!m) {
      m = {
        kod, factory_article: at(r, artCol), brand: "", name: at(r, nameCol),
        sizes: {}, base_price: regCol >= 0 ? num(r[regCol]) : 0,
        sale_price: saleCol >= 0 ? num(r[saleCol]) : 0,
        composition: at(r, compCol), collection: at(r, seasCol),
        color: at(r, colorCol), gender: "", category: at(r, catCol),
      };
      byId.set(kod, m);
    }
    m.sizes[size] = (m.sizes[size] ?? 0) + qty;
    // backfill any field the first row of this product happened to leave empty
    if (!m.factory_article) m.factory_article = at(r, artCol);
    if (!m.name) m.name = at(r, nameCol);
    if (!m.category) m.category = at(r, catCol);
    if (!m.color) m.color = at(r, colorCol);
    if (!m.composition) m.composition = at(r, compCol);
    if (!m.collection) m.collection = at(r, seasCol);
    if (!m.base_price && regCol >= 0) m.base_price = num(r[regCol]);
    if (!m.sale_price && saleCol >= 0) m.sale_price = num(r[saleCol]);
  }
  return [...byId.values()];
}

/**
 * Smart parse: fast rule-based first, and if the format is unknown, fall back
 * to the OpenRouter AI mapper (any column layout / language / new supplier).
 * Returns `ai: true` when the AI mapping was used.
 */
export async function parseImportSmart(buf: Buffer, filename: string): Promise<Parsed & { ai?: boolean }> {
  const fast = parseImport(buf, filename);
  if (fast.kind !== "unknown") return fast;

  const grid = readGrid(buf, filename);
  const mapping = await aiDetectImport(grid);
  if (!mapping) return fast;

  if (mapping.kind === "offers") {
    const c = mapping.columns;
    const idx = {
      external_id: c.external_id ?? -1, factory_article: c.factory_article ?? -1,
      barcode: c.barcode ?? -1, size: c.size ?? -1, offer_code: c.offer_code ?? -1,
      quantity: c.quantity ?? -1, base_price: c.base_price ?? -1, discount_price: c.discount_price ?? -1,
    } as Record<keyof OfferRow, number>;
    if (idx.size < 0) return fast;
    return { kind: "offers", filename, rows: parseOffers(grid, mapping.headerRow + 1, idx), ai: true };
  }

  const c = mapping.columns;
  const col: MasterCols = {
    kod: c.kod ?? -1, fa: c.factory_article ?? -1, brand: c.brand ?? -1, name: c.name ?? -1,
    sizes: c.sizes ?? -1, base: c.base_price ?? -1, sale: c.sale_price ?? -1,
    comp: c.composition ?? -1, coll: c.collection ?? -1, color: c.color ?? -1, gender: -1, category: -1,
  };
  if (col.kod < 0) return fast;
  return { kind: "master", filename, rows: parseMasterRows(grid, mapping.headerRow + 1, col), ai: true };
}

function parseOffers(grid: unknown[][], from: number, idx: Record<keyof OfferRow, number>): OfferRow[] {
  const at = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: OfferRow[] = [];
  for (let i = from; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const size = at(r, idx.size);
    const ext = at(r, idx.external_id);
    const fa = at(r, idx.factory_article);
    const offer = at(r, idx.offer_code);
    const bc = at(r, idx.barcode);
    if (!size && !ext && !fa && !offer && !bc) continue; // blank line
    // Skip a possible second machine-key header row (e.g. odezda template).
    if (norm(size) === "size" || norm(size) === "clother_size") continue;
    rows.push({
      external_id: ext, factory_article: fa, barcode: bc, size,
      offer_code: offer,
      quantity: idx.quantity >= 0 && String(r[idx.quantity] ?? "") !== "" ? Math.max(0, Math.round(num(r[idx.quantity]))) : null,
      base_price: idx.base_price >= 0 ? num(r[idx.base_price]) : 0,
      discount_price: idx.discount_price >= 0 ? num(r[idx.discount_price]) : 0,
    });
  }
  return rows;
}

type MasterCols = { kod: number; fa: number; brand: number; name: number; sizes: number; base: number; sale: number; comp: number; coll: number; color: number; gender: number; category: number };

/** MG "Тип" column (Женская / Мужская / Детская / Унисекс) → our gender slug. */
function genderFromType(raw: string): string {
  const t = norm(raw);
  if (!t) return "";
  if (t.startsWith("жен") || t.startsWith("жін")) return "women";
  if (t.startsWith("муж") || t.startsWith("чол")) return "men";
  if (t.startsWith("дет") || t.startsWith("дит")) return "kids";
  if (t.startsWith("уни") || t.startsWith("уні")) return "unisex";
  return "";
}

function parseMaster(grid: unknown[][], headerRow: number): MasterRow[] {
  const cells = (grid[headerRow] ?? []).map(norm);
  const find = (pred: (c: string) => boolean) => cells.findIndex(pred);
  const col: MasterCols = {
    kod:   find((c) => c === "код"),
    fa:    find((c) => c.startsWith("артикул")),
    brand: find((c) => c.startsWith("бренд")),
    name:  find((c) => c.startsWith("наимен") || c.startsWith("наймен")),
    sizes: find((c) => c.startsWith("размер") || c.startsWith("розмір")),
    base:  find((c) => c.includes("базов")),
    sale:  find((c) => c.includes("продаж")),
    comp:  find((c) => c.startsWith("состав") || c.startsWith("склад")),
    coll:  find((c) => c.startsWith("коллек") || c.startsWith("колекц")),
    color: find((c) => c.startsWith("цвет") || c.startsWith("колір")),
    gender: find((c) => c === "тип" || c === "пол" || c.startsWith("стать") || c.startsWith("признач")),
    category: find((c) => c.startsWith("категор") || c.startsWith("categor")),
  };
  return parseMasterRows(grid, headerRow + 1, col);
}

function parseMasterRows(grid: unknown[][], dataStart: number, col: MasterCols): MasterRow[] {
  const at = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: MasterRow[] = [];
  for (let i = dataStart; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const kod = at(r, col.kod).split(".")[0];
    if (!/^\d+$/.test(kod)) continue; // brand sub-headers / blanks
    rows.push({
      kod,
      factory_article: at(r, col.fa),
      brand: at(r, col.brand),
      name: at(r, col.name),
      sizes: parseSizesString(at(r, col.sizes)),
      base_price: col.base >= 0 ? num(r[col.base]) : 0,
      sale_price: col.sale >= 0 ? num(r[col.sale]) : 0,
      composition: at(r, col.comp),
      collection: at(r, col.coll),
      color: at(r, col.color),
      gender: genderFromType(at(r, col.gender)),
      category: at(r, col.category),
    });
  }
  return rows;
}

/* ── preview + apply ─────────────────────────────────────────────────────── */

export type ImportPreview = {
  kind: ImportKind;
  filename: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  affectedProducts: number;
  newProducts: number;
  newVariants: number;
  stockChanges: number;
  priceChanges: number;
  items: PreviewItem[];
  unmatched: UnmatchedItem[];
  /** @deprecated kept for old consumers — mirrors first 12 items as text */
  sample: { name: string; size?: string; detail: string }[];
  /** @deprecated kept for old consumers — first 8 unmatched as strings */
  unmatchedSample: string[];
};

type VariantLite = { id: number; size: string; stock_qty: number; price: number | null; sale_price: number | null; barcode: string; offer_code: string };

/** Load products + their variants for a set of ids. */
async function loadProducts(ids: number[]) {
  const prods = await q<{ id: string; name: string; sku: string; factory_article: string; regular_price: string; sale_price: string | null }>(
    `SELECT id::text, name, sku, factory_article, regular_price::float::text AS regular_price, sale_price::float::text AS sale_price
       FROM products WHERE id = ANY($1)`, [ids],
  );
  const vars = await q<VariantLite & { product_id: string }>(
    `SELECT id, product_id::text, size, stock_qty, price::float AS price, sale_price::float AS sale_price, barcode, offer_code
       FROM product_variants WHERE product_id = ANY($1)`, [ids],
  );
  const byId = new Map(prods.map((p) => [p.id, p]));
  const variantsByProduct = new Map<string, VariantLite[]>();
  for (const v of vars) {
    const arr = variantsByProduct.get(v.product_id) ?? [];
    arr.push(v); variantsByProduct.set(v.product_id, arr);
  }
  return { byId, variantsByProduct };
}

/** Resolve every offer row → product id, using the matching chain. */
export async function resolveOfferTargets(rows: OfferRow[]) {
  const factoryArticles = [...new Set(rows.map((r) => r.factory_article).filter(Boolean))];
  const externalIds = [...new Set(rows.map((r) => r.external_id).filter(Boolean))];
  const offerCodes = [...new Set(rows.map((r) => r.offer_code).filter(Boolean))];
  const barcodes = [...new Set(rows.map((r) => r.barcode).filter(Boolean))];

  const faMap = new Map<string, number>();
  const skuMap = new Map<string, number>();
  const offerMap = new Map<string, number>(); // offer_code → product_id
  const barcodeMap = new Map<string, number>();

  if (factoryArticles.length) {
    for (const p of await q<{ id: string; factory_article: string }>(
      "SELECT id::text, factory_article FROM products WHERE factory_article = ANY($1) AND factory_article <> ''", [factoryArticles]))
      faMap.set(p.factory_article, Number(p.id));
  }
  if (externalIds.length) {
    for (const p of await q<{ id: string; sku: string }>(
      "SELECT id::text, sku FROM products WHERE sku = ANY($1) AND sku <> ''", [externalIds]))
      skuMap.set(p.sku, Number(p.id));
  }
  if (offerCodes.length) {
    for (const v of await q<{ product_id: string; offer_code: string }>(
      "SELECT product_id::text, offer_code FROM product_variants WHERE offer_code = ANY($1) AND offer_code <> ''", [offerCodes]))
      offerMap.set(v.offer_code, Number(v.product_id));
  }
  if (barcodes.length) {
    for (const v of await q<{ product_id: string; barcode: string }>(
      "SELECT product_id::text, barcode FROM product_variants WHERE barcode = ANY($1) AND barcode <> ''", [barcodes]))
      barcodeMap.set(v.barcode, Number(v.product_id));
  }
  const target = (r: OfferRow): number | null =>
    (r.offer_code && offerMap.get(r.offer_code)) ||
    (r.barcode && barcodeMap.get(r.barcode)) ||
    (r.factory_article && faMap.get(r.factory_article)) ||
    (r.external_id && skuMap.get(r.external_id)) || null;
  return target;
}

export async function previewImport(parsed: Parsed): Promise<ImportPreview> {
  const base: ImportPreview = {
    kind: parsed.kind, filename: parsed.filename, totalRows: parsed.rows.length,
    matchedRows: 0, unmatchedRows: 0, affectedProducts: 0, newProducts: 0, newVariants: 0,
    stockChanges: 0, priceChanges: 0, items: [], unmatched: [], sample: [], unmatchedSample: [],
  };
  if (parsed.kind === "unknown" || parsed.rows.length === 0) return base;

  if (parsed.kind === "master") {
    const rows = parsed.rows;
    const skus = [...new Set(rows.map((r) => r.kod))];
    const prods = await q<{ id: string; sku: string; name: string; regular_price: string }>(
      "SELECT id::text, sku, name, COALESCE(regular_price,0)::float::text AS regular_price FROM products WHERE sku = ANY($1)", [skus],
    );
    const skuMap = new Map(prods.map((p) => [p.sku, p]));
    const affected = new Set<number>();
    for (const r of rows) {
      const p = skuMap.get(r.kod);
      const isNew = !p;                       // КОД not in catalog ⇒ create a new product
      base.matchedRows++;
      if (p) affected.add(Number(p.id)); else base.newProducts++;
      const units = Object.values(r.sizes).reduce((a, b) => a + b, 0);
      if (units > 0) base.stockChanges += Object.keys(r.sizes).length;
      if (r.base_price > 0) base.priceChanges++;
      if (base.items.length < 120) {
        base.items.push({
          name: r.name || p?.name || r.kod, sku: r.kod,
          oldQty: null, newQty: units || null,
          oldPrice: p ? Number(p.regular_price) || null : null,
          newPrice: r.base_price > 0 ? r.base_price : null,
          discountPrice: r.sale_price > 0 ? r.sale_price : null,
          isNew,
        });
      }
      if (base.sample.length < 12) base.sample.push({
        name: r.name || r.kod,
        detail: `арт. ${r.factory_article || "—"}${units ? ` · ${units} од (${Object.keys(r.sizes).length} розм.)` : ""}${r.base_price > 0 ? ` · ${Math.round(r.base_price)}₴` : ""}`,
      });
    }
    base.affectedProducts = affected.size;
    base.newVariants = base.stockChanges;
    return base;
  }

  // offers
  const rows = parsed.rows;
  const target = await resolveOfferTargets(rows);
  const matched = rows.map((r) => ({ r, pid: target(r) }));
  const ids = [...new Set(matched.map((m) => m.pid).filter((x): x is number => !!x))];
  const { byId, variantsByProduct } = await loadProducts(ids);
  const affected = new Set<number>();
  for (const { r, pid } of matched) {
    if (!pid) {
      base.unmatchedRows++;
      const ukey = r.factory_article || r.offer_code || r.external_id;
      // Cap generously (not the old 30) so the admin can export the FULL
      // unmatched list as CSV, not just a display sample.
      if (base.unmatched.length < 5000) base.unmatched.push({
        key: ukey, size: r.size,
        factory_article: r.factory_article || undefined,
        external_id: r.external_id || undefined,
        barcode: r.barcode || undefined,
        quantity: r.quantity,
        base_price: r.base_price || undefined,
        discount_price: r.discount_price || undefined,
      });
      if (base.unmatchedSample.length < 8) base.unmatchedSample.push(`${ukey} ${r.size}`);
      continue;
    }
    base.matchedRows++; affected.add(pid);
    const p = byId.get(String(pid));
    const variants = variantsByProduct.get(String(pid)) ?? [];
    const v = variants.find((x) => x.size === r.size);
    if (!v) base.newVariants++;
    if (r.quantity != null && (!v || v.stock_qty !== r.quantity)) base.stockChanges++;
    const curPrice = v?.price ?? Number(p?.regular_price ?? 0);
    if (r.base_price > 0 && Math.abs(r.base_price - (curPrice || 0)) > 1) base.priceChanges++;
    if (base.items.length < 120) {
      base.items.push({
        name: p?.name ?? String(pid), sku: p?.sku,
        size: r.size,
        oldQty: v ? v.stock_qty : null,
        newQty: r.quantity,
        oldPrice: curPrice || null,
        newPrice: r.base_price > 0 ? r.base_price : null,
        discountPrice: r.discount_price > 0 ? r.discount_price : null,
        isNew: !v,
      });
    }
    if (base.sample.length < 12) base.sample.push({
      name: p?.name ?? String(pid), size: r.size,
      detail: `${r.base_price > 0 ? `${Math.round(r.base_price)}₴` : ""}${r.discount_price > 0 ? ` (акц. ${Math.round(r.discount_price)}₴)` : ""}${r.quantity != null ? ` · ${r.quantity} од` : ""}`,
    });
  }
  base.affectedProducts = affected.size;
  return base;
}

export type ApplyResult = {
  kind: ImportKind;
  matchedRows: number; unmatchedRows: number;
  productsCreated: number; productsUpdated: number; variantsUpserted: number; stockMovements: number;
};

export async function applyImport(parsed: Parsed): Promise<ApplyResult> {
  const res: ApplyResult = { kind: parsed.kind, matchedRows: 0, unmatchedRows: 0, productsCreated: 0, productsUpdated: 0, variantsUpserted: 0, stockMovements: 0 };
  if (parsed.kind === "unknown" || parsed.rows.length === 0) return res;
  const importNote = `Імпорт: ${parsed.filename}`;
  const client = await pool.connect();
  const affected = new Set<number>();
  try {
    await client.query("BEGIN");

    if (parsed.kind === "master") {
      const rows = parsed.rows;
      const skus = [...new Set(rows.map((r) => r.kod))];
      const prods = await client.query<{ id: string; sku: string }>("SELECT id::text, sku FROM products WHERE sku = ANY($1)", [skus]);
      const skuToId = new Map(prods.rows.map((p) => [p.sku, Number(p.id)]));
      for (const r of rows) {
        let pid = skuToId.get(r.kod);
        res.matchedRows++;
        if (!pid) {
          // КОД not in catalog → create the product from the master row.
          pid = await createMasterProduct(client, r);
          if (!pid) { res.matchedRows--; res.unmatchedRows++; continue; }
          skuToId.set(r.kod, pid);
          res.productsCreated++;
        } else {
          // Existing product: set factory_article (bridge) + fill empty
          // descriptive fields + optional prices. Only overwrite empties.
          const sets = ["factory_article = $2", "updated_at = now()"];
          const bind: unknown[] = [pid, r.factory_article];
          if (r.category)    { bind.push(r.category);    sets.push(`category = CASE WHEN category = '' THEN $${bind.length} ELSE category END`);
                               bind.push(slugifyMaster(r.category)); sets.push(`category_slug = CASE WHEN category_slug = '' THEN $${bind.length} ELSE category_slug END`); }
          if (r.brand)       { bind.push(r.brand);       sets.push(`brand = CASE WHEN brand IN ('', 'Mania Group') THEN $${bind.length} ELSE brand END`); }
          if (r.name)        { bind.push(r.name);        sets.push(`name = CASE WHEN name = '' THEN $${bind.length} ELSE name END`); }
          if (r.composition) { bind.push(r.composition); sets.push(`composition = CASE WHEN composition = '' THEN $${bind.length} ELSE composition END`); }
          if (r.collection)  { bind.push(r.collection);  sets.push(`collection = CASE WHEN collection = '' THEN $${bind.length} ELSE collection END`); }
          if (r.color)       { bind.push(r.color);       sets.push(`color = CASE WHEN color = '' THEN $${bind.length} ELSE color END`); }
          if (r.gender)      { bind.push(r.gender);      sets.push(`gender = CASE WHEN gender = '' THEN $${bind.length} ELSE gender END`); }
          if (r.base_price > 0) {
            const sale = r.sale_price > 0 && r.sale_price < r.base_price ? r.sale_price : null;
            bind.push(r.base_price); const bi = bind.length;
            bind.push(sale); const si = bind.length;
            sets.push(`regular_price = $${bi}::numeric`, `sale_price = $${si}::numeric`, `price = COALESCE($${si}::numeric, $${bi}::numeric)`);
          }
          await client.query(`UPDATE products SET ${sets.join(", ")} WHERE id = $1`, bind);
          res.productsUpdated++;
        }
        affected.add(pid);
        // Stock from "Размеры со всех складов" (only if the column had data).
        for (const [size, qty] of Object.entries(r.sizes)) {
          res.stockMovements += await upsertVariantStock(client, pid, size, qty, r.base_price || null, undefined, undefined, importNote);
          res.variantsUpserted++;
        }
      }
    } else {
      // offers
      const rows = parsed.rows;
      const target = await resolveOfferTargets(rows);
      for (const r of rows) {
        const pid = target(r);
        if (!pid) { res.unmatchedRows++; continue; }
        res.matchedRows++; affected.add(pid);
        const sale = r.discount_price > 0 && (!r.base_price || r.discount_price < r.base_price) ? r.discount_price : null;
        res.stockMovements += await upsertVariantStock(
          client, pid, r.size, r.quantity, r.base_price > 0 ? r.base_price : null, sale,
          { barcode: r.barcode || undefined, offer_code: r.offer_code || undefined },
          importNote,
        );
        res.variantsUpserted++;
        // backfill factory_article on the product if we have it and it's empty
        if (r.factory_article) {
          await client.query("UPDATE products SET factory_article = $2 WHERE id = $1 AND factory_article = ''", [pid, r.factory_article]);
        }
      }
    }

    // Recompute the products.stock_qty / is_in_stock mirror for everything touched.
    if (affected.size) {
      await client.query(
        `UPDATE products p SET
            stock_qty = sub.total,
            is_in_stock = (sub.total > 0),
            updated_at = now()
         FROM (
           SELECT pid AS product_id,
                  COALESCE((SELECT SUM(stock_qty) FROM product_variants v WHERE v.product_id = pid AND v.active), 0) AS total
           FROM unnest($1::bigint[]) AS pid
         ) sub
         WHERE p.id = sub.product_id`,
        [[...affected]],
      );
    }
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const slugifyMaster = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-+|-+$/g, "");

/**
 * Create a catalog product from one MG master row. КОД is numeric and unique
 * (it doubles as the internal sku), so we use it as the product id. Prices /
 * gender / descriptive fields come straight from the row; stock is seeded later
 * by upsertVariantStock and the mirror recompute. Returns the new id (0 if КОД
 * is not a usable number).
 */
async function createMasterProduct(client: import("pg").PoolClient, r: MasterRow): Promise<number> {
  const id = Number(r.kod);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const name = r.name || `Товар ${r.kod}`;
  const slugBase = slugifyMaster(name);
  const slug = slugBase ? `${slugBase}-${r.kod}` : String(r.kod);
  const units = Object.values(r.sizes).reduce((a, b) => a + b, 0);
  const sale = r.sale_price > 0 && r.base_price > 0 && r.sale_price < r.base_price ? r.sale_price : null;
  const price = sale ?? (r.base_price > 0 ? r.base_price : 0);
  const category = r.category || "";
  const categorySlug = category ? slugifyMaster(category) : "";

  const ins = await client.query<{ id: string }>(
    `INSERT INTO products
       (id, sku, name, slug, brand, category, category_slug, gender,
        factory_article, price, regular_price, sale_price,
        is_in_stock, stock_qty, status, composition, collection, color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'publish',$15,$16,$17)
     ON CONFLICT (id) DO NOTHING
     RETURNING id::text`,
    [
      id, r.kod, name, slug, r.brand || "Mania Group", category, categorySlug, r.gender, r.factory_article,
      price, r.base_price > 0 ? r.base_price : 0, sale,
      units > 0, units, r.composition, r.collection, r.color,
    ],
  );
  if (ins.rows.length) return Number(ins.rows[0].id);
  const ex = await client.query<{ id: string }>("SELECT id::text FROM products WHERE id = $1", [id]);
  return ex.rows.length ? Number(ex.rows[0].id) : 0;
}

/**
 * Upsert one (product, size) variant: set price/sale/barcode/offer_code when
 * provided, and set the absolute stock when `qty` is non-null (logging an
 * 'import' movement for the delta). Returns 1 if a movement was logged, else 0.
 */
async function upsertVariantStock(
  client: import("pg").PoolClient,
  productId: number, size: string, qty: number | null,
  price: number | null, sale?: number | null,
  meta?: { barcode?: string; offer_code?: string },
  importNote = "Імпорт цін/залишків",
): Promise<number> {
  if (!size.trim()) return 0;
  const cur = await client.query<{ id: string; stock_qty: number }>(
    "SELECT id::text, stock_qty FROM product_variants WHERE product_id = $1 AND size = $2", [productId, size.trim()],
  );
  let variantId: number;
  let before = 0;
  if (cur.rows.length) {
    variantId = Number(cur.rows[0].id); before = Number(cur.rows[0].stock_qty);
  } else {
    const ins = await client.query<{ id: string }>(
      "INSERT INTO product_variants (product_id, size, updated_by) VALUES ($1, $2, 'import') RETURNING id::text", [productId, size.trim()],
    );
    variantId = Number(ins.rows[0].id);
  }
  // meta + price
  const sets: string[] = ["updated_at = now()", "updated_by = 'import'"];
  const bind: unknown[] = [variantId];
  const add = (col: string, v: unknown, cast = "") => { bind.push(v); sets.push(`${col} = $${bind.length}${cast}`); };
  if (price != null) add("price", price, "::numeric");
  if (sale !== undefined) add("sale_price", sale, "::numeric");
  if (meta?.barcode) add("barcode", meta.barcode);
  if (meta?.offer_code) add("offer_code", meta.offer_code);
  let movement = 0;
  if (qty != null) {
    const after = Math.max(0, Math.round(qty));
    add("stock_qty", after);
    if (after !== before) {
      await client.query(
        `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
         VALUES ($1, $2, $3, 'import', $4, $5, $6, 'import')`,
        [productId, variantId, size.trim(), after - before, after, importNote],
      );
      movement = 1;
    }
  }
  await client.query(`UPDATE product_variants SET ${sets.join(", ")} WHERE id = $1`, bind);
  return movement;
}
