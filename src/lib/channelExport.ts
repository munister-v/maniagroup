/**
 * Channel exports (E5) — emit price + stock feeds in the formats Ukrainian
 * marketplaces and Google Merchant expect. One canonical row set (`getExportRows`)
 * is rendered into several formats so adding a channel never re-queries the DB.
 *
 *   csv / xlsx  — generic spreadsheet (price list)
 *   prom        — Prom.ua import XLSX (their Ukrainian column names)
 *   rozetka     — YML (Yandex Market Language) XML, accepted by Rozetka
 *   google      — Google Merchant RSS 2.0 (g: namespace)
 *
 * Server-only.
 */

import * as XLSX from "xlsx";
import { q } from "./pg";
import { ukrainianize } from "./uk";

const BASE = "https://maniagroup.munister.com.ua";
const CURRENCY = "UAH";

export type ExportRow = {
  id: string; sku: string; name: string; brand: string; category: string;
  price: number; oldPrice: number | null; stock: number; available: boolean;
  sizes: string; image: string; url: string;
};

export type ExportFilters = {
  scope?: "instock" | "all";   // default instock
  minPrice?: number;
  requireImage?: boolean;       // default true (marketplaces reject imageless)
  brand?: string;
};

export async function getExportRows(f: ExportFilters = {}): Promise<ExportRow[]> {
  const conds: string[] = ["p.status = 'publish'"];
  const bind: unknown[] = [];
  if (f.scope !== "all") conds.push("p.is_in_stock = TRUE");
  if (f.requireImage !== false) conds.push("p.images IS NOT NULL AND p.images::text NOT IN ('[]','null','')");
  if (f.minPrice && f.minPrice > 0) { bind.push(f.minPrice); conds.push(`p.price >= $${bind.length}`); }
  if (f.brand) { bind.push(f.brand); conds.push(`p.brand = $${bind.length}`); }

  const rows = await q<{
    id: string; sku: string; name: string; brand: string; category: string;
    price: string; regular_price: string; stock_qty: string; is_in_stock: boolean;
    image_src: string; sizes: string | null;
  }>(
    `SELECT p.id::text, p.sku, p.name, p.brand, p.category,
            p.price::float::text AS price, p.regular_price::float::text AS regular_price,
            COALESCE(p.stock_qty, 0)::text AS stock_qty, p.is_in_stock, p.image_src,
            (SELECT string_agg(v.size, ', ' ORDER BY v.size)
               FROM product_variants v
              WHERE v.product_id = p.id AND v.active AND v.stock_qty > 0) AS sizes
       FROM products p
      WHERE ${conds.join(" AND ")}
      ORDER BY p.is_in_stock DESC, p.id DESC`,
    bind,
  );

  return rows.map((r) => {
    const price = Math.round(Number(r.price));
    const regular = Math.round(Number(r.regular_price));
    return {
      id: r.id,
      sku: r.sku || r.id,
      name: ukrainianize(r.name),
      brand: r.brand,
      category: ukrainianize(r.category),
      price,
      oldPrice: regular > price ? regular : null,
      stock: Number(r.stock_qty),
      available: r.is_in_stock,
      sizes: r.sizes ?? "",
      image: r.image_src || "",
      url: `${BASE}/product/${r.id}`,
    };
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export type ExportResult = { filename: string; contentType: string; body: string | Buffer };

// ── generic CSV ────────────────────────────────────────────────────────────────

const CSV_HEADERS = ["Артикул", "Назва", "Бренд", "Категорія", "Ціна", "Стара ціна", "Залишок", "Наявність", "Розміри", "Фото", "Посилання"];

function toCsv(rows: ExportRow[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_HEADERS.join(";")];
  for (const r of rows) {
    lines.push([
      r.sku, r.name, r.brand, r.category, r.price, r.oldPrice ?? "",
      r.stock, r.available ? "+" : "-", r.sizes, r.image, r.url,
    ].map(esc).join(";"));
  }
  // BOM so Excel reads UTF-8 Cyrillic correctly.
  return "﻿" + lines.join("\r\n");
}

// ── generic XLSX ────────────────────────────────────────────────────────────────

function toXlsx(rows: ExportRow[]): Buffer {
  const aoa = [CSV_HEADERS, ...rows.map((r) => [
    r.sku, r.name, r.brand, r.category, r.price, r.oldPrice ?? "",
    r.stock, r.available ? "+" : "-", r.sizes, r.image, r.url,
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 18 }, { wch: 40 }, { wch: 44 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Прайс");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ── Prom.ua import XLSX ─────────────────────────────────────────────────────────
// Prom's catalog import recognises these Ukrainian column headers.

const PROM_HEADERS = [
  "Код_товару", "Назва_позиції", "Опис", "Тип_товару", "Ціна", "Валюта",
  "Одиниця_виміру", "Кількість", "Наявність", "Виробник", "Посилання_зображення",
  "Назва_групи", "Унікальний_ідентифікатор",
];

function toProm(rows: ExportRow[]): Buffer {
  const aoa = [PROM_HEADERS, ...rows.map((r) => [
    r.sku,
    r.name,
    r.sizes ? `${r.name}. Розміри: ${r.sizes}.` : r.name,
    "r",                                   // r = звичайний товар
    r.price,
    CURRENCY,
    "шт.",
    r.stock > 0 ? r.stock : "",            // empty ⇒ Prom drives listing by Наявність
    r.available ? "+" : "-",
    r.brand,
    r.image,
    r.category,
    r.sku,
  ])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = PROM_HEADERS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export Products Sheet");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ── Rozetka YML (Yandex Market Language) ────────────────────────────────────────

function toRozetkaYml(rows: ExportRow[]): string {
  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  // Build a category list from distinct categories.
  const cats = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));
  const catId = new Map(cats.map((c, i) => [c, i + 1]));

  const offers = rows.map((r) => {
    const sizesParam = r.sizes
      ? r.sizes.split(",").map((s) => `        <param name="Розмір">${xmlEscape(s.trim())}</param>`).join("\n")
      : "";
    return `      <offer id="${xmlEscape(r.id)}" available="${r.available ? "true" : "false"}">
        <url>${xmlEscape(r.url)}</url>
        <price>${r.price}</price>${r.oldPrice ? `\n        <price_old>${r.oldPrice}</price_old>` : ""}
        <currencyId>${CURRENCY}</currencyId>
        <categoryId>${catId.get(r.category) ?? 1}</categoryId>
        ${r.image ? `<picture>${xmlEscape(r.image)}</picture>` : ""}
        <vendor>${xmlEscape(r.brand)}</vendor>${r.stock > 0 ? `\n        <stock_quantity>${r.stock}</stock_quantity>` : ""}
        <name>${xmlEscape(r.name)}</name>
        <param name="Артикул">${xmlEscape(r.sku)}</param>
${sizesParam}
      </offer>`;
  }).join("\n");

  const categories = cats.map((c) => `      <category id="${catId.get(c)}">${xmlEscape(c)}</category>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${date}">
  <shop>
    <name>Mania Group</name>
    <company>Mania Group</company>
    <url>${BASE}</url>
    <currencies>
      <currency id="${CURRENCY}" rate="1"/>
    </currencies>
    <categories>
${categories}
    </categories>
    <offers>
${offers}
    </offers>
  </shop>
</yml_catalog>`;
}

// ── Google Merchant RSS 2.0 ─────────────────────────────────────────────────────

function toGoogleMerchant(rows: ExportRow[]): string {
  const items = rows.map((r) => `    <item>
      <g:id>${xmlEscape(r.sku)}</g:id>
      <title>${xmlEscape(r.name)}</title>
      <link>${xmlEscape(r.url)}</link>
      ${r.image ? `<g:image_link>${xmlEscape(r.image)}</g:image_link>` : ""}
      <g:availability>${r.available ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${r.oldPrice ?? r.price}.00 ${CURRENCY}</g:price>${r.oldPrice ? `\n      <g:sale_price>${r.price}.00 ${CURRENCY}</g:sale_price>` : ""}
      <g:brand>${xmlEscape(r.brand)}</g:brand>
      <g:condition>new</g:condition>
      <g:product_type>${xmlEscape(r.category)}</g:product_type>
      <g:identifier_exists>false</g:identifier_exists>
    </item>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Mania Group</title>
    <link>${BASE}</link>
    <description>Брендовий одяг, взуття та аксесуари</description>
${items}
  </channel>
</rss>`;
}

// ── dispatcher ──────────────────────────────────────────────────────────────────

export const EXPORT_FORMATS = ["csv", "xlsx", "prom", "rozetka", "google"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function buildExport(format: ExportFormat, rows: ExportRow[]): ExportResult {
  const stamp = new Date().toISOString().slice(0, 10);
  switch (format) {
    case "csv":
      return { filename: `maniagroup-price-${stamp}.csv`, contentType: "text/csv; charset=utf-8", body: toCsv(rows) };
    case "xlsx":
      return { filename: `maniagroup-price-${stamp}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: toXlsx(rows) };
    case "prom":
      return { filename: `prom-import-${stamp}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: toProm(rows) };
    case "rozetka":
      return { filename: `rozetka-yml-${stamp}.xml`, contentType: "application/xml; charset=utf-8", body: toRozetkaYml(rows) };
    case "google":
      return { filename: `google-merchant-${stamp}.xml`, contentType: "application/xml; charset=utf-8", body: toGoogleMerchant(rows) };
  }
}
