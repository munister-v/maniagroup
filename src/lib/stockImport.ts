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
import { loadValueListMaps } from "./valueLists";

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
  /** Raw "Розмір одягу"/clother_size column value, kept separate from the
   *  resolved `size` used for the actual variant — see OFFER_SYN comment.
   *  Currently informational only; product_variants has one `size` column. */
  clother_size?: string;
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

/**
 * Supplier spreadsheets rarely keep header spelling stable: spaces become
 * underscores, dots appear after abbreviations, and Ukrainian/Russian labels
 * are mixed in the same export. Keep value normalization conservative, but
 * compare headers through one punctuation-insensitive representation.
 */
const headerNorm = (v: unknown) => norm(v)
  .replace(/[’']/g, "")
  .replace(/[.\-\/\\]+/g, " ")
  .replace(/[()[\]{}]/g, " ")
  .replace(/\s+/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_|_$/g, "");

const headerMatches = (cell: string, aliases: string[]) =>
  aliases.some((alias) => cell === headerNorm(alias));

function num(v: unknown): number {
  let raw = String(v ?? "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    raw = raw.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    const digitsAfter = raw.length - comma - 1;
    raw = digitsAfter === 3 && raw.indexOf(",") === comma
      ? raw.replace(",", "")
      : raw.replace(",", ".");
  } else if (dot >= 0) {
    const digitsAfter = raw.length - dot - 1;
    if (digitsAfter === 3 && raw.indexOf(".") === dot) raw = raw.replace(".", "");
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function readGrids(buf: Buffer, filename: string): unknown[][][] {
  const isXls = /\.xls$/i.test(filename);
  // Strip a leading UTF-8 BOM (EF BB BF). SheetJS with codepage 65001 mishandles
  // it on CSVs and eats the first 2 chars of cell 0 ("external_Id" → "ternal_Id"),
  // so that column silently parses as empty — which broke SKU matching.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.subarray(3);
  }
  const wb = XLSX.read(buf, { type: "buffer", codepage: isXls ? 1251 : 65001 });
  return wb.SheetNames.map((name) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", blankrows: false }),
  ).filter((grid) => grid.length > 0);
}

export function readGrid(buf: Buffer, filename: string): unknown[][] {
  return readGrids(buf, filename)[0] ?? [];
}

// Column synonyms for the OFFERS format's required fields (machine keys +
// Ukrainian labels). "Артикул"/article is deliberately kept separate from
// "Заводський артикул"/factory_article — in the odezda (fashion) template
// those two happened to be identical so we dropped article as redundant, but
// the full Intertop agora export (e.g. the beauty-category template) carries
// them as genuinely distinct columns: article is Intertop's own internal
// product number, factory_article is the supplier's code. See offer_code
// (mp-code) vs barcode (real per-offer key) — four separate identifiers.
// "Розмір"/size and "Розмір одягу"/clother_size are ALSO genuinely distinct
// properties in Intertop's real system (confirmed via real template
// screenshots — separate raw column labels, separate property IDs in their
// Зіставлення властивостей screen), not synonyms as this map used to treat
// them. Kept as two separate keys so a file carrying BOTH columns doesn't
// have one silently shadow the other via findIndex column-order luck, and
// so an explicit import template (see importTemplates.ts PROPERTY_LIST) can
// map+translate them independently (e.g. via different value lists). They
// still resolve to the SAME product_variants.size column at write time —
// see parseOffers's `size` resolution below — since that's the only column
// we actually store it in.
type OfferReqKey = Exclude<keyof OfferRow, "product">;
const OFFER_SYN: Record<OfferReqKey, string[]> = {
  external_id:     ["external_id", "external id", "код товару", "код продукта", "product id", "external_code", "id товару"],
  factory_article: ["factory_article", "factory article", "заводський артикул", "заводской артикул", "артикул постачальника", "артикул поставщика", "vendor code"],
  article:         ["article", "sku", "артикул", "код моделі", "код модели", "model code"],
  barcode:         ["barcode", "штрихкод", "штрих код", "ean", "ean13", "gtin"],
  size:            ["size", "розмір", "размер", "розмір товару", "размер товара", "sku size"],
  clother_size:    ["clother_size", "clother size", "розмір одягу", "размер одежды"],
  offer_code:      ["offer_code", "offer code", "код оферу", "код оффера", "код пропозиції", "код предложения", "sku пропозиції"],
  quantity:        ["quantity", "кількість", "количество", "наявність", "остаток", "залишок", "stock", "stock qty", "qty"],
  base_price:      ["base_price", "base price", "базова ціна", "базовая цена", "ціна", "цена", "regular price", "price"],
  discount_price:  ["discount_price", "discount price", "акційна ціна", "акционная цена", "ціна зі знижкою", "sale price", "promo price"],
  active:          ["active", "активність", "активность", "enabled", "status"],
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
  name_uk:          ["product_name[uk]", "product name uk", "назва (укр)", "назва товару", "название укр"],
  name_ru:          ["product_name[ru]", "product name ru", "назва (рос)", "название товара", "название рус"],
  description_uk:   ["product_description[uk]", "description uk", "опис (укр)", "опис товару"],
  description_ru:   ["product_description[ru]", "description ru", "опис (рос)", "описание товара"],
  brand:            ["brand", "бренд", "виробник", "производитель"],
  category:         ["good_type", "вид товара", "категорія", "категория", "product type"],
  color:            ["color", "колір", "цвет"],
  country:          ["country", "країна", "страна", "country of origin"],
  gender:           ["gender_sap", "gender sap", "гендер sap", "стать", "пол", "gender"],
  composition_uk:   ["composition[uk]", "склад(укр.)", "склад (укр.)"],
  composition_ru:   ["composition[ru]", "склад(рос.)", "склад (рос.)"],
  material:         ["material", "матеріал верху", "материал верха"],
  subtype:          ["podvid", "підвид", "подвид"],
};

function offerColumns(cells: string[]): Record<OfferReqKey, number> | null {
  const idx = {} as Record<OfferReqKey, number>;
  (Object.keys(OFFER_SYN) as OfferReqKey[]).forEach((k) => {
    idx[k] = cells.findIndex((c) => headerMatches(c, OFFER_SYN[k]));
  });
  // Most real feeds are per-size (fashion), but some categories genuinely have
  // no size (e.g. beauty/cosmetics — Intertop's own agora template for that
  // vertical has no "Розмір" column at all, just article/barcode + qty/price).
  // Accept either: a size column, or at least one other identifying code
  // column alongside price/quantity — size then falls back to a single
  // default "unit" variant (see parseOffers).
  const hasIdentifier = idx.size >= 0 || idx.clother_size >= 0 || idx.article >= 0 || idx.external_id >= 0 || idx.factory_article >= 0 || idx.barcode >= 0;
  if (!hasIdentifier) return null;
  if (idx.base_price < 0 && idx.quantity < 0) return null;
  return idx;
}

function productColumns(cells: string[]): Record<keyof OfferProductInfo, number> {
  const idx = {} as Record<keyof OfferProductInfo, number>;
  (Object.keys(PRODUCT_SYN) as (keyof OfferProductInfo)[]).forEach((k) => {
    idx[k] = cells.findIndex((c) => headerMatches(c, PRODUCT_SYN[k]));
  });
  return idx;
}

// Guide 2.8's XML price/stock feed: <catalog created_at="…"><offers><offer>
// article/barcode/sku_size/sku/quantity/base_price/discount_price</offer>…
// </offers></catalog>. Detected before handing the buffer to SheetJS, which
// would otherwise choke trying to read XML text as a spreadsheet.
function looksLikeXml(buf: Buffer, filename: string): boolean {
  if (/\.xml$/i.test(filename)) return true;
  const head = buf.subarray(0, 200).toString("utf8").trimStart();
  return head.startsWith("<?xml") || /^<catalog[\s>]/i.test(head);
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return XML_ENTITIES[ent.toLowerCase()] ?? m;
  });
}

/**
 * The guide's <offer> field set is flat (no nesting, order-independent per
 * the guide's own note) — a bounded regex over each <offer>…</offer> block
 * is enough and avoids adding an XML-parsing dependency for this one, simple,
 * well-documented shape. Intertop's own "sku" tag here means "Код Торгової
 * пропозиції" (their offer/mp-code) — maps to our offer_code, NOT our
 * internal products.sku — matching resolveOfferTargets' own priority order
 * (offer_code → barcode → article → factory_article).
 */
export function parseXmlOffers(text: string): OfferRow[] {
  const rows: OfferRow[] = [];
  const offerBlocks = text.match(/<offer\b[^>]*>[\s\S]*?<\/offer>/gi) ?? [];
  for (const block of offerBlocks) {
    const tag = (name: string): string => {
      const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
      return m ? decodeXmlEntities(m[1].trim()) : "";
    };
    const article = tag("article");
    const barcode = tag("barcode");
    const size = tag("sku_size");
    const offerCode = tag("sku");
    if (!article && !barcode && !offerCode) continue; // no identifier at all — unusable row
    const quantityRaw = tag("quantity");
    rows.push({
      external_id: "", factory_article: "", barcode, size, offer_code: offerCode,
      quantity: quantityRaw !== "" ? Math.max(0, Math.round(num(quantityRaw))) : null,
      base_price: num(tag("base_price")), discount_price: num(tag("discount_price")), article,
    });
  }
  return rows;
}

/**
 * The <catalog created_at="…"> attribute — guide 2.8: if this value hasn't
 * changed since the last successful fetch of this same feed, the update is
 * skipped entirely (the supplier didn't actually regenerate the file).
 * Exported for lib/importSources.ts's runImportSource to compare against
 * import_sources.last_feed_created_at before bothering to parse/apply.
 */
export function extractXmlCreatedAt(text: string): string | null {
  const m = text.match(/<catalog\b[^>]*\bcreated_at\s*=\s*"([^"]*)"/i);
  return m ? m[1] : null;
}

