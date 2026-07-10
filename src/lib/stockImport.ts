/**
 * ERP "Завантажити товари" — price & stock import, Intertop-format only
 * (see docs/intertop-formats.md):
 *
 *   • OFFERS — Intertop prices.csv (8 cols, one row per trade offer / size):
 *              external_Id, factory_article, barcode, size, offer_code,
 *              quantity, base_price, discount_price.
 *              Also accepts the odezda.xlsx template (Ukrainian labels), the
 *              full Intertop agora Marketplace export template (any vertical
 *              — verified against the real beauty/cosmetics one, which adds
 *              `article`/`active` columns and has NO size column at all —
 *              see below), and a WooCommerce variable/variation export.
 *
 * Not every vertical is per-size: beauty/cosmetics rows have no "Розмір" at
 * all (one row = one product), so `size` is optional at the detection level
 * — a row with no size column falls back to a single "ОД" (one-unit) variant
 * rather than getting rejected. `article` ("Артикул") is a genuinely distinct
 * identifier from `factory_article` in the full template — Intertop's own
 * internal product number vs the supplier's code — and is what we prefer for
 * OUR internal sku when auto-creating a product, over the more generic
 * external_id. `active` ("Активність") maps straight to product_variants.active.
 *
 * Rows that resolve to no existing product but carry enough descriptive data
 * (odezda-style rich columns) auto-create the product — see
 * groupNewProductRows / createProductFromOffer. There is no separate
 * "master" (one-row-per-product) import path; the old MG-format bulk-catalog
 * importer was removed since the store now runs on the Intertop data model
 * exclusively.
 *
 * Every import has a dry-run PREVIEW (no writes) and an APPLY (one transaction,
 * 'import' stock movements, mirror recompute). Server-only.
 *
 * OWNERSHIP: writes both `products` (auto-create only) and `product_variants`
 * (stock/price), then recomputes the products.is_in_stock / stock_qty mirror
 * from variants — see lib/erp.ts header. This recompute silently overwrites
 * any manual is_in_stock toggle made in the admin grid (lib/products.ts)
 * since the last import.
 */

import * as XLSX from "xlsx";
import "./xlsxCodepage";
import { pool, q } from "./pg";
import { aiDetectImport } from "./aiImport";

export type ImportKind = "offers" | "unknown";

/**
 * Descriptive fields opportunistically read from a rich OFFERS file (the
 * odezda.xlsx template has 55 columns; only these are worth carrying since
 * they're the ones a new product actually needs — see createProductFromOffer).
 * Populated only when the file has these columns AND the row has a name.
 */
export type OfferProductInfo = {
  name_uk?: string; name_ru?: string;
  description_uk?: string; description_ru?: string;
  brand?: string; category?: string; color?: string; country?: string;
  gender?: string; composition_uk?: string; composition_ru?: string;
  material?: string; subtype?: string;
};

export type OfferRow = {
  external_id: string; factory_article: string; barcode: string; size: string;
  offer_code: string; quantity: number | null; base_price: number; discount_price: number;
  article: string; active?: boolean;
  product?: OfferProductInfo;
};
export type Parsed =
  | { kind: "offers"; filename: string; rows: OfferRow[] }
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
  // Only set for isNew rows — lets the admin see, before applying, whether a
  // new product will land На модерації or Чернетка (guide 2.2 §4 "Статус").
  moderationNote?: "pending" | "draft";
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

// Column synonyms for the OFFERS format's required fields (machine keys +
// Ukrainian labels). "Артикул"/article is deliberately kept separate from
// "Заводський артикул"/factory_article — in the odezda (fashion) template
// those two happened to be identical so we dropped article as redundant, but
// the full Intertop agora export (e.g. the beauty-category template) carries
// them as genuinely distinct columns: article is Intertop's own internal
// product number, factory_article is the supplier's code. See offer_code
// (mp-code) vs barcode (real per-offer key) — four separate identifiers.
type OfferReqKey = Exclude<keyof OfferRow, "product">;
const OFFER_SYN: Record<OfferReqKey, string[]> = {
  external_id:     ["external_id", "код товару", "external_code"],
  factory_article: ["factory_article", "заводський артикул"],
  article:         ["article", "артикул"],
  barcode:         ["barcode", "штрихкод"],
  size:            ["size", "розмір", "розмір одягу", "clother_size"],
  offer_code:      ["offer_code", "код оффера"],
  quantity:        ["quantity", "кількість", "наявність", "qty"],
  base_price:      ["base_price", "базова ціна", "ціна"],
  discount_price:  ["discount_price", "акційна ціна"],
  active:          ["active", "активність", "активность"],
};

