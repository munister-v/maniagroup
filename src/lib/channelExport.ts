/**
 * Channel exports (E5) — emit price + stock feeds. One canonical row set
 * (`getExportRows`) is rendered into several formats so adding a channel never
 * re-queries the DB.
 *
 *   csv / xlsx  — generic spreadsheet (price list)
 *   xml         — plain offer-level XML
 *   google      — Google Merchant RSS 2.0 (g: namespace)
 *
 * Prom.ua and Rozetka were dropped in 2026-07: the shop does not sell through
 * those marketplaces, so their generators and /feed URLs are gone.
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
  ids?: string[];               // restrict to these product ids («Обрані»)
};

export async function getExportRows(f: ExportFilters = {}): Promise<ExportRow[]> {
  const conds: string[] = ["p.status = 'publish'"];
  const bind: unknown[] = [];
  if (f.scope !== "all") conds.push("p.is_in_stock = TRUE");
  if (f.requireImage !== false) conds.push("p.images IS NOT NULL AND p.images::text NOT IN ('[]','null','')");
  if (f.minPrice && f.minPrice > 0) { bind.push(f.minPrice); conds.push(`p.price >= $${bind.length}`); }
  if (f.brand) { bind.push(f.brand); conds.push(`p.brand = $${bind.length}`); }
  if (f.ids?.length) { bind.push(f.ids.map(Number).filter(Number.isFinite)); conds.push(`p.id = ANY($${bind.length})`); }

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

/** Plain offer-level XML (Intertop «Експорт → XML»): one <offer> per row. */
function toXml(rows: ExportRow[]): string {
  const body = rows.map((r) =>
    `  <offer id="${xmlEscape(r.sku)}">\n` +
    `    <name>${xmlEscape(r.name)}</name>\n` +
    `    <category>${xmlEscape(r.category)}</category>\n` +
    `    <brand>${xmlEscape(r.brand)}</brand>\n` +
    `    <price>${r.price}</price>\n` +
    (r.oldPrice ? `    <oldPrice>${r.oldPrice}</oldPrice>\n` : "") +
    `    <stock>${r.stock}</stock>\n` +
    `    <available>${r.available ? "true" : "false"}</available>\n` +
    `    <sizes>${xmlEscape(r.sizes)}</sizes>\n` +
    `    <picture>${xmlEscape(r.image)}</picture>\n` +
    `  </offer>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<offers>\n${body}\n</offers>`;
}

export const EXPORT_FORMATS = ["csv", "xlsx", "xml", "google"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function buildExport(format: ExportFormat, rows: ExportRow[]): ExportResult {
  const stamp = new Date().toISOString().slice(0, 10);
  switch (format) {
    case "xml":
      return { filename: `maniagroup-offers-${stamp}.xml`, contentType: "application/xml; charset=utf-8", body: toXml(rows) };
    case "csv":
      return { filename: `maniagroup-price-${stamp}.csv`, contentType: "text/csv; charset=utf-8", body: toCsv(rows) };
    case "xlsx":
      return { filename: `maniagroup-price-${stamp}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: toXlsx(rows) };
    case "google":
      return { filename: `google-merchant-${stamp}.xml`, contentType: "application/xml; charset=utf-8", body: toGoogleMerchant(rows) };
  }
}
