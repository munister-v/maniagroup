import { q, q1 } from "./pg";
import { createHash } from "node:crypto";
import { applyImport, extractXmlCreatedAt, parseImportSmart, parseImportWithTemplate, parseXmlOffers, previewImport, type ImportPreview, type Parsed, type StockImportMode } from "./stockImport";
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
  stock_mode: StockImportMode;
  template_id: string | null; template_name?: string | null;
  status: SourceStatus; error_count: number; feed_url: string | null;
  last_run_at: string | null; next_run_at: string | null;
  enabled: boolean; interval_minutes: number; running_at: string | null;
  /** Guide 2.8: the XML feed's own <catalog created_at="…"> from the last
   *  successful fetch — unchanged next time means "don't reprocess". */
  last_feed_created_at: string | null;
  last_feed_signature: string | null;
  last_duration_ms: number | null;
  /** Short human-readable outcome of the last run, shown in the table. */
  last_run_summary: string;
  created_at: string; updated_at: string;
};

export type ImportSourceInput = {
  name: string; feed_type: FeedType; template_id?: string | null; feed_url?: string | null;
  stock_mode?: StockImportMode;
  enabled?: boolean; interval_minutes?: number;
};

export const IMPORT_INTERVALS = [30, 60, 180, 360, 720, 1440] as const;

function safeInterval(value: number | undefined): number {
  const n = Number(value ?? 180);
  return (IMPORT_INTERVALS as readonly number[]).includes(n) ? n : 180;
}

