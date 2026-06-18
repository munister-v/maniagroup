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
  kind: "offers" | "master";
  headerRow: number;
  columns: Record<string, number>;
};

const SCHEMA_HINT = `Two target schemas:
- "offers": price/stock list, ONE ROW PER SIZE. Fields:
  external_id (product code), factory_article (заводський/factory article),
  barcode (штрихкод/EAN), size (розмір), offer_code (mp-code/offer id),
  quantity (кількість/наявність), base_price (базова ціна), discount_price (акційна ціна).
- "master": product master list, ONE ROW PER PRODUCT. Fields:
  kod (internal numeric code), factory_article, brand (бренд), name (назва/наименование),
  sizes (a cell listing all sizes, possibly repeated), base_price, sale_price,
  composition (склад/состав), collection (колекція), color (колір/цвет).`;

function renderRows(grid: unknown[][], maxRows = 8, maxCols = 22): string {
  return grid.slice(0, maxRows).map((row, ri) => {
    const cells = (row ?? []).slice(0, maxCols)
      .map((c, ci) => `[${ci}]=${String(c ?? "").slice(0, 28)}`)
      .join("  ");
    return `row ${ri}: ${cells}`;
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
        `${SCHEMA_HINT}\n\nColumns are 0-based. Sample rows:\n${renderRows(grid)}\n\n` +
        `Decide the file type and map our fields to column indices. ` +
        `Return JSON exactly like: ` +
        `{"kind":"offers"|"master","headerRow":<int index of the header row>,` +
        `"columns":{"<field>":<columnIndex>}}. ` +
        `Only include fields that are clearly present. If it is neither type, return {"kind":"unknown"}.`,
    },
  ];

  let raw: string;
  try {
    raw = await orChat(messages, { maxTokens: 400, temperature: 0 });
  } catch {
    return null;
  }

  try {
    const obj = extractJson(raw) as { kind?: string; headerRow?: number; columns?: Record<string, number> };
    if (obj.kind !== "offers" && obj.kind !== "master") return null;
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