// Descriptive columns odezda-style rich OFFERS files carry — optional, only
// used to auto-create a product when a row's target doesn't resolve to one.
//
// Verified against a real Intertop odezda export (2026-07-10, ~4100 rows,
// ~1600 products): "group"/Тип товару is CONSTANT ("Одяг" on every single
// row for this vertical) — it's the template's top-level classifier rung,
// not a per-product value. "good_type"/Вид товара is what actually varies
// (18 real values: Джинси, Штани, Сукні…) and is the true equivalent of our
// `category` field. An earlier version of this map pointed `category` at
// "group" by mistake, which would have silently written the constant "Одяг"
// into every auto-created product's category instead of its real one.
const PRODUCT_SYN: Record<keyof OfferProductInfo, string[]> = {
  name_uk:          ["product_name[uk]", "назва (укр)", "назва (укр.)"],
  name_ru:          ["product_name[ru]", "назва (рос)", "назва (рос.)"],
  description_uk:   ["product_description[uk]", "опис (укр)", "опис (укр.)"],
  description_ru:   ["product_description[ru]", "опис (рос)", "опис (рос.)"],
  brand:            ["brand", "бренд"],
  category:         ["good_type", "вид товара"],
  color:            ["color", "колір"],
  country:          ["country", "країна"],
  gender:           ["gender_sap", "гендер sap"],
  composition_uk:   ["composition[uk]", "склад(укр.)", "склад (укр.)"],
  composition_ru:   ["composition[ru]", "склад(рос.)", "склад (рос.)"],
  material:         ["material", "матеріал верху"],
  subtype:          ["podvid", "підвид"],
};

function offerColumns(cells: string[]): Record<OfferReqKey, number> | null {
  const idx = {} as Record<OfferReqKey, number>;
  (Object.keys(OFFER_SYN) as OfferReqKey[]).forEach((k) => {
    idx[k] = cells.findIndex((c) => OFFER_SYN[k].includes(c));
  });
  // Most real feeds are per-size (fashion), but some categories genuinely have
  // no size (e.g. beauty/cosmetics — Intertop's own agora template for that
  // vertical has no "Розмір" column at all, just article/barcode + qty/price).
  // Accept either: a size column, or at least one other identifying code
  // column alongside price/quantity — size then falls back to a single
  // default "unit" variant (see parseOffers).
  const hasIdentifier = idx.size >= 0 || idx.article >= 0 || idx.external_id >= 0 || idx.factory_article >= 0 || idx.barcode >= 0;
  if (!hasIdentifier) return null;
  if (idx.base_price < 0 && idx.quantity < 0) return null;
  return idx;
}

function productColumns(cells: string[]): Record<keyof OfferProductInfo, number> {
  const idx = {} as Record<keyof OfferProductInfo, number>;
  (Object.keys(PRODUCT_SYN) as (keyof OfferProductInfo)[]).forEach((k) => {
    idx[k] = cells.findIndex((c) => PRODUCT_SYN[k].includes(c));
  });
  return idx;
}