export function parseImport(buf: Buffer, filename: string): Parsed {
  if (looksLikeXml(buf, filename)) {
    const rows = parseXmlOffers(buf.toString("utf8"));
    return rows.length > 0 ? { kind: "offers", filename, rows } : { kind: "unknown", filename, rows: [] };
  }
  const grids = readGrids(buf, filename);

  // Check every sheet. Supplier workbooks often open on an instruction/cover
  // sheet while the real table lives on sheet 2 or 3. Forty leading rows are
  // enough for branded report headers without scanning an entire workbook.
  for (const grid of grids) {
    const head = grid.slice(0, 40);

    // WP (WooCommerce export): has Type column with variable/variation values.
    for (let i = 0; i < head.length; i++) {
      const cells = (grid[i] ?? []).map(headerNorm);
      if (cells.includes("type") && cells.some((c) => c === "sku" || c === "id") && cells.some((c) => c.includes("attribute"))) {
        const rows = parseWp(grid, i);
        if (rows.length > 0) return { kind: "offers", filename, rows };
      }
    }

    // OFFERS: a header row with an identifier + price/quantity columns.
    for (let i = 0; i < head.length; i++) {
      const cells = (grid[i] ?? []).map(headerNorm);
      const idx = offerColumns(cells);
      if (idx) {
        const prodIdx = productColumns(cells);
        const altCells = (grid[i + 1] ?? []).map(headerNorm);
        const altProdIdx = productColumns(altCells);
        // Merge: prefer this row's match, fall back to the row right below it.
        (Object.keys(prodIdx) as (keyof OfferProductInfo)[]).forEach((k) => {
          if (prodIdx[k] < 0 && altProdIdx[k] >= 0) prodIdx[k] = altProdIdx[k];
        });
        const machineHeaders = ["size", "clother_size", "article", "factory_article", "quantity", "base_price"];
        const dataStart = altCells.some((c) => machineHeaders.includes(c)) ? i + 2 : i + 1;
        const rows = parseOffers(grid, dataStart, idx, prodIdx);
        if (rows.length > 0) return { kind: "offers", filename, rows };
      }
    }
  }
  return { kind: "unknown", filename, rows: [] };
}

