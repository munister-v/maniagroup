import { q, q1 } from "./pg";

/**
 * Value lists (Intertop agora "Списки значень") — named controlled
 * vocabularies an import template's mapped column could be checked against
 * (e.g. valid colors, genders, seasons). Plain CRUD, no enforcement wired
 * into stockImport.ts yet — this is the registry only.
 */

export type ValueList = { id: string; name: string; created_at: string; updated_at: string; item_count?: number };
export type ValueListDetail = ValueList & { values: string[] };
export type ValueListInput = { name: string; values: string[] };

export async function listValueLists(): Promise<ValueList[]> {
  return q<ValueList>(
    `SELECT l.id::text, l.name, l.created_at::text, l.updated_at::text,
            (SELECT count(*) FROM value_list_items i WHERE i.list_id = l.id)::int AS item_count
       FROM value_lists l ORDER BY l.updated_at DESC`,
  );
}

export async function getValueList(id: string): Promise<ValueListDetail | null> {
  const l = await q1<ValueList>("SELECT id::text, name, created_at::text, updated_at::text FROM value_lists WHERE id = $1", [Number(id)]);
  if (!l) return null;
  const items = await q<{ value: string }>(
    "SELECT value FROM value_list_items WHERE list_id = $1 ORDER BY sort_order, id", [Number(id)],
  );
  return { ...l, values: items.map((i) => i.value) };
}

export async function createValueList(input: ValueListInput): Promise<{ id: string }> {
  const row = await q1<{ id: string }>("INSERT INTO value_lists (name) VALUES ($1) RETURNING id::text", [input.name.trim()]);
  const id = row!.id;
  await insertItems(id, input.values);
  return { id };
}

export async function updateValueList(id: string, input: ValueListInput): Promise<void> {
  await q("UPDATE value_lists SET name=$2, updated_at=now() WHERE id=$1", [Number(id), input.name.trim()]);
  await q("DELETE FROM value_list_items WHERE list_id = $1", [Number(id)]);
  await insertItems(id, input.values);
}

async function insertItems(listId: string, values: string[]): Promise<void> {
  let order = 0;
  for (const v of values) {
    if (!v.trim()) continue;
    await q("INSERT INTO value_list_items (list_id, value, sort_order) VALUES ($1,$2,$3)", [Number(listId), v.trim(), order++]);
  }
}

export async function deleteValueList(id: string): Promise<void> {
  await q("DELETE FROM value_lists WHERE id = $1", [Number(id)]);
}