export function parseImport(buf: Buffer, filename: string): Parsed {
  const grid = readGrid(buf, filename);
  const head = grid.slice(0, 12);

  // WP (WooCommerce export): has Type column with variable/variation values.
  for (let i = 0; i < head.length; i++) {
    const cells = (grid[i] ?? []).map(norm);
    if (cells.includes("type") && cells.some((c) => c === "sku" || c === "id") && cells.some((c) => c.includes("attribute"))) {
      const rows = parseWp(grid, i);
      if (rows.length > 0) return { kind: "offers", filename, rows };
    }
  }
  // OFFERS: a header row with size + price/quantity columns. odezda.xlsx has
  // a SECOND header row right under it (machine keys) — check that one too,
  // since either row may carry the labels that actually match our synonyms,
  // and grab descriptive columns from whichever row matches.
  for (let i = 0; i < head.length; i++) {
    const cells = (grid[i] ?? []).map(norm);
    const idx = offerColumns(cells);
    if (idx) {
      const prodIdx = productColumns(cells);
      const altCells = (grid[i + 1] ?? []).map(norm);
      const altProdIdx = productColumns(altCells);
      // Merge: prefer this row's match, fall back to the row right below it.
      (Object.keys(prodIdx) as (keyof OfferProductInfo)[]).forEach((k) => {
        if (prodIdx[k] < 0 && altProdIdx[k] >= 0) prodIdx[k] = altProdIdx[k];
      });
      const dataStart = altCells.some((c) => c === "size" || c === "clother_size" || c === "article") ? i + 2 : i + 1;
      return { kind: "offers", filename, rows: parseOffers(grid, dataStart, idx, prodIdx) };
    }
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
      article: "",
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

  const c = mapping.columns;
  const idx: Record<OfferReqKey, number> = {
    external_id: c.external_id ?? -1, factory_article: c.factory_article ?? -1,
    article: c.article ?? -1, barcode: c.barcode ?? -1, size: c.size ?? -1, offer_code: c.offer_code ?? -1,
    quantity: c.quantity ?? -1, base_price: c.base_price ?? -1, discount_price: c.discount_price ?? -1,
    active: c.active ?? -1,
  };
  const hasIdentifier = idx.size >= 0 || idx.article >= 0 || idx.external_id >= 0 || idx.factory_article >= 0 || idx.barcode >= 0;
  if (!hasIdentifier) return fast;
  return { kind: "offers", filename, rows: parseOffers(grid, mapping.headerRow + 1, idx), ai: true };
}

/** Minimal shape parseImportWithTemplate needs — matches importTemplates.ts's
 *  ImportTemplate & { columns }, kept structural so this file has no import
 *  cycle with importTemplates.ts (which itself doesn't touch stockImport.ts). */
export type StockImportTemplate = {
  header_row: number; data_start_row: number;
  columns: { raw_label: string; property_key: string }[];
};

/**
 * Explicit, admin-defined mapping import (Intertop "Шаблони даних"): instead
 * of guessing columns via OFFER_SYN/PRODUCT_SYN synonyms, match each raw
 * header cell against the template's saved raw_label→property_key pairs.
 * Reuses parseOffers for the actual row-building so a template produces the
 * exact same OfferRow shape as auto-detect.
 */
export function parseImportWithTemplate(buf: Buffer, filename: string, template: StockImportTemplate): Parsed {
  const grid = readGrid(buf, filename);
  const headerRowIdx = Math.max(0, template.header_row - 1);
  const cells = (grid[headerRowIdx] ?? []).map((c) => String(c ?? "").trim());
  const findCol = (label: string): number => {
    const exact = cells.findIndex((c) => c === label);
    if (exact >= 0) return exact;
    const lower = label.toLowerCase();
    return cells.findIndex((c) => c.toLowerCase() === lower);
  };

  const idx = {} as Record<OfferReqKey, number>;
  (Object.keys(OFFER_SYN) as OfferReqKey[]).forEach((k) => { idx[k] = -1; });
  const prodIdx = {} as Record<keyof OfferProductInfo, number>;
  (Object.keys(PRODUCT_SYN) as (keyof OfferProductInfo)[]).forEach((k) => { prodIdx[k] = -1; });

  for (const col of template.columns) {
    const colIdx = findCol(col.raw_label);
    if (colIdx < 0) continue;
    if (col.property_key in idx) idx[col.property_key as OfferReqKey] = colIdx;
    else if (col.property_key in prodIdx) prodIdx[col.property_key as keyof OfferProductInfo] = colIdx;
  }

  const dataStart = Math.max(headerRowIdx + 1, template.data_start_row - 1);
  return { kind: "offers", filename, rows: parseOffers(grid, dataStart, idx, prodIdx) };
}

function parseOffers(
  grid: unknown[][], from: number, idx: Record<OfferReqKey, number>,
  prodIdx?: Record<keyof OfferProductInfo, number>,
): OfferRow[] {
  const at = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: OfferRow[] = [];
  for (let i = from; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const rawSize = at(r, idx.size);
    const ext = at(r, idx.external_id);
    const fa = at(r, idx.factory_article);
    const art = at(r, idx.article);
    const offer = at(r, idx.offer_code);
    const bc = at(r, idx.barcode);
    if (!rawSize && !ext && !fa && !art && !offer && !bc) continue; // blank line
    // Skip a possible second machine-key header row (e.g. odezda template).
    if (norm(rawSize) === "size" || norm(rawSize) === "clother_size") continue;
    // No size column at all (e.g. beauty/cosmetics — no per-size variants) ⇒
    // one row is the whole product, filed as a single "unit" variant.
    const size = rawSize || (idx.size < 0 ? "ОД" : rawSize);
    const activeRaw = idx.active >= 0 ? norm(at(r, idx.active)) : "";
    const active = activeRaw ? /^(1|так|yes|true|\+|активн)/i.test(activeRaw) : undefined;

    let product: OfferProductInfo | undefined;
    if (prodIdx) {
      const nameUk = at(r, prodIdx.name_uk);
      const nameRu = at(r, prodIdx.name_ru);
      if (nameUk || nameRu) {
        product = {
          name_uk: nameUk || undefined, name_ru: nameRu || undefined,
          description_uk: at(r, prodIdx.description_uk) || undefined,
          description_ru: at(r, prodIdx.description_ru) || undefined,
          brand: at(r, prodIdx.brand) || undefined,
          category: at(r, prodIdx.category) || undefined,
          color: at(r, prodIdx.color) || undefined,
          country: at(r, prodIdx.country) || undefined,
          gender: genderFromType(at(r, prodIdx.gender)) || undefined,
          composition_uk: at(r, prodIdx.composition_uk) || undefined,
          composition_ru: at(r, prodIdx.composition_ru) || undefined,
          material: at(r, prodIdx.material) || undefined,
          subtype: at(r, prodIdx.subtype) || undefined,
        };
      }
    }

    rows.push({
      external_id: ext, factory_article: fa, article: art, barcode: bc, size,
      offer_code: offer, active,
      quantity: idx.quantity >= 0 && String(r[idx.quantity] ?? "") !== "" ? Math.max(0, Math.round(num(r[idx.quantity]))) : null,
      base_price: idx.base_price >= 0 ? num(r[idx.base_price]) : 0,
      discount_price: idx.discount_price >= 0 ? num(r[idx.discount_price]) : 0,
      product,
    });
  }
  return rows;
}

/** "Тип" (Женская / Мужская / Детская / Унисекс) → our gender slug — used
 *  when a rich OFFERS row carries a descriptive gender column. */
function genderFromType(raw: string): string {
  const t = norm(raw);
  if (!t) return "";
  if (t.startsWith("жен") || t.startsWith("жін")) return "women";
  if (t.startsWith("муж") || t.startsWith("чол")) return "men";
  if (t.startsWith("дет") || t.startsWith("дит")) return "kids";
  if (t.startsWith("уни") || t.startsWith("уні")) return "unisex";
  return "";
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
  // article ("Артикул" — Intertop's own internal product number) matches the
  // same products.sku column external_id does; merged into one lookup.
  const externalIds = [...new Set(rows.flatMap((r) => [r.external_id, r.article]).filter(Boolean))];
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
    (r.article && skuMap.get(r.article)) ||
    (r.factory_article && faMap.get(r.factory_article)) ||
    (r.external_id && skuMap.get(r.external_id)) || null;
  return target;
}

/** Stable per-product grouping key for OFFERS rows — prefer factory_article
 *  (shared across every size of one product in the odezda template), fall
 *  back to external_id, then offer_code. Empty string ⇒ ungroupable. */
function offerGroupKey(r: OfferRow): string {
  return r.article || r.factory_article || r.external_id || r.offer_code || "";
}

/**
 * Split unmatched OFFERS rows into "will auto-create a product" (grouped by
 * product so 3 size-rows of one new item make ONE product, not three) vs.
 * "genuinely unmatched" (no product name to create anything from). Shared by
 * previewImport and applyImport so the preview's counts match what apply
 * actually does.
 */
function groupNewProductRows(unmatchedRows: OfferRow[]): {
  toCreate: Map<string, { product: OfferProductInfo; rows: OfferRow[] }>;
  stillUnmatched: OfferRow[];
} {
  const toCreate = new Map<string, { product: OfferProductInfo; rows: OfferRow[] }>();
  const stillUnmatched: OfferRow[] = [];
  for (const r of unmatchedRows) {
    const key = offerGroupKey(r);
    if (!key || !r.product) { stillUnmatched.push(r); continue; }
    let g = toCreate.get(key);
    if (!g) { g = { product: r.product, rows: [] }; toCreate.set(key, g); }
    g.rows.push(r);
  }
  return { toCreate, stillUnmatched };
}

/**
 * Guide 2.2 §4 "Статус": a file row with every required (red) field filled
 * goes straight to На модерації (moderation_status='pending') for an admin
 * to confirm; missing even one lands in Чернетка instead. The red/yellow
 * split here is taken verbatim from a real odezda.xlsx cell-fill audit
 * (2026-07-10): red = Артикул, Заводський артикул, Штрихкод, Активність,
 * Кількість, Категорія, Базова/Акційна ціна, Назва(укр/рос), Опис(укр/рос),
 * Розмір, Тип товару, Вид товара, Бренд, Гендер SAP, Матеріал верху, Колір,
 * Країна — everything else (Модель, Стиль, Технологія, packaging dims…) is
 * yellow/optional, and in fact 0% filled even in Intertop's own real file
 * for this vertical, so it's not required here either. The offer-row-level
 * red fields (article/factory_article/barcode/active/quantity/size/price)
 * are already enforced structurally by offerColumns()'s parse gate before a
 * row ever reaches this function — only the PRODUCT-level red fields need
 * checking here.
 */
function isCompleteForModeration(product: OfferProductInfo, sample: OfferRow): boolean {
  const hasPrice = sample.base_price > 0 || sample.discount_price > 0;
  return !!product.name_uk?.trim() && !!product.name_ru?.trim()
    && !!product.description_uk?.trim() && !!product.description_ru?.trim()
    && !!product.brand?.trim() && !!product.category?.trim() && !!product.gender?.trim()
    && !!product.material?.trim() && !!product.color?.trim() && !!product.country?.trim()
    && hasPrice;
}

/**
 * Create a new product from a rich OFFERS row group (odezda-style file) whose
 * factory_article/external_id/offer_code matched nothing in the catalogue.
 * Uses the high-range id convention (see lib/products.ts ADMIN_ID_FLOOR) so
 * auto-created rows never collide with imported WC ids. Stock/price for each
 * size is seeded right after via the normal upsertVariantStock call, same as
 * any other OFFERS row.
 */
async function createProductFromOffer(
  client: import("pg").PoolClient, key: string, product: OfferProductInfo, sample: OfferRow,
): Promise<number> {
  // Our `name`/`description` columns are Russian-language content (see
  // pg.ts's name_uk/description_uk comment) — a real odezda row has both
  // languages, so this now actually populates the uk columns too instead of
  // discarding whichever language wasn't picked for the single `name` field.
  const name = product.name_ru || product.name_uk || key;
  const idRow = await client.query<{ next: string }>(
    "SELECT (GREATEST(COALESCE(MAX(id),0), 900000000) + 1)::text AS next FROM products",
  );
  const id = Number(idRow.rows[0].next);
  const slugBase = slugifyText(name);
  const slug = slugBase ? `${slugBase}-${id}` : String(id);
  const category = product.category || "";
  const categorySlug = category ? slugifyText(category) : "";
  const price = sample.discount_price > 0 && sample.discount_price < sample.base_price ? sample.discount_price : sample.base_price;
  const moderationStatus = isCompleteForModeration(product, sample) ? "pending" : "draft";

  const ins = await client.query<{ id: string }>(
    `INSERT INTO products
       (id, sku, factory_article, name, name_uk, slug, brand, category, category_slug, gender,
        price, regular_price, sale_price, is_in_stock, status, moderation_status,
        description, description_uk, composition, color, country, material, subtype)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT (id) DO NOTHING
     RETURNING id::text`,
    [
      id, sample.article || sample.external_id || "", sample.factory_article || key, name, product.name_uk || "", slug,
      product.brand || "Mania Group", category, categorySlug, product.gender || "",
      price, sample.base_price || 0, sample.discount_price > 0 && sample.discount_price < sample.base_price ? sample.discount_price : null,
      false, moderationStatus, product.description_ru || "", product.description_uk || "",
      product.composition_uk || product.composition_ru || "", product.color || "", product.country || "",
      product.material || "", product.subtype || "",
    ],
  );
  return ins.rows.length ? Number(ins.rows[0].id) : id;
}

export async function previewImport(parsed: Parsed): Promise<ImportPreview> {
  const base: ImportPreview = {
    kind: parsed.kind, filename: parsed.filename, totalRows: parsed.rows.length,
    matchedRows: 0, unmatchedRows: 0, affectedProducts: 0, newProducts: 0, newVariants: 0,
    stockChanges: 0, priceChanges: 0, items: [], unmatched: [], sample: [], unmatchedSample: [],
  };
  if (parsed.kind === "unknown" || parsed.rows.length === 0) return base;

  const rows = parsed.rows;
  const target = await resolveOfferTargets(rows);
  const matched = rows.map((r) => ({ r, pid: target(r) }));
  const ids = [...new Set(matched.map((m) => m.pid).filter((x): x is number => !!x))];
  const { byId, variantsByProduct } = await loadProducts(ids);
  const affected = new Set<number>();

  // Rows that resolved to nothing but carry enough product data get grouped
  // into "will auto-create" instead of dumped in `unmatched` — see
  // groupNewProductRows. Everything else is genuinely unmatched.
  const { toCreate, stillUnmatched } = groupNewProductRows(matched.filter((m) => !m.pid).map((m) => m.r));
  base.newProducts = toCreate.size;
  for (const [key, g] of toCreate) {
    const name = g.product.name_uk || g.product.name_ru || key;
    const willModerate = isCompleteForModeration(g.product, g.rows[0]);
    base.matchedRows += g.rows.length;
    base.newVariants += g.rows.length;
    if (base.items.length < 120) base.items.push({
      name, sku: g.rows[0].external_id || undefined, size: g.rows.map((r) => r.size).join(", "),
      oldQty: null, newQty: g.rows.reduce((s, r) => s + (r.quantity ?? 0), 0),
      oldPrice: null, newPrice: g.rows[0].base_price || null, discountPrice: g.rows[0].discount_price || null,
      isNew: true, moderationNote: willModerate ? "pending" : "draft",
    });
    if (base.sample.length < 12) base.sample.push({
      name, detail: `новий товар · ${g.rows.length} розм. · ${g.product.brand || "—"} · ${willModerate ? "На модерації" : "Чернетка (не вистачає полів)"}`,
    });
  }
  for (const r of stillUnmatched) {
    base.unmatchedRows++;
    const ukey = r.article || r.factory_article || r.offer_code || r.external_id || r.barcode;
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
  }

  for (const { r, pid } of matched) {
    if (!pid) continue; // handled above (auto-create group or stillUnmatched)
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

    const rows = parsed.rows;
    const target = await resolveOfferTargets(rows);
    const targets = new Map<OfferRow, number | null>(rows.map((r) => [r, target(r)]));

    // Rows resolving to nothing but carrying product data (odezda-style)
    // get grouped into ONE new product per group (see groupNewProductRows),
    // instead of N duplicate products for N sizes of the same new item.
    const { toCreate, stillUnmatched } = groupNewProductRows(rows.filter((r) => !targets.get(r)));
    for (const [key, g] of toCreate) {
      const pid = await createProductFromOffer(client, key, g.product, g.rows[0]);
      res.productsCreated++;
      for (const r of g.rows) targets.set(r, pid);
    }
    for (const r of stillUnmatched) res.unmatchedRows++;

    for (const r of rows) {
      const pid = targets.get(r);
      if (!pid) continue; // counted in stillUnmatched above
      res.matchedRows++; affected.add(pid);
      const sale = r.discount_price > 0 && (!r.base_price || r.discount_price < r.base_price) ? r.discount_price : null;
      res.stockMovements += await upsertVariantStock(
        client, pid, r.size, r.quantity, r.base_price > 0 ? r.base_price : null, sale,
        { barcode: r.barcode || undefined, offer_code: r.offer_code || undefined, active: r.active },
        importNote,
      );
      res.variantsUpserted++;
      // backfill factory_article on the product if we have it and it's empty
      if (r.factory_article) {
        await client.query("UPDATE products SET factory_article = $2 WHERE id = $1 AND factory_article = ''", [pid, r.factory_article]);
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

const slugifyText = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-+|-+$/g, "");

/**
 * Upsert one (product, size) variant: set price/sale/barcode/offer_code when
 * provided, and set the absolute stock when `qty` is non-null (logging an
 * 'import' movement for the delta). Returns 1 if a movement was logged, else 0.
 */
async function upsertVariantStock(
  client: import("pg").PoolClient,
  productId: number, size: string, qty: number | null,
  price: number | null, sale?: number | null,
  meta?: { barcode?: string; offer_code?: string; active?: boolean },
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
  if (meta?.active !== undefined) add("active", meta.active);
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