/** Parse WooCommerce product export (variable/variation rows) into OfferRow[]. */
function parseWp(grid: unknown[][], headerRow: number): OfferRow[] {
  const cells = (grid[headerRow] ?? []).map(headerNorm);
  const ci = (names: string[]) => cells.findIndex((c) => names.some((n) => c === headerNorm(n)));
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

  const grids = readGrids(buf, filename);
  // If deterministic recognition failed, give AI the sheet most likely to be
  // a data table rather than blindly passing the workbook's cover sheet.
  const grid = grids.sort((a, b) => {
    const score = (g: unknown[][]) => g.slice(0, 40).reduce((best, row) => Math.max(best, row.filter((v) => String(v ?? "").trim()).length), 0) * Math.min(g.length, 5000);
    return score(b) - score(a);
  })[0] ?? [];
  const mapping = await aiDetectImport(grid);
  if (!mapping) return fast;

  const c = mapping.columns;
  const idx: Record<OfferReqKey, number> = {
    external_id: c.external_id ?? -1, factory_article: c.factory_article ?? -1,
    article: c.article ?? -1, barcode: c.barcode ?? -1, size: c.size ?? -1, clother_size: c.clother_size ?? -1,
    offer_code: c.offer_code ?? -1,
    quantity: c.quantity ?? -1, base_price: c.base_price ?? -1, discount_price: c.discount_price ?? -1,
    active: c.active ?? -1,
  };
  const hasIdentifier = idx.size >= 0 || idx.clother_size >= 0 || idx.article >= 0 || idx.external_id >= 0 || idx.factory_article >= 0 || idx.barcode >= 0;
  if (!hasIdentifier) return fast;
  return { kind: "offers", filename, rows: parseOffers(grid, mapping.headerRow + 1, idx), ai: true };
}

/** Minimal shape parseImportWithTemplate needs — matches importTemplates.ts's
 *  ImportTemplate & { columns }, kept structural so this file has no import
 *  cycle with importTemplates.ts (which itself doesn't touch stockImport.ts). */
export type StockImportTemplate = {
  header_row: number; data_start_row: number;
  columns: { raw_label: string; property_key: string; value_list_id?: string | null }[];
};

/**
 * Explicit, admin-defined mapping import (Intertop "Шаблони даних"): instead
 * of guessing columns via OFFER_SYN/PRODUCT_SYN synonyms, match each raw
 * header cell against the template's saved raw_label→property_key pairs.
 * Reuses parseOffers for the actual row-building so a template produces the
 * exact same OfferRow shape as auto-detect. A column that references a value
 * list (Intertop 2.9 "Зіставлення властивостей") gets its matched cells
 * translated raw→canonical (case-insensitive; unmatched cells pass through
 * unchanged) before rows are built.
 */
