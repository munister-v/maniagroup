import { q, q1 } from "./pg";

/**
 * Value lists (Intertop agora "Списки значень") — a named, property-scoped
 * raw→canonical MAPPING table: each row pairs a supplier's own label
 * ("Значення продавця", e.g. "42") with our canonical value ("Значення",
 * e.g. "M"). An import template column can reference a value list so
 * stockImport.ts translates matched cells before writing them — see
 * parseImportWithTemplate. Unlike Intertop's own system (which offers a
 * fixed dropdown of Intertop's reference values), our canonical side is
 * free text: we don't have Intertop's own vocabulary, we're defining our own.
 */

export type ValueListRow = { id: string; seller_value: string; value: string; sort_order: number };
export type ValueList = {
  id: string; name: string; property_key: string;
  created_at: string; updated_at: string; item_count?: number;
};
export type ValueListDetail = ValueList & { rows: ValueListRow[] };
export type ValueListInput = { name: string; property_key: string; rows: { seller_value: string; value: string }[] };

export async function listValueLists(): Promise<ValueList[]> {
  return q<ValueList>(
    `SELECT l.id::text, l.name, l.property_key, l.created_at::text, l.updated_at::text,
            (SELECT count(*) FROM value_list_items i WHERE i.list_id = l.id)::int AS item_count
       FROM value_lists l ORDER BY l.updated_at DESC`,
  );
}

export async function getValueList(id: string): Promise<ValueListDetail | null> {
  const l = await q1<ValueList>(
    "SELECT id::text, name, property_key, created_at::text, updated_at::text FROM value_lists WHERE id = $1", [Number(id)],
  );
  if (!l) return null;
  const rows = await q<ValueListRow>(
    "SELECT id::text, seller_value, value, sort_order FROM value_list_items WHERE list_id = $1 ORDER BY sort_order, id", [Number(id)],
  );
  return { ...l, rows };
}

/** Templates whose columns reference this value list — Intertop's "Пов'язані шаблони" block. */
export async function linkedTemplates(id: string): Promise<{ id: string; name: string }[]> {
  return q<{ id: string; name: string }>(
    `SELECT DISTINCT t.id::text, t.name FROM import_templates t
       JOIN import_template_columns c ON c.template_id = t.id
      WHERE c.value_list_id = $1 ORDER BY t.name`,
    [Number(id)],
  );
}

export async function createValueList(input: ValueListInput): Promise<{ id: string }> {
  const row = await q1<{ id: string }>(
    "INSERT INTO value_lists (name, property_key) VALUES ($1,$2) RETURNING id::text",
    [input.name.trim(), input.property_key],
  );
  const id = row!.id;
  await insertRows(id, input.rows);
  return { id };
}

export async function updateValueList(id: string, input: ValueListInput): Promise<void> {
  await q("UPDATE value_lists SET name=$2, property_key=$3, updated_at=now() WHERE id=$1", [Number(id), input.name.trim(), input.property_key]);
  await q("DELETE FROM value_list_items WHERE list_id = $1", [Number(id)]);
  await insertRows(id, input.rows);
}

async function insertRows(listId: string, rows: ValueListInput["rows"]): Promise<void> {
  let order = 0;
  for (const r of rows) {
    if (!r.seller_value.trim()) continue;
    await q(
      "INSERT INTO value_list_items (list_id, seller_value, value, sort_order) VALUES ($1,$2,$3,$4)",
      [Number(listId), r.seller_value.trim(), r.value.trim(), order++],
    );
  }
}

export async function deleteValueList(id: string): Promise<void> {
  await q("DELETE FROM value_lists WHERE id = $1", [Number(id)]);
}

/**
 * Batch-load raw→canonical maps for a set of value list ids, keyed by
 * lowercased seller_value — used by stockImport.ts:parseImportWithTemplate
 * to translate matched cells during import.
 */
export async function loadValueListMaps(ids: string[]): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  if (ids.length === 0) return out;
  const rows = await q<{ list_id: string; seller_value: string; value: string }>(
    `SELECT list_id::text, seller_value, value FROM value_list_items WHERE list_id = ANY($1)`,
    [ids.map(Number)],
  );
  for (const r of rows) {
    if (!out.has(r.list_id)) out.set(r.list_id, new Map());
    out.get(r.list_id)!.set(r.seller_value.toLowerCase(), r.value);
  }
  return out;
}
