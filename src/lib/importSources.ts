import { q, q1 } from "./pg";
import { applyImport, extractXmlCreatedAt, parseImportSmart, parseImportWithTemplate, parseXmlOffers, type Parsed } from "./stockImport";
import { getImportTemplate } from "./importTemplates";

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
  /** Guide 2.8: the XML feed's own <catalog created_at="…"> from the last
   *  successful fetch — unchanged next time means "don't reprocess". */
  last_feed_created_at: string | null;
  /** Short human-readable outcome of the last run, shown in the table. */
  last_run_summary: string;
  created_at: string; updated_at: string;
};

export type ImportSourceInput = {
  name: string; feed_type: FeedType; template_id?: string | null; feed_url?: string | null;
};

const SELECT = `
  SELECT s.id::text, s.name, s.feed_type, s.template_id::text, t.name AS template_name,
         s.status, s.error_count, s.feed_url,
         s.last_run_at::text, s.next_run_at::text,
         s.last_feed_created_at, s.last_run_summary,
         s.created_at::text, s.updated_at::text
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

const MAX_FEED_BYTES = 20 * 1024 * 1024; // guide only ever discusses a few MB; a sane upper bound

async function fetchFeed(url: string): Promise<{ buf: Buffer; contentType: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Некоректний URL джерела");
  }
  // Guide 2.8 §"Технічні вимоги": HTTP/HTTPS only.
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("URL має бути HTTP або HTTPS");
  }
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Фід повернув HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_FEED_BYTES) throw new Error("Файл фіда завеликий (>20 МБ)");
  return { buf: Buffer.from(ab), contentType };
}

function looksLikeXmlFeed(url: string, contentType: string, buf: Buffer): boolean {
  if (/\.xml(\?|$)/i.test(url)) return true;
  if (contentType.includes("xml")) return true;
  const head = buf.subarray(0, 200).toString("utf8").trimStart();
  return head.startsWith("<?xml") || /^<catalog[\s>]/i.test(head);
}

export type RunSourceResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; matchedRows: number; unmatchedRows: number; productsCreated: number; variantsUpserted: number }
  | { ok: false; error: string };

async function markRun(id: string, status: SourceStatus, errorCount: number, summary: string, createdAt?: string | null): Promise<void> {
  await q(
    `UPDATE import_sources SET status=$2, error_count=$3, last_run_at=now(), last_run_summary=$4,
        last_feed_created_at = COALESCE($5, last_feed_created_at), updated_at=now()
      WHERE id=$1`,
    [Number(id), status, errorCount, summary, createdAt ?? null],
  );
}

/**
 * Guide 2.8: fetch a registered URL feed (XML or CSV/XLSX), skip reprocessing
 * if the XML feed's own created_at hasn't changed, otherwise parse and apply
 * through the same offers pipeline every manual import already uses (so
 * moderation gating, the is_in_stock mirror recompute, stock_movements
 * logging etc. all apply identically — see lib/stockImport.ts). Called both
 * by the admin's "Оновити зараз" button and by the cron-driven run-due route.
 */
export async function runImportSource(id: string): Promise<RunSourceResult> {
  const source = await getImportSource(id);
  if (!source) return { ok: false, error: "Джерело не знайдено" };
  if (source.feed_type !== "url" || !source.feed_url) {
    return { ok: false, error: "Це джерело не є URL-фідом" };
  }

  let buf: Buffer, contentType: string;
  try {
    ({ buf, contentType } = await fetchFeed(source.feed_url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка завантаження фіда";
    await markRun(id, "error", source.error_count + 1, msg);
    return { ok: false, error: msg };
  }

  const filename = source.feed_url.split("/").pop()?.split("?")[0] || "feed";
  const isXml = looksLikeXmlFeed(source.feed_url, contentType, buf);

  let parsed: Parsed;
  let newCreatedAt: string | null = null;
  if (isXml) {
    const text = buf.toString("utf8");
    newCreatedAt = extractXmlCreatedAt(text);
    if (newCreatedAt && newCreatedAt === source.last_feed_created_at) {
      const summary = "Без змін — файл не оновлювався з минулого разу";
      await markRun(id, "ok", 0, summary);
      return { ok: true, skipped: true, reason: summary };
    }
    const rows = parseXmlOffers(text);
    parsed = rows.length > 0 ? { kind: "offers", filename, rows } : { kind: "unknown", filename, rows: [] };
  } else if (source.template_id) {
    const tpl = await getImportTemplate(source.template_id);
    parsed = tpl ? await parseImportWithTemplate(buf, filename, tpl) : await parseImportSmart(buf, filename);
  } else {
    parsed = await parseImportSmart(buf, filename);
  }

  if (parsed.kind === "unknown") {
    const msg = "Не вдалося розпізнати формат фіда";
    await markRun(id, "error", source.error_count + 1, msg);
    return { ok: false, error: msg };
  }

  const result = await applyImport(parsed);
  const summary = `Застосовано: ${result.matchedRows} поз., ${result.productsCreated} нових товарів, ${result.variantsUpserted} оновлено пропозицій`;
  await markRun(id, "ok", result.unmatchedRows, summary, newCreatedAt);
  return {
    ok: true, skipped: false, matchedRows: result.matchedRows, unmatchedRows: result.unmatchedRows,
    productsCreated: result.productsCreated, variantsUpserted: result.variantsUpserted,
  };
}

/** Cron entry point (guide 2.8: "автоматично раз на три години") — runs
 *  every registered url-type source, best-effort (one bad feed shouldn't
 *  block the others). See /api/admin/import-sources/run-due. */
export async function runDueUrlSources(): Promise<{ ran: number; errors: number }> {
  const sources = await q<{ id: string }>("SELECT id::text FROM import_sources WHERE feed_type = 'url' AND feed_url <> ''");
  let errors = 0;
  for (const s of sources) {
    const r = await runImportSource(s.id).catch((e): RunSourceResult => ({ ok: false, error: e instanceof Error ? e.message : "Помилка" }));
    if (!r.ok) errors++;
  }
  return { ran: sources.length, errors };
}