export async function parseImportWithTemplate(buf: Buffer, filename: string, template: StockImportTemplate): Promise<Parsed> {
  const headerRowIdx = Math.max(0, template.header_row - 1);
  const grids = readGrids(buf, filename);
  // Prefer the sheet where the saved template labels actually exist. This
  // keeps templates working when suppliers prepend a cover sheet later.
  const grid = grids.sort((a, b) => {
    const labels = template.columns.map((c) => headerNorm(c.raw_label));
    const score = (g: unknown[][]) => (g[headerRowIdx] ?? []).map(headerNorm).filter((c) => labels.includes(c)).length;
    return score(b) - score(a);
  })[0] ?? [];
  const cells = (grid[headerRowIdx] ?? []).map((c) => String(c ?? "").trim());
  const findCol = (label: string): number => {
    const normalized = headerNorm(label);
    return cells.findIndex((c) => headerNorm(c) === normalized);
  };

  const idx = {} as Record<OfferReqKey, number>;
  (Object.keys(OFFER_SYN) as OfferReqKey[]).forEach((k) => { idx[k] = -1; });
  const prodIdx = {} as Record<keyof OfferProductInfo, number>;
  (Object.keys(PRODUCT_SYN) as (keyof OfferProductInfo)[]).forEach((k) => { prodIdx[k] = -1; });

  const valueListByColIdx = new Map<number, string>();
  for (const col of template.columns) {
    const colIdx = findCol(col.raw_label);
    if (colIdx < 0) continue;
    if (col.property_key in idx) idx[col.property_key as OfferReqKey] = colIdx;
    else if (col.property_key in prodIdx) prodIdx[col.property_key as keyof OfferProductInfo] = colIdx;
    if (col.value_list_id) valueListByColIdx.set(colIdx, col.value_list_id);
  }

  const dataStart = Math.max(headerRowIdx + 1, template.data_start_row - 1);

  if (valueListByColIdx.size > 0) {
    const maps = await loadValueListMaps([...new Set(valueListByColIdx.values())]);
    for (let i = dataStart; i < grid.length; i++) {
      const row = grid[i];
      if (!row) continue;
      for (const [colIdx, listId] of valueListByColIdx) {
        const map = maps.get(listId);
        if (!map) continue;
        const raw = String(row[colIdx] ?? "").trim();
        const canon = map.get(raw.toLowerCase());
        if (canon !== undefined) row[colIdx] = canon;
      }
    }
  }

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
    const rawClotherSize = at(r, idx.clother_size);
    const ext = at(r, idx.external_id);
    const fa = at(r, idx.factory_article);
    const art = at(r, idx.article);
    const offer = at(r, idx.offer_code);
    const bc = at(r, idx.barcode);
    if (!rawSize && !rawClotherSize && !ext && !fa && !art && !offer && !bc) continue; // blank line
    // Skip a possible second machine-key header row (e.g. odezda template).
    if (norm(rawSize) === "size" || norm(rawSize) === "clother_size" || norm(rawClotherSize) === "clother_size") continue;
    // No size column at all (e.g. beauty/cosmetics — no per-size variants) ⇒
    // one row is the whole product, filed as a single "unit" variant. Both
    // size and clother_size write to the same product_variants.size column
    // — prefer the generic "Розмір" when a file genuinely has both (rare;
    // no real file seen so far carries both at once), else whichever is
    // present, else the "ОД" unit fallback.
    const size = rawSize || rawClotherSize || (idx.size < 0 && idx.clother_size < 0 ? "ОД" : "");
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
      offer_code: offer, active, clother_size: rawClotherSize || undefined,
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
  /** Rows that can actually affect the selected fields after empty rows and
   * duplicate offer/size records are removed. */
  processedRows: number;
  /** Repeated offer/size rows collapsed before preview and apply. The last
   * row in the supplier file wins, matching spreadsheet expectations. */
  duplicateRows: number;
  /** Rows with neither quantity nor price for the selected import mode. */
  skippedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  affectedProducts: number;
  newProducts: number;
  newVariants: number;
  stockChanges: number;
  priceChanges: number;
  zeroedRows: number;
  items: PreviewItem[];
  unmatched: UnmatchedItem[];
  /** @deprecated kept for old consumers — mirrors first 12 items as text */
  sample: { name: string; size?: string; detail: string }[];
  /** @deprecated kept for old consumers — first 8 unmatched as strings */
  unmatchedSample: string[];
};

export type StockImportMode = "patch" | "snapshot";
export type ImportOptions = {
  stockMode?: StockImportMode;
  sourceId?: number | null;
  sourceName?: string;
  updateStock?: boolean;
  updatePrices?: boolean;
  createMissingProducts?: boolean;
  blankQuantity?: "ignore" | "zero";
};

const wantsStock = (options: ImportOptions) => options.updateStock !== false;
const wantsPrices = (options: ImportOptions) => options.updatePrices !== false;
const effectiveQty = (row: OfferRow, options: ImportOptions): number | null => {
  if (!wantsStock(options)) return null;
  if (row.quantity == null && options.blankQuantity === "zero") return 0;
  return row.quantity;
};

