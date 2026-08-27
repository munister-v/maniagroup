import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { unlink } from "fs/promises";
import path from "path";
import { forgetMedia, fullPath, IMAGE_RE, syncMediaIndex } from "@/lib/mediaIndex";

export type MediaUsage = { id: string; name: string; sku: string };
export type MediaSource = "uploads" | "catalog";

/**
 * Which products point at which image, for a given set of paths.
 *
 * Scoped to the page being rendered (48 paths) rather than the whole catalog:
 * the unscoped version expanded every product's images array on every request.
 */
async function usageFor(paths: string[]): Promise<Map<string, MediaUsage[]>> {
  const map = new Map<string, MediaUsage[]>();
  if (paths.length === 0) return map;
  const rows = await q<{ id: string; name: string; sku: string; src: string }>(
    `SELECT p.id::text, p.name, p.sku, img->>'src' AS src
       FROM products p, jsonb_array_elements(p.images) AS img
      WHERE img->>'src' = ANY($1::text[])`,
    [paths],
  );
  for (const r of rows) {
    const list = map.get(r.src) ?? [];
    if (!list.some((u) => u.id === r.id)) list.push({ id: r.id, name: r.name, sku: r.sku });
    map.set(r.src, list);
  }
  return map;
}

/** Every image path the catalog currently points at. Used for the used/free filter. */
const USED_SRC_CTE = `
  used AS (
    SELECT DISTINCT img->>'src' AS src
      FROM products p, jsonb_array_elements(p.images) AS img
     WHERE img->>'src' LIKE '/uploads/%' OR img->>'src' LIKE '/catalog/%'
  )`;

