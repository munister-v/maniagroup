/**
 * AI column-mapper for the ERP import. When the rule-based parser in
 * stockImport.ts can't recognise a file (unusual headers, another language,
 * a brand-new supplier layout), this sends the header + a few sample rows to
 * OpenRouter and asks it to classify the file and map columns to our schema.
 *
 * Makes "Завантажити файл" understand essentially ANY table. Server-only.
 */

import { orChat } from "./openRouter";

export type AiMapping = {
  kind: "offers";
  headerRow: number;
  columns: Record<string, number>;
};

const SCHEMA_HINT = `Target schema:

"offers" — price/stock list, usually one row per size variant, but some
categories (e.g. beauty/cosmetics) have no size at all — one row IS the whole
product. Fields (use the most likely column):
  external_id   → product id / код товару / external_code / ID
  factory_article → заводський артикул / factory article / артикул виробника
  article       → артикул / article (the SELLER's own internal product number —
                  distinct from factory_article, which is the SUPPLIER's code)
  barcode       → штрихкод / EAN / barcode
  size          → розмір / size (the generic size property) — omit if the
                  file has no size column at all (e.g. beauty/cosmetics feeds)
  clother_size  → розмір одягу / clother_size — Intertop's DISTINCT
                  clothing-specific size property, separate from "size";
                  map it here if the column literally says "Розмір одягу" or
                  "clother_size", not to "size"
  offer_code    → код оферу / mp-code / offer_id / SKU
  quantity      → кількість / наявність / qty / stock / залишок (integer stock count)
  base_price    → базова ціна / ціна / regular price (numeric)
  discount_price → акційна ціна / sale price / знижка (numeric, optional)
  active        → активність / active (yes/no — whether the offer is enabled)`;

function renderRows(grid: unknown[][], maxRows = 12, maxCols = 28): string {
  // Find first non-empty row to use as anchor
  const firstData = grid.findIndex((r) => (r as unknown[]).some((c) => String(c ?? "").trim()));
  const start = Math.max(0, firstData);
  return grid.slice(start, start + maxRows).map((row, ri) => {
    const cells = (row ?? []).slice(0, maxCols)
      .map((c, ci) => `[${ci}]=${String(c ?? "").slice(0, 30)}`)
      .join("  ");
    return `row ${start + ri}: ${cells}`;
  }).join("\n");
}

function extractJson(text: string): unknown {
  // Strip code fences and grab the outermost {...}.
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Ask the model to classify + map columns. Returns null if it can't. */
export async function aiDetectImport(grid: unknown[][]): Promise<AiMapping | null> {
  if (!grid.length) return null;

  const messages = [
    {
      role: "system" as const,
      content:
        "You map spreadsheet columns to an e-commerce stock-import schema. " +
        "Reply with ONLY a compact JSON object — no prose, no markdown.",
    },
    {
      role: "user" as const,
      content:
        `${SCHEMA_HINT}\n\nSpreadsheet sample (columns are 0-based indices):\n${renderRows(grid)}\n\n` +
        `Task: check whether this file matches the "offers" schema, ` +
        `find the header row (first row with column labels), and map field names to column indices.\n` +
        `Return JSON exactly:\n` +
        `{"kind":"offers","headerRow":<0-based row index>,"columns":{"<field>":<colIndex>,...}}\n` +
        `Rules:\n` +
        `- Map "size" if the file has one; if not (e.g. beauty/cosmetics — no per-size rows), skip it — that's fine.\n` +
        `- Only include fields you are confident about (skip unsure ones).\n` +
        `- If the file doesn't match, return {"kind":"unknown"}.\n` +
        `- No prose, no markdown — pure JSON only.`,
    },
  ];

  let raw: string;
  try {
    raw = await orChat(messages, { maxTokens: 600, temperature: 0 });
  } catch {
    return null;
  }

  try {
    const obj = extractJson(raw) as { kind?: string; headerRow?: number; columns?: Record<string, number> };
    if (obj.kind !== "offers") return null;
    const columns: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj.columns ?? {})) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0) columns[k] = n;
    }
    if (Object.keys(columns).length === 0) return null;
    return {
      kind: obj.kind,
      headerRow: Number.isInteger(obj.headerRow) ? Number(obj.headerRow) : 0,
      columns,
    };
  } catch {
    return null;
  }
}