const matchNorm = (value: string) => value.trim().toLocaleLowerCase("uk-UA");
const barcodeNorm = (value: string) => value.trim();

function rowHasSelectedValues(row: OfferRow, options: ImportOptions): boolean {
  const hasStock = wantsStock(options) && effectiveQty(row, options) != null;
  const hasPrice = wantsPrices(options) && (row.base_price > 0 || row.discount_price > 0);
  return hasStock || hasPrice;
}

/**
 * Supplier files often contain the same offer more than once after exports
 * are joined or copied between sheets. Running every duplicate makes the
 * outcome depend on loop order and inflates the preview. Collapse to one
 * actionable row using the strongest variant key available; the last row in
 * the file wins, as it does in most spreadsheet update workflows.
 */
function prepareOfferRows(rows: OfferRow[], options: ImportOptions): {
  rows: OfferRow[]; duplicateRows: number; skippedRows: number;
} {
  const unique = new Map<string, OfferRow>();
  let duplicateRows = 0;
  let skippedRows = 0;

  rows.forEach((row, index) => {
    if (!rowHasSelectedValues(row, options)) {
      skippedRows++;
      return;
    }
    const offerKey = row.offer_code ? `offer:${matchNorm(row.offer_code)}` : "";
    const barcodeKey = row.barcode ? `barcode:${barcodeNorm(row.barcode)}` : "";
    const productKey = row.article || row.factory_article || row.external_id;
    const fallbackKey = productKey
      ? `product:${matchNorm(productKey)}|size:${matchNorm(row.size || "ОД")}`
      : `row:${index}`;
    const key = offerKey || barcodeKey || fallbackKey;
    if (unique.has(key)) duplicateRows++;
    unique.set(key, row);
  });

  return { rows: [...unique.values()], duplicateRows, skippedRows };
}

type SnapshotCandidate = {
  id: number; product_id: string; size: string; stock_qty: number;
  name: string; sku: string; price: number | null;
};

async function loadSnapshotCandidates(
  sourceId: number, affectedProducts: number[], importedVariantIds: number[],
  client?: import("pg").PoolClient,
): Promise<SnapshotCandidate[]> {
  if (!affectedProducts.length && !sourceId) return [];
  const sql = `
    SELECT v.id, v.product_id::text, v.size, v.stock_qty,
           p.name, p.sku, COALESCE(v.price, p.regular_price)::float AS price
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
     WHERE v.active AND v.stock_qty <> 0
       AND NOT (v.id = ANY($3::bigint[]))
       AND (
         v.stock_source_id = $1
         OR (v.product_id = ANY($2::bigint[]) AND (v.stock_source_id IS NULL OR v.stock_source_id = $1))
       )`;
  if (client) {
    const rows = await client.query<SnapshotCandidate>(sql, [sourceId, affectedProducts, importedVariantIds]);
    return rows.rows;
  }
  return q<SnapshotCandidate>(sql, [sourceId, affectedProducts, importedVariantIds]);
}

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
  const factoryArticles = [...new Set(rows.map((r) => matchNorm(r.factory_article)).filter(Boolean))];
  // article ("Артикул" — Intertop's own internal product number) matches the
  // same products.sku column external_id does; merged into one lookup.
  const externalIds = [...new Set(rows.flatMap((r) => [r.external_id, r.article]).map(matchNorm).filter(Boolean))];
  const offerCodes = [...new Set(rows.map((r) => matchNorm(r.offer_code)).filter(Boolean))];
  const barcodes = [...new Set(rows.map((r) => barcodeNorm(r.barcode)).filter(Boolean))];

  const faMap = new Map<string, number>();
  const skuMap = new Map<string, number>();
  const offerMap = new Map<string, number>(); // offer_code → product_id
  const barcodeMap = new Map<string, number>();

  if (factoryArticles.length) {
    for (const p of await q<{ id: string; factory_article: string }>(
      "SELECT id::text, factory_article FROM products WHERE lower(btrim(factory_article)) = ANY($1::text[]) AND btrim(factory_article) <> ''", [factoryArticles]))
      faMap.set(matchNorm(p.factory_article), Number(p.id));
  }
  if (externalIds.length) {
    for (const p of await q<{ id: string; sku: string }>(
      "SELECT id::text, sku FROM products WHERE lower(btrim(sku)) = ANY($1::text[]) AND btrim(sku) <> ''", [externalIds]))
      skuMap.set(matchNorm(p.sku), Number(p.id));
  }
  if (offerCodes.length) {
    for (const v of await q<{ product_id: string; offer_code: string }>(
      "SELECT product_id::text, offer_code FROM product_variants WHERE lower(btrim(offer_code)) = ANY($1::text[]) AND btrim(offer_code) <> ''", [offerCodes]))
      offerMap.set(matchNorm(v.offer_code), Number(v.product_id));
  }
  if (barcodes.length) {
    for (const v of await q<{ product_id: string; barcode: string }>(
      "SELECT product_id::text, barcode FROM product_variants WHERE btrim(barcode) = ANY($1::text[]) AND btrim(barcode) <> ''", [barcodes]))
      barcodeMap.set(barcodeNorm(v.barcode), Number(v.product_id));
  }
  const target = (r: OfferRow): number | null =>
    (r.offer_code && offerMap.get(matchNorm(r.offer_code))) ||
    (r.barcode && barcodeMap.get(barcodeNorm(r.barcode))) ||
    (r.article && skuMap.get(matchNorm(r.article))) ||
    (r.factory_article && faMap.get(matchNorm(r.factory_article))) ||
    (r.external_id && skuMap.get(matchNorm(r.external_id))) || null;
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

