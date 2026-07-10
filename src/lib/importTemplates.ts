import { q, q1 } from "./pg";

/**
 * Named import templates (Intertop agora "Шаблони даних") — an explicit,
 * admin-defined column→property mapping for one supplier's file layout,
 * matched by EXACT raw column label text (not stockImport.ts's fuzzy
 * synonym auto-detect). Lets one seller/format combination be saved once
 * and reused, same as Intertop's own template list.
 */

export type ImportFormat = "csv" | "xlsx";

/** Canonical properties a template column can map to — mirrors stockImport.ts's
 *  OFFER_SYN/PRODUCT_SYN keys (the auto-detect vocabulary), so a template and
 *  auto-detect produce the same OfferRow shape underneath. */
export const PROPERTY_LIST: { key: string; label: string; group: "offer" | "product" }[] = [
  { key: "article",         label: "Артикул (внутрішній номер)",     group: "offer" },
  { key: "external_id",     label: "Код товару / External ID",       group: "offer" },
  { key: "factory_article", label: "Заводський артикул",             group: "offer" },
  { key: "barcode",         label: "Штрихкод",                       group: "offer" },
  { key: "offer_code",      label: "Код оферу (mp-код)",              group: "offer" },
  { key: "size",            label: "Розмір",                         group: "offer" },
  { key: "quantity",        label: "Кількість",                      group: "offer" },
  { key: "base_price",      label: "Базова ціна",                    group: "offer" },
  { key: "discount_price",  label: "Акційна ціна",                   group: "offer" },
  { key: "active",          label: "Активність",                     group: "offer" },
  { key: "name_uk",         label: "Назва (укр.)",                   group: "product" },
  { key: "name_ru",         label: "Назва (рос.)",                   group: "product" },
  { key: "description_uk",  label: "Опис (укр.)",                    group: "product" },
  { key: "description_ru",  label: "Опис (рос.)",                    group: "product" },
  { key: "brand",           label: "Бренд",                          group: "product" },
  { key: "category",        label: "Категорія",                      group: "product" },
  { key: "color",           label: "Колір",                          group: "product" },
  { key: "country",         label: "Країна",                         group: "product" },
  { key: "gender",          label: "Стать",                          group: "product" },
  { key: "composition_uk",  label: "Склад (укр.)",                   group: "product" },
  { key: "composition_ru",  label: "Склад (рос.)",                   group: "product" },
];

export type TemplateColumn = { id: string; raw_label: string; property_key: string; required: boolean; sort_order: number };
export type ImportTemplate = {
  id: string; name: string; format: ImportFormat; encoding: string; delimiter: string;
  header_row: number; data_start_row: number; created_at: string; updated_at: string;
  column_count?: number;
};
export type ImportTemplateInput = {
  name: string; format: ImportFormat; encoding?: string; delimiter?: string;
  header_row?: number; data_start_row?: number;
  columns: { raw_label: string; property_key: string; required?: boolean }[];
};

export async function listImportTemplates(): Promise<ImportTemplate[]> {
  return q<ImportTemplate>(
    `SELECT t.id::text, t.name, t.format, t.encoding, t.delimiter, t.header_row, t.data_start_row,
            t.created_at::text, t.updated_at::text,
            (SELECT count(*) FROM import_template_columns c WHERE c.template_id = t.id)::int AS column_count
       FROM import_templates t ORDER BY t.updated_at DESC`,
  );
}

export async function getImportTemplate(id: string): Promise<(ImportTemplate & { columns: TemplateColumn[] }) | null> {
  const t = await q1<ImportTemplate>(
    `SELECT id::text, name, format, encoding, delimiter, header_row, data_start_row, created_at::text, updated_at::text
       FROM import_templates WHERE id = $1`, [Number(id)],
  );
  if (!t) return null;
  const columns = await q<TemplateColumn>(
    `SELECT id::text, raw_label, property_key, required, sort_order FROM import_template_columns
      WHERE template_id = $1 ORDER BY sort_order, id`, [Number(id)],
  );
  return { ...t, columns };
}

export async function createImportTemplate(input: ImportTemplateInput): Promise<{ id: string }> {
  const row = await q1<{ id: string }>(
    `INSERT INTO import_templates (name, format, encoding, delimiter, header_row, data_start_row)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
    [
      input.name.trim(), input.format, input.encoding || "utf-8", input.delimiter || ";",
      input.header_row ?? 1, input.data_start_row ?? 2,
    ],
  );
  const id = row!.id;
  await insertColumns(id, input.columns);
  return { id };
}

export async function updateImportTemplate(id: string, input: ImportTemplateInput): Promise<void> {
  await q(
    `UPDATE import_templates SET name=$2, format=$3, encoding=$4, delimiter=$5, header_row=$6, data_start_row=$7, updated_at=now()
      WHERE id=$1`,
    [Number(id), input.name.trim(), input.format, input.encoding || "utf-8", input.delimiter || ";", input.header_row ?? 1, input.data_start_row ?? 2],
  );
  await q("DELETE FROM import_template_columns WHERE template_id = $1", [Number(id)]);
  await insertColumns(id, input.columns);
}

async function insertColumns(templateId: string, columns: ImportTemplateInput["columns"]): Promise<void> {
  let order = 0;
  for (const c of columns) {
    if (!c.raw_label.trim() || !c.property_key) continue;
    await q(
      `INSERT INTO import_template_columns (template_id, raw_label, property_key, required, sort_order) VALUES ($1,$2,$3,$4,$5)`,
      [Number(templateId), c.raw_label.trim(), c.property_key, !!c.required, order++],
    );
  }
}

export async function deleteImportTemplate(id: string): Promise<void> {
  await q("DELETE FROM import_templates WHERE id = $1", [Number(id)]);
}
