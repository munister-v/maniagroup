/**
 * One filter, three callers.
 *
 * The grid, the Excel export and the bulk actions all have to mean exactly the
 * same thing by "каталог, вільні, за назвою товару". When each built its own
 * WHERE clause they drifted: an export that quietly covers a different set than
 * the grid the admin was looking at is worse than no export, because nothing on
 * screen says the two disagree.
 */
import { q } from "./pg";

export type MediaFilter = {
  source: "all" | "uploads" | "catalog";
  usage: "all" | "used" | "free";
  folder: string | null;
  term: string;
  since: string | null;   // ISO date — only files added/changed after it ("нові")
  urls: string[] | null;  // explicit selection, overrides everything else
  sort: "new" | "big" | "name";
};

export function parseMediaFilter(sp: URLSearchParams): MediaFilter {
  const urlsParam = sp.get("urls");
  return {
    source: (["uploads", "catalog"].includes(sp.get("source") ?? "") ? sp.get("source") : "all") as MediaFilter["source"],
    usage: (["used", "free"].includes(sp.get("usage") ?? "") ? sp.get("usage") : "all") as MediaFilter["usage"],
    folder: sp.get("folder"),
    term: (sp.get("q") ?? "").trim(),
    since: (sp.get("since") ?? "").trim() || null,
    urls: urlsParam ? urlsParam.split(",").map((u) => u.trim()).filter(Boolean) : null,
    sort: (["big", "name"].includes(sp.get("sort") ?? "") ? sp.get("sort") : "new") as MediaFilter["sort"],
  };
}

/** Every image path the catalog currently points at. Drives the used/free split. */
export const USED_SRC_CTE = `
  used AS (
    SELECT DISTINCT img->>'src' AS src
      FROM products p, jsonb_array_elements(p.images) AS img
     WHERE img->>'src' LIKE '/uploads/%' OR img->>'src' LIKE '/catalog/%'
  )`;

export type BuiltQuery = { ctes: string[]; where: string; params: unknown[]; order: string };

export function buildMediaQuery(f: MediaFilter): BuiltQuery {
  const where: string[] = [];
  const params: unknown[] = [];
  const ctes = [USED_SRC_CTE];
  const push = (v: unknown) => { params.push(v); return `$${params.length}`; };

  // An explicit selection is an answer, not a filter: when the admin ticked
  // twelve boxes, that is the set, whatever the chips above happen to say.
  if (f.urls) {
    where.push(`m.path = ANY(${push(f.urls)}::text[])`);
  } else {
    if (f.source !== "all") where.push(`m.source = ${push(f.source)}`);
    if (f.folder !== null) where.push(`m.folder = ${push(f.folder)}`);
    if (f.usage === "used") where.push("u.src IS NOT NULL");
    if (f.usage === "free") where.push("u.src IS NULL");
    if (f.since) where.push(`COALESCE(m.mtime, m.created_at) >= ${push(f.since)}::timestamptz`);
    if (f.term) {
      // Searchable by filename, by the product it belongs to, and by SKU — the
      // three things an admin actually remembers about a photo. The product half
      // resolves once into a CTE; as a correlated EXISTS it re-expanded every
      // product's images array for each of the 13.7k rows.
      const like = push(`%${f.term}%`);
      ctes.push(`
  matched AS (
    SELECT DISTINCT img->>'src' AS src
      FROM products p, jsonb_array_elements(p.images) AS img
     WHERE p.name ILIKE ${like} OR p.sku ILIKE ${like}
  )`);
      where.push(`(m.path ILIKE ${like} OR m.original_name ILIKE ${like} OR m.path IN (SELECT src FROM matched))`);
    }
  }

  const order =
    f.sort === "big" ? "m.bytes DESC" :
    f.sort === "name" ? "m.original_name ASC, m.path ASC" :
    "m.mtime DESC NULLS LAST";

  return { ctes, where: where.length ? `WHERE ${where.join(" AND ")}` : "", params, order };
}

export type MediaUsage = { id: string; name: string; sku: string };

/**
 * Which products point at which image, for a given set of paths.
 *
 * Scoped to the rows being rendered rather than the whole catalog: the unscoped
 * version expanded every product's images array on every request.
 */
export async function usageFor(paths: string[]): Promise<Map<string, MediaUsage[]>> {
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

export type MediaRow = {
  path: string; source: "uploads" | "catalog"; folder: string; original_name: string;
  bytes: string; width: number; height: number; alt: string; title: string;
  mtime: string | null; created_at: string;
};

/** Rows matching a filter. `limit: null` for an export that must cover everything. */
export async function selectMedia(f: MediaFilter, opts: { limit: number | null; offset?: number; withTotal?: boolean }) {
  const { ctes, where, params, order } = buildMediaQuery(f);
  const totalCol = opts.withTotal ? ", (count(*) OVER ())::text AS total" : "";
  const paging = opts.limit === null ? "" : `LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}`;
  return q<MediaRow & { total?: string }>(
    `WITH ${ctes.join(",")}
     SELECT m.path, m.source, m.folder, m.original_name, m.bytes::text, m.width, m.height,
            m.alt, m.title, m.mtime, m.created_at${totalCol}
       FROM media m LEFT JOIN used u ON u.src = m.path
       ${where}
      ORDER BY ${order}
      ${paging}`,
    params,
  );
}

/** Library-wide totals for the filter chips (deliberately ignores the filters). */
export async function mediaCounts() {
  const [c] = await q<{ all: string; uploads: string; catalog: string; used: string; free: string }>(
    `WITH ${USED_SRC_CTE}
     SELECT count(*)::text AS all,
            count(*) FILTER (WHERE m.source = 'uploads')::text AS uploads,
            count(*) FILTER (WHERE m.source = 'catalog')::text AS catalog,
            count(*) FILTER (WHERE u.src IS NOT NULL)::text AS used,
            count(*) FILTER (WHERE u.src IS NULL)::text AS free
       FROM media m LEFT JOIN used u ON u.src = m.path`,
  );
  return {
    all: Number(c?.all ?? 0), uploads: Number(c?.uploads ?? 0), catalog: Number(c?.catalog ?? 0),
    used: Number(c?.used ?? 0), free: Number(c?.free ?? 0),
  };
}