export async function previewImport(parsed: Parsed, options: ImportOptions = {}): Promise<ImportPreview> {
  const base: ImportPreview = {
    kind: parsed.kind, filename: parsed.filename, totalRows: parsed.rows.length,
    processedRows: 0, duplicateRows: 0, skippedRows: 0,
    matchedRows: 0, unmatchedRows: 0, affectedProducts: 0, newProducts: 0, newVariants: 0,
    stockChanges: 0, priceChanges: 0, zeroedRows: 0, items: [], unmatched: [], sample: [], unmatchedSample: [],
  };
  if (parsed.kind === "unknown" || parsed.rows.length === 0) return base;

  const prepared = prepareOfferRows(parsed.rows, options);
  const rows = prepared.rows;
  base.processedRows = rows.length;
  base.duplicateRows = prepared.duplicateRows;
  base.skippedRows = prepared.skippedRows;
  const target = await resolveOfferTargets(rows);
  const matched = rows.map((r) => ({ r, pid: target(r) }));
  const ids = [...new Set(matched.map((m) => m.pid).filter((x): x is number => !!x))];
  const { byId, variantsByProduct } = await loadProducts(ids);
  const affected = new Set<number>();
  const importedVariantIds = new Set<number>();

  // Rows that resolved to nothing but carry enough product data get grouped
  // into "will auto-create" instead of dumped in `unmatched` — see
  // groupNewProductRows. Everything else is genuinely unmatched.
  const grouped = groupNewProductRows(matched.filter((m) => !m.pid).map((m) => m.r));
  const toCreate = options.createMissingProducts === false
    ? new Map<string, { product: OfferProductInfo; rows: OfferRow[] }>()
    : grouped.toCreate;
  const stillUnmatched = options.createMissingProducts === false
    ? [...grouped.stillUnmatched, ...[...grouped.toCreate.values()].flatMap((g) => g.rows)]
    : grouped.stillUnmatched;
  base.newProducts = toCreate.size;
  for (const [key, g] of toCreate) {
    const name = g.product.name_uk || g.product.name_ru || key;
    const willModerate = isCompleteForModeration(g.product, g.rows[0]);
    base.matchedRows += g.rows.length;
    base.newVariants += g.rows.length;
    if (base.items.length < 120) base.items.push({
      name, sku: g.rows[0].external_id || undefined, size: g.rows.map((r) => r.size).join(", "),
      oldQty: null, newQty: wantsStock(options) ? g.rows.reduce((s, r) => s + (effectiveQty(r, options) ?? 0), 0) : null,
      oldPrice: null, newPrice: wantsPrices(options) ? g.rows[0].base_price || null : null,
      discountPrice: wantsPrices(options) ? g.rows[0].discount_price || null : null,
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
    if (v) importedVariantIds.add(Number(v.id));
    if (!v) base.newVariants++;
    const rowQty = effectiveQty(r, options);
    if (rowQty != null && (!v || v.stock_qty !== rowQty)) base.stockChanges++;
    const curPrice = v?.price ?? Number(p?.regular_price ?? 0);
    if (wantsPrices(options) && r.base_price > 0 && Math.abs(r.base_price - (curPrice || 0)) > 1) base.priceChanges++;
    if (base.items.length < 120) {
      base.items.push({
        name: p?.name ?? String(pid), sku: p?.sku,
        size: r.size,
        oldQty: v ? v.stock_qty : null,
        newQty: rowQty,
        oldPrice: curPrice || null,
        newPrice: wantsPrices(options) && r.base_price > 0 ? r.base_price : null,
        discountPrice: wantsPrices(options) && r.discount_price > 0 ? r.discount_price : null,
        isNew: !v,
      });
    }
    if (base.sample.length < 12) base.sample.push({
      name: p?.name ?? String(pid), size: r.size,
      detail: `${wantsPrices(options) && r.base_price > 0 ? `${Math.round(r.base_price)}₴` : ""}${wantsPrices(options) && r.discount_price > 0 ? ` (акц. ${Math.round(r.discount_price)}₴)` : ""}${rowQty != null ? ` · ${rowQty} од` : ""}`,
    });
  }
  if (wantsStock(options) && options.stockMode === "snapshot" && options.sourceId) {
    const missing = await loadSnapshotCandidates(options.sourceId, [...affected], [...importedVariantIds]);
    base.zeroedRows = missing.length;
    base.stockChanges += missing.length;
    for (const v of missing) {
      affected.add(Number(v.product_id));
      if (base.items.length < 120) base.items.push({
        name: v.name, sku: v.sku, size: v.size,
        oldQty: Number(v.stock_qty), newQty: 0,
        oldPrice: v.price, newPrice: null, discountPrice: null, isNew: false,
      });
      if (base.sample.length < 12) base.sample.push({
        name: v.name, size: v.size, detail: `${v.stock_qty} → 0 од · відсутня у повному файлі`,
      });
    }
  }
  base.affectedProducts = affected.size;
  return base;
}

export type ApplyResult = {
  kind: ImportKind;
  matchedRows: number; unmatchedRows: number;
  productsCreated: number; productsUpdated: number; variantsUpserted: number; stockMovements: number;
  runId: string | null; zeroedRows: number; stockMode: StockImportMode;
};

export async function applyImport(parsed: Parsed, options: ImportOptions = {}): Promise<ApplyResult> {
  const stockMode = options.stockMode ?? "patch";
  if (stockMode === "snapshot" && !options.sourceId) throw new Error("Для повного знімка виберіть джерело даних");
  if (stockMode === "snapshot" && !wantsStock(options)) throw new Error("Повний знімок потребує оновлення залишків");
  if (!wantsStock(options) && !wantsPrices(options)) throw new Error("Виберіть хоча б одне поле для оновлення");
  const res: ApplyResult = {
    kind: parsed.kind, matchedRows: 0, unmatchedRows: 0, productsCreated: 0,
    productsUpdated: 0, variantsUpserted: 0, stockMovements: 0,
    runId: null, zeroedRows: 0, stockMode,
  };
  if (parsed.kind === "unknown" || parsed.rows.length === 0) return res;
  const prepared = prepareOfferRows(parsed.rows, options);
  // Especially important for snapshot mode: an empty/irrelevant file must
  // never be interpreted as "the supplier has zero stock everywhere".
  if (prepared.rows.length === 0) return res;
  const importNote = `Імпорт: ${parsed.filename}`;
  const client = await pool.connect();
  const affected = new Set<number>();
  const importedVariantIds = new Set<number>();
  try {
    await client.query("BEGIN");

    const run = await client.query<{ id: string }>(
      `INSERT INTO inventory_import_runs
         (source_id, source_name, filename, import_kind, stock_mode, total_rows)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
      [options.sourceId ?? null, options.sourceName ?? "", parsed.filename, parsed.kind, stockMode, parsed.rows.length],
    );
    res.runId = run.rows[0].id;

    const rows = prepared.rows;
    const target = await resolveOfferTargets(rows);
    const targets = new Map<OfferRow, number | null>(rows.map((r) => [r, target(r)]));

    // Rows resolving to nothing but carrying product data (odezda-style)
    // get grouped into ONE new product per group (see groupNewProductRows),
    // instead of N duplicate products for N sizes of the same new item.
    const grouped = groupNewProductRows(rows.filter((r) => !targets.get(r)));
    const toCreate = options.createMissingProducts === false
      ? new Map<string, { product: OfferProductInfo; rows: OfferRow[] }>()
      : grouped.toCreate;
    const stillUnmatched = options.createMissingProducts === false
      ? [...grouped.stillUnmatched, ...[...grouped.toCreate.values()].flatMap((g) => g.rows)]
      : grouped.stillUnmatched;
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
      const sale = wantsPrices(options)
        ? (r.discount_price > 0 && (!r.base_price || r.discount_price < r.base_price) ? r.discount_price : null)
        : undefined;
      const changed = await upsertVariantStock(
        client, pid, r.size, effectiveQty(r, options), wantsPrices(options) && r.base_price > 0 ? r.base_price : null, sale,
        {
          barcode: r.barcode || undefined, offer_code: r.offer_code || undefined,
          active: r.active, stock_source_id: wantsStock(options) ? options.sourceId ?? undefined : undefined,
        },
        importNote,
      );
      res.stockMovements += changed.movement;
      if (changed.variantId) importedVariantIds.add(changed.variantId);
      if (changed.quantityChanged && res.runId) {
        await client.query(
          `INSERT INTO inventory_import_items (run_id, product_id, variant_id, size, old_qty, new_qty, reason)
           VALUES ($1,$2,$3,$4,$5,$6,'row')
           ON CONFLICT (run_id, variant_id) DO UPDATE SET new_qty=EXCLUDED.new_qty`,
          [Number(res.runId), pid, changed.variantId, r.size.trim(), changed.before, changed.after],
        );
      }
      res.variantsUpserted++;
      // backfill factory_article on the product if we have it and it's empty
      if (r.factory_article) {
        await client.query("UPDATE products SET factory_article = $2 WHERE id = $1 AND factory_article = ''", [pid, r.factory_article]);
      }
    }

    if (wantsStock(options) && stockMode === "snapshot" && options.sourceId) {
      const missing = await loadSnapshotCandidates(options.sourceId, [...affected], [...importedVariantIds], client);
      for (const v of missing) {
        const pid = Number(v.product_id);
        const before = Number(v.stock_qty);
        await client.query(
          `UPDATE product_variants SET stock_qty=0, stock_source_id=$2,
             updated_at=now(), updated_by='import' WHERE id=$1`,
          [v.id, options.sourceId],
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
           VALUES ($1,$2,$3,'import',$4,0,$5,'import')`,
          [pid, v.id, v.size, -before, `${importNote} · відсутня у повному знімку`],
        );
        if (res.runId) {
          await client.query(
            `INSERT INTO inventory_import_items (run_id, product_id, variant_id, size, old_qty, new_qty, reason)
             VALUES ($1,$2,$3,$4,$5,0,'missing_from_snapshot')
             ON CONFLICT (run_id, variant_id) DO UPDATE SET new_qty=0, reason='missing_from_snapshot'`,
            [Number(res.runId), pid, v.id, v.size, before],
          );
        }
        res.zeroedRows++;
        res.stockMovements++;
        affected.add(pid);
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
    res.productsUpdated = Math.max(0, affected.size - res.productsCreated);
    if (res.runId) {
      await client.query(
        `UPDATE inventory_import_runs SET
           matched_rows=$2, unmatched_rows=$3, changed_rows=$4, zeroed_rows=$5,
           products_created=$6, products_updated=$7, variants_upserted=$8, stock_movements=$9
         WHERE id=$1`,
        [Number(res.runId), res.matchedRows, res.unmatchedRows, res.stockMovements,
         res.zeroedRows, res.productsCreated, res.productsUpdated, res.variantsUpserted, res.stockMovements],
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

export type RollbackResult = { runId: string; restoredVariants: number; affectedProducts: number };

/** Restore a run only while all affected variants still contain the values
 * written by that run. This prevents a rollback from erasing later sales,
 * receipts or manual corrections. */
export async function rollbackImportRun(runId: string): Promise<RollbackResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run = await client.query<{ id: string; status: string; filename: string }>(
      "SELECT id::text, status, filename FROM inventory_import_runs WHERE id=$1 FOR UPDATE", [Number(runId)],
    );
    if (!run.rows.length) throw new Error("Імпорт не знайдено");
    if (run.rows[0].status !== "applied") throw new Error("Цей імпорт уже скасовано");
    const items = await client.query<{
      product_id: string; variant_id: string; size: string;
      old_qty: number; new_qty: number; current_qty: number;
    }>(
      `SELECT i.product_id::text, i.variant_id::text, i.size, i.old_qty, i.new_qty,
              COALESCE(v.stock_qty, -1) AS current_qty
         FROM inventory_import_items i
         LEFT JOIN product_variants v ON v.id=i.variant_id
        WHERE i.run_id=$1 ORDER BY i.id`,
      [Number(runId)],
    );
    const drift = items.rows.filter((i) => Number(i.current_qty) !== Number(i.new_qty));
    if (drift.length) throw new Error(`Відкат заблоковано: ${drift.length} позицій уже змінено після імпорту`);

    const affected = new Set<number>();
    for (const item of items.rows) {
      const pid = Number(item.product_id);
      const oldQty = Number(item.old_qty);
      const newQty = Number(item.new_qty);
      await client.query(
        "UPDATE product_variants SET stock_qty=$2, updated_at=now(), updated_by='import_rollback' WHERE id=$1",
        [Number(item.variant_id), oldQty],
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
         VALUES ($1,$2,$3,'adjust',$4,$5,$6,'import_rollback')`,
        [pid, Number(item.variant_id), item.size, oldQty - newQty, oldQty, `Відкат імпорту: ${run.rows[0].filename}`],
      );
      affected.add(pid);
    }
    if (affected.size) {
      await client.query(
        `UPDATE products p SET stock_qty=sub.total, is_in_stock=(sub.total > 0), updated_at=now()
           FROM (SELECT pid AS product_id,
                 COALESCE((SELECT SUM(stock_qty) FROM product_variants v WHERE v.product_id=pid AND v.active),0) AS total
                 FROM unnest($1::bigint[]) AS pid) sub
          WHERE p.id=sub.product_id`,
        [[...affected]],
      );
    }
    await client.query("UPDATE inventory_import_runs SET status='rolled_back', rolled_back_at=now() WHERE id=$1", [Number(runId)]);
    await client.query("COMMIT");
    return { runId, restoredVariants: items.rows.length, affectedProducts: affected.size };
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
  meta?: { barcode?: string; offer_code?: string; active?: boolean; stock_source_id?: number },
  importNote = "Імпорт цін/залишків",
): Promise<{ movement: number; variantId: number; before: number; after: number; quantityChanged: boolean }> {
  if (!size.trim()) return { movement: 0, variantId: 0, before: 0, after: 0, quantityChanged: false };
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
  if (meta?.stock_source_id !== undefined) add("stock_source_id", meta.stock_source_id);
  let movement = 0;
  let after = before;
  if (qty != null) {
    after = Math.max(0, Math.round(qty));
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
  return { movement, variantId, before, after, quantityChanged: qty != null && after !== before };
}
