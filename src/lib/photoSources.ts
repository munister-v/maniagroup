import { q, q1 } from "./pg";
import { getSetting } from "./settings";

export type PhotoSource = {
  id: number;
  name: string;
  base_url: string;
  type: "wp";
  enabled: boolean;
  sort_order: number;
};

/**
 * One-time migration from the old single wp_photo_source_url setting into
 * the first row here, so an admin who already configured a source doesn't
 * lose it when this table replaces that field.
 */
async function migrateLegacySetting(): Promise<void> {
  const legacy = await getSetting("wp_photo_source_url");
  if (!legacy) return;
  const existing = await q1<{ n: string }>("SELECT count(*)::text AS n FROM photo_sources");
  if (existing && Number(existing.n) > 0) return;
  await q(
    `INSERT INTO photo_sources (name, base_url, type, enabled, sort_order) VALUES ($1, $2, 'wp', TRUE, 0)`,
    ["Старий сайт", legacy],
  );
}

export async function listPhotoSources(): Promise<PhotoSource[]> {
  await migrateLegacySetting();
  return q<PhotoSource>("SELECT id, name, base_url, type, enabled, sort_order FROM photo_sources ORDER BY sort_order, id");
}

export async function listEnabledPhotoSources(): Promise<PhotoSource[]> {
  const all = await listPhotoSources();
  return all.filter((s) => s.enabled);
}

export async function createPhotoSource(input: { name: string; base_url: string }): Promise<PhotoSource> {
  const normalized = input.base_url.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Некоректна адреса — вкажіть повний URL (https://...)");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Адреса має починатись з http:// або https://");
  }

  const dup = await q1<{ id: string }>("SELECT id::text FROM photo_sources WHERE lower(base_url) = lower($1)", [normalized]);
  if (dup) throw new Error("Це джерело вже додано");

  const maxRow = await q1<{ n: string }>("SELECT coalesce(max(sort_order), -1)::text AS n FROM photo_sources");
  const nextOrder = Number(maxRow?.n ?? -1) + 1;
  const row = await q1<PhotoSource>(
    `INSERT INTO photo_sources (name, base_url, type, enabled, sort_order) VALUES ($1, $2, 'wp', TRUE, $3)
     RETURNING id, name, base_url, type, enabled, sort_order`,
    [input.name || parsed.hostname, normalized, nextOrder],
  );
  if (!row) throw new Error("Не вдалося створити джерело");
  return row;
}

export async function updatePhotoSource(id: number, input: Partial<Pick<PhotoSource, "name" | "base_url" | "enabled">>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (input.name !== undefined) { sets.push(`name = $${i++}`); vals.push(input.name); }
  if (input.base_url !== undefined) { sets.push(`base_url = $${i++}`); vals.push(input.base_url.trim().replace(/\/+$/, "")); }
  if (input.enabled !== undefined) { sets.push(`enabled = $${i++}`); vals.push(input.enabled); }
  if (sets.length === 0) return;
  vals.push(id);
  await q(`UPDATE photo_sources SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function reorderPhotoSources(orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await q("UPDATE photo_sources SET sort_order = $2 WHERE id = $1", [orderedIds[i], i]);
  }
}

export async function deletePhotoSource(id: number): Promise<void> {
  await q("DELETE FROM photo_sources WHERE id = $1", [id]);
}