const SELECT = `
  SELECT s.id::text, s.name, s.feed_type, s.stock_mode, s.template_id::text, t.name AS template_name,
         s.status, s.error_count, s.feed_url,
         s.last_run_at::text, s.next_run_at::text,
         s.enabled, s.interval_minutes, s.running_at::text,
         s.last_feed_created_at, s.last_feed_signature, s.last_duration_ms, s.last_run_summary,
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
    `INSERT INTO import_sources
       (name, feed_type, template_id, feed_url, stock_mode, enabled, interval_minutes, next_run_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $2='url' AND $6 THEN now() ELSE NULL END)
     RETURNING id::text`,
    [input.name.trim(), input.feed_type, input.template_id ? Number(input.template_id) : null, input.feed_url || null,
      input.stock_mode ?? "patch", input.enabled !== false, safeInterval(input.interval_minutes)],
  );
  return { id: row!.id };
}

export async function updateImportSource(id: string, input: ImportSourceInput): Promise<void> {
  await q(
    `UPDATE import_sources
        SET name=$2, feed_type=$3, template_id=$4, feed_url=$5, stock_mode=$6,
            enabled=$7, interval_minutes=$8,
            next_run_at=CASE WHEN $3='url' AND $7 THEN now() ELSE NULL END,
            updated_at=now()
      WHERE id=$1`,
    [Number(id), input.name.trim(), input.feed_type, input.template_id ? Number(input.template_id) : null, input.feed_url || null,
      input.stock_mode ?? "patch", input.enabled !== false, safeInterval(input.interval_minutes)],
  );
}

export async function setImportSourceEnabled(id: string, enabled: boolean): Promise<void> {
  await q(
    `UPDATE import_sources SET enabled=$2, next_run_at=CASE WHEN $2 THEN now() ELSE NULL END,
       running_at=NULL, updated_at=now() WHERE id=$1`,
    [Number(id), enabled],
  );
}

export async function deleteImportSource(id: string): Promise<void> {
  await q("DELETE FROM import_sources WHERE id = $1", [Number(id)]);
}

/**
 * Called from the upload/apply path so every file import shows up in the
 * registry — matched by exact name (the filename), created on first sight.
 * `summary` was previously never passed (the Результат column stayed
 * permanently "—" for every file-based source — only the newer URL-feed
 * path via runImportSource ever populated it), so a file import that
 * genuinely applied changes looked identical to one that touched nothing.
 */
export async function recordSourceRun(
  name: string, templateId: string | null, ok: boolean, errorCount: number, summary = "",
): Promise<void> {
  const existing = await q1<{ id: string }>("SELECT id::text FROM import_sources WHERE name = $1", [name]);
  const status: SourceStatus = ok ? "ok" : "error";
  if (existing) {
    await q(
      `UPDATE import_sources SET status=$2, error_count=$3, template_id=COALESCE($4, template_id),
          last_run_at=now(), last_run_summary=$5, updated_at=now() WHERE id=$1`,
      [Number(existing.id), status, errorCount, templateId ? Number(templateId) : null, summary],
    );
  } else {
    await q(
      `INSERT INTO import_sources (name, feed_type, template_id, status, error_count, last_run_at, last_run_summary)
       VALUES ($1,'file',$2,$3,$4,now(),$5)`,
      [name, templateId ? Number(templateId) : null, status, errorCount, summary],
    );
  }
}

const MAX_FEED_BYTES = 20 * 1024 * 1024;
const FEED_TIMEOUT_MS = 20_000;

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
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Фід повернув HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  const announcedSize = Number(res.headers.get("content-length") ?? 0);
  if (announcedSize > MAX_FEED_BYTES) throw new Error("Файл фіда завеликий (>20 МБ)");
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
  | { ok: true; skipped: false; matchedRows: number; unmatchedRows: number; productsCreated: number; variantsUpserted: number; zeroedRows: number }
  | { ok: false; error: string };

export type TestSourceResult = {
  ok: true; filename: string; format: "XML" | "CSV / Excel"; bytes: number;
  createdAt: string | null; preview: ImportPreview;
};

type ParsedFeed = {
  parsed: Parsed; filename: string; format: "XML" | "CSV / Excel";
  createdAt: string | null; signature: string; bytes: number;
};

async function parseFetchedSource(source: ImportSource, buf: Buffer, contentType: string): Promise<ParsedFeed> {
  const filename = source.feed_url?.split("/").pop()?.split("?")[0] || "feed";
  const isXml = looksLikeXmlFeed(source.feed_url ?? "", contentType, buf);
  const signature = createHash("sha256").update(buf).digest("hex");
  let parsed: Parsed;
  let createdAt: string | null = null;

  if (isXml) {
    const text = buf.toString("utf8");
    createdAt = extractXmlCreatedAt(text);
    const rows = parseXmlOffers(text);
    parsed = rows.length > 0 ? { kind: "offers", filename, rows } : { kind: "unknown", filename, rows: [] };
  } else if (source.template_id) {
    const tpl = await getImportTemplate(source.template_id);
    parsed = tpl ? await parseImportWithTemplate(buf, filename, tpl) : await parseImportSmart(buf, filename);
  } else {
    parsed = await parseImportSmart(buf, filename);
  }

  return { parsed, filename, format: isXml ? "XML" : "CSV / Excel", createdAt, signature, bytes: buf.byteLength };
}

async function markRun(
  id: string, status: SourceStatus, errorCount: number, summary: string,
  durationMs: number, createdAt?: string | null, signature?: string | null,
): Promise<void> {
  await q(
    `UPDATE import_sources SET status=$2, error_count=$3, last_run_at=now(), last_run_summary=$4,
        last_duration_ms=$5, last_feed_created_at=COALESCE($6, last_feed_created_at),
        last_feed_signature=COALESCE($7, last_feed_signature), running_at=NULL,
        next_run_at=CASE WHEN enabled AND feed_type='url'
          THEN now() + (interval_minutes || ' minutes')::interval ELSE NULL END,
        updated_at=now()
      WHERE id=$1`,
    [Number(id), status, errorCount, summary, durationMs, createdAt ?? null, signature ?? null],
  );
}

async function claimSource(id: string, manual: boolean): Promise<boolean> {
  const claimed = await q1<{ id: string }>(
    `UPDATE import_sources SET running_at=now(), updated_at=now()
      WHERE id=$1 AND ($2 OR enabled)
        AND (running_at IS NULL OR running_at < now() - interval '30 minutes')
      RETURNING id::text`,
    [Number(id), manual],
  );
  return !!claimed;
}

/** Fetch, parse and compare against the live catalogue without writing. */
export async function testImportSource(id: string): Promise<TestSourceResult | { ok: false; error: string }> {
  const source = await getImportSource(id);
  if (!source) return { ok: false, error: "Джерело не знайдено" };
  if (source.feed_type !== "url" || !source.feed_url) return { ok: false, error: "Додайте URL фіда" };
  try {
    const { buf, contentType } = await fetchFeed(source.feed_url);
    const feed = await parseFetchedSource(source, buf, contentType);
    if (feed.parsed.kind === "unknown") return { ok: false, error: "Файл завантажився, але колонки не розпізнано" };
    const preview = await previewImport(feed.parsed, {
      stockMode: source.stock_mode, sourceId: Number(source.id), sourceName: source.name,
    });
    return { ok: true, filename: feed.filename, format: feed.format, bytes: feed.bytes, createdAt: feed.createdAt, preview };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не вдалося перевірити фід";
    return { ok: false, error: message.includes("timeout") ? "Сервер постачальника не відповів за 20 секунд" : message };
  }
}

/**
 * Guide 2.8: fetch a registered URL feed (XML or CSV/XLSX), skip reprocessing
 * if the XML feed's own created_at hasn't changed, otherwise parse and apply
 * through the same offers pipeline every manual import already uses (so
 * moderation gating, the is_in_stock mirror recompute, stock_movements
 * logging etc. all apply identically — see lib/stockImport.ts). Called both
 * by the admin's "Оновити зараз" button and by the cron-driven run-due route.
 */
export async function runImportSource(id: string, options: { manual?: boolean } = {}): Promise<RunSourceResult> {
  const source = await getImportSource(id);
  if (!source) return { ok: false, error: "Джерело не знайдено" };
  if (source.feed_type !== "url" || !source.feed_url) {
    return { ok: false, error: "Це джерело не є URL-фідом" };
  }
  if (!(await claimSource(id, options.manual === true))) {
    return { ok: true, skipped: true, reason: source.enabled ? "Синхронізація вже виконується" : "Джерело призупинено" };
  }

  const startedAt = Date.now();
  try {
    const { buf, contentType } = await fetchFeed(source.feed_url);
    const feed = await parseFetchedSource(source, buf, contentType);
    if (feed.signature === source.last_feed_signature) {
      const summary = "Без змін — файл не оновлювався з минулого разу";
      await markRun(id, "ok", 0, summary, Date.now() - startedAt, feed.createdAt, feed.signature);
      return { ok: true, skipped: true, reason: summary };
    }
    if (feed.parsed.kind === "unknown") throw new Error("Не вдалося розпізнати формат фіда");

    const result = await applyImport(feed.parsed, {
      stockMode: source.stock_mode, sourceId: Number(source.id), sourceName: source.name,
    });
    const summary = `Застосовано: ${result.matchedRows} поз., ${result.productsCreated} нових товарів, ${result.variantsUpserted} оновлено пропозицій${result.zeroedRows ? `, ${result.zeroedRows} обнулено` : ""}${result.unmatchedRows ? `, ${result.unmatchedRows} не знайдено` : ""}`;
    await markRun(id, "ok", 0, summary, Date.now() - startedAt, feed.createdAt, feed.signature);
    return {
      ok: true, skipped: false, matchedRows: result.matchedRows, unmatchedRows: result.unmatchedRows,
      productsCreated: result.productsCreated, variantsUpserted: result.variantsUpserted, zeroedRows: result.zeroedRows,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Помилка синхронізації";
    const message = raw.includes("timeout") ? "Сервер постачальника не відповів за 20 секунд" : raw;
    await markRun(id, "error", source.error_count + 1, message.slice(0, 240), Date.now() - startedAt);
    return { ok: false, error: message };
  }
}

/** Cron entry point (guide 2.8: "автоматично раз на три години") — runs
 *  every registered url-type source, best-effort (one bad feed shouldn't
 *  block the others). See /api/admin/import-sources/run-due. */
export async function runDueUrlSources(): Promise<{ ran: number; errors: number }> {
  const sources = await q<{ id: string }>(
    `SELECT id::text FROM import_sources
      WHERE feed_type='url' AND feed_url <> '' AND enabled
        AND (next_run_at IS NULL OR next_run_at <= now())
      ORDER BY next_run_at NULLS FIRST`,
  );
  let errors = 0;
  for (const s of sources) {
    const r = await runImportSource(s.id).catch((e): RunSourceResult => ({ ok: false, error: e instanceof Error ? e.message : "Помилка" }));
    if (!r.ok) errors++;
  }
  return { ran: sources.length, errors };
}