/**
 * GET — the media library, filtered, counted and paginated in Postgres.
 *
 * This used to readdir() the whole 13.5k-file library on every keystroke and
 * filter in JS. Now the index table answers it, so the cost is one indexed
 * query per request instead of one directory walk.
 *
 *   ?source=all|uploads|catalog  ?usage=all|used|free  ?folder=  ?q=
 *   ?sort=new|big|name  ?page=  ?perPage=
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const source = sp.get("source") ?? "all";
  const usageFilter = sp.get("usage") ?? "all";
  const folder = sp.get("folder");
  const term = (sp.get("q") ?? "").trim();
  const sort = sp.get("sort") ?? "new";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const perPage = Math.min(200, Math.max(1, Number(sp.get("perPage")) || 48));

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("$?", `$${params.length}`));
  };

  if (source === "uploads" || source === "catalog") add("m.source = $?", source);
  if (folder !== null) add("m.folder = $?", folder);
  if (usageFilter === "used") where.push("u.src IS NOT NULL");
  if (usageFilter === "free") where.push("u.src IS NULL");
  // Searchable by filename, by the product it belongs to, and by SKU — the
  // three things an admin actually remembers about a photo. The product half
  // is resolved once into a CTE rather than as a correlated EXISTS: correlated,
  // it re-expands every product's images array for each of the 13.5k rows.
  const ctes = [USED_SRC_CTE];
  if (term) {
    params.push(`%${term}%`);
    const like = `$${params.length}`;
    ctes.push(`
  matched AS (
    SELECT DISTINCT img->>'src' AS src
      FROM products p, jsonb_array_elements(p.images) AS img
     WHERE p.name ILIKE ${like} OR p.sku ILIKE ${like}
  )`);
    where.push(`(m.path ILIKE ${like} OR m.original_name ILIKE ${like} OR m.path IN (SELECT src FROM matched))`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order =
    sort === "big" ? "m.bytes DESC" :
    sort === "name" ? "m.original_name ASC, m.path ASC" :
    "m.mtime DESC NULLS LAST";

  const base = `FROM media m LEFT JOIN used u ON u.src = m.path ${whereSql}`;

  const rows = await q<{
    path: string; source: MediaSource; folder: string; original_name: string;
    bytes: string; width: number; height: number; alt: string; title: string;
    mtime: string | null; total: string;
  }>(
    `WITH ${ctes.join(",")}
     SELECT m.path, m.source, m.folder, m.original_name, m.bytes::text, m.width, m.height,
            m.alt, m.title, m.mtime, (count(*) OVER ())::text AS total
       ${base}
      ORDER BY ${order}
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params,
  );

  // Counts describe the whole library, not the current page, so the filter
  // chips can say how much each filter would show.
  const [counts] = await q<{ all: string; uploads: string; catalog: string; used: string; free: string }>(
    `WITH ${USED_SRC_CTE}
     SELECT count(*)::text AS all,
            count(*) FILTER (WHERE m.source = 'uploads')::text AS uploads,
            count(*) FILTER (WHERE m.source = 'catalog')::text AS catalog,
            count(*) FILTER (WHERE u.src IS NOT NULL)::text AS used,
            count(*) FILTER (WHERE u.src IS NULL)::text AS free
       FROM media m LEFT JOIN used u ON u.src = m.path`,
  );

  const usage = await usageFor(rows.map((r) => r.path));

  const files = rows.map((r) => ({
    url: r.path,
    name: r.original_name || (r.source === "catalog" ? r.path.replace("/catalog/", "") : path.basename(r.path)),
    source: r.source,
    folder: r.folder,
    size: Number(r.bytes),
    width: r.width,
    height: r.height,
    alt: r.alt,
    title: r.title,
    mtime: r.mtime ? new Date(r.mtime).getTime() : 0,
    usedBy: usage.get(r.path) ?? [],
  }));

  return NextResponse.json({
    files,
    total: Number(rows[0]?.total ?? 0),
    page,
    perPage,
    counts: {
      all: Number(counts?.all ?? 0),
      uploads: Number(counts?.uploads ?? 0),
      catalog: Number(counts?.catalog ?? 0),
      used: Number(counts?.used ?? 0),
      free: Number(counts?.free ?? 0),
    },
  });
}

/**
 * POST { action: "sync" } — reconcile the index with the disk.
 *
 * Files also arrive by routes that never touch this table (the WordPress photo
 * migration writes straight into /catalog), so the index needs a way to catch
 * up. Bounded per call; the caller repeats until nothing changes.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string; limit?: number; withHash?: boolean };
  if (body.action !== "sync") return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
  const stats = await syncMediaIndex({
    limit: Math.min(2000, Math.max(50, body.limit ?? 500)),
    withHash: body.withHash ?? true,
  });
  return NextResponse.json({ ok: true, ...stats });
}

/** DELETE ?name=… (uploads) or ?url=/catalog/<id>/<file> — refuses if in use. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const sp = new URL(req.url).searchParams;

  // Two call shapes: the original ?name= (uploads only) and ?url= for anything
  // in the library. Both resolve to a path that must stay inside MEDIA_ROOT.
  const rawUrl = sp.get("url");
  const rawName = sp.get("name");
  let rel: string;
  if (rawUrl) {
    rel = rawUrl;
  } else if (rawName) {
    rel = `/uploads/${path.basename(rawName)}`;
  } else {
    return NextResponse.json({ error: "Не вказано файл" }, { status: 400 });
  }

  if (!/^\/(uploads|catalog)\//.test(rel) || rel.includes("..") || !IMAGE_RE.test(rel)) {
    return NextResponse.json({ error: "Невірний шлях" }, { status: 400 });
  }
  const full = fullPath(rel);
  if (!full) {
    return NextResponse.json({ error: "Невірний шлях" }, { status: 400 });
  }

  // Deleting a file a product still shows leaves a broken image on the
  // storefront. Refuse unless the caller insists, and name the products so the
  // confirmation can be specific instead of a vague "якщо використовується".
  if (sp.get("force") !== "1") {
    let inUse: MediaUsage[] = [];
    try { inUse = (await usageFor([rel])).get(rel) ?? []; } catch { /* allow */ }
    if (inUse.length > 0) {
      return NextResponse.json({ error: "Файл використовується", usedBy: inUse }, { status: 409 });
    }
  }

  try {
    await unlink(full);
  } catch {
    // A row pointing at a file that is already gone is exactly what the index
    // should drop, so clean up before reporting.
    await forgetMedia(rel).catch(() => {});
    return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });
  }
  await forgetMedia(rel).catch(() => {});
  return NextResponse.json({ ok: true });
}
