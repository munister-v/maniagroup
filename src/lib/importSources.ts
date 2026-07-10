import { q, q1 } from "./pg";

/**
 * Named import sources (Intertop agora "Джерела даних") — a persistent
 * registry of import channels, distinct from a single upload: every apply
 * of a file with a given name is recorded against (or creates) a source row,
 * so the admin sees a running status/error-count per supplier feed instead
 * of just an ephemeral run log. See lib/importTemplates.ts for the mapping
 * layer a source can reference.
 */

export type FeedType = "file" | "url";
export type SourceStatus = "new" | "ok" | "error";

export type ImportSource = {
  id: string; name: string; feed_type: FeedType;
  template_id: string | null; template_name?: string | null;
  status: SourceStatus; error_count: number; feed_url: string | null;
  last_run_at: string | null; next_run_at: string | null;
  created_at: string; updated_at: string;
};

export type ImportSourceInput = {
  name: string; feed_type: FeedType; template_id?: string | null; feed_url?: string | null;
};

const SELECT = `
  SELECT s.id::text, s.name, s.feed_type, s.template_id::text, t.name AS template_name,
         s.status, s.error_count, s.feed_url,
         s.last_run_at::text, s.next_run_at::text, s.created_at::text, s.updated_at::text
    FROM import_sources s
    LEFT JOIN import_templates t ON t.id = s.template_id
`;

export async function listImportSources(): Promise<ImportSource[]> {
  return q<ImportSource>(`${SELECT} ORDER BY s.updated_at DESC`);
}

export async function getImportSource(id: string): Promise<ImportSource | null> {
  return q1<ImportSource>(`${SELECT} WHERE s.id = $1`, [Number(id)]);
}

export async function createImportSource(input: ImportSourceInput): Promise<{ id: string }> {
  const row = await q1<{ id: string }>(
    `INSERT INTO import_sources (name, feed_type, template_id, feed_url) VALUES ($1,$2,$3,$4) RETURNING id::text`,
    [input.name.trim(), input.feed_type, input.template_id ? Number(input.template_id) : null, input.feed_url || null],
  );
  return { id: row!.id };
}

export async function updateImportSource(id: string, input: ImportSourceInput): Promise<void> {
  await q(
    `UPDATE import_sources SET name=$2, feed_type=$3, template_id=$4, feed_url=$5, updated_at=now() WHERE id=$1`,
    [Number(id), input.name.trim(), input.feed_type, input.template_id ? Number(input.template_id) : null, input.feed_url || null],
  );
}

export async function deleteImportSource(id: string): Promise<void> {
  await q("DELETE FROM import_sources WHERE id = $1", [Number(id)]);
}

/**
 * Called from the upload/apply path so every file import shows up in the
 * registry — matched by exact name (the filename), created on first sight.
 */
export async function recordSourceRun(
  name: string, templateId: string | null, ok: boolean, errorCount: number,
): Promise<void> {
  const existing = await q1<{ id: string }>("SELECT id::text FROM import_sources WHERE name = $1", [name]);
  const status: SourceStatus = ok ? "ok" : "error";
  if (existing) {
    await q(
      `UPDATE import_sources SET status=$2, error_count=$3, template_id=COALESCE($4, template_id), last_run_at=now(), updated_at=now() WHERE id=$1`,
      [Number(existing.id), status, errorCount, templateId ? Number(templateId) : null],
    );
  } else {
    await q(
      `INSERT INTO import_sources (name, feed_type, template_id, status, error_count, last_run_at)
       VALUES ($1,'file',$2,$3,$4,now())`,
      [name, templateId ? Number(templateId) : null, status, errorCount],
    );
  }
}
