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
  deep: boolean;          // folder filter covers subfolders too
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
    deep: sp.get("deep") === "1",
    term: (sp.get("q") ?? "").trim(),
    since: (sp.get("since") ?? "").trim() || null,
    urls: urlsParam ? urlsParam.split(",").map((u) => u.trim()).filter(Boolean) : null,
    sort: (["big", "name"].includes(sp.get("sort") ?? "") ? sp.get("sort") : "new") as MediaFilter["sort"],
  };
}

/**
 * Every place in the database that points at a file, not just product photos.
 *
 * "Вільне" was a lie worth 63 files: brand logos are stored as
 * /uploads/brands/x.png?v=2, and an exact path comparison never matched the
 * cache-buster, so every logo on the site counted as belonging to nobody. A
 * bulk "delete the free ones" would have taken the whole brand strip with it.
 *
 * Hence: strip the query string, and union in every column that holds a path.
 * One row per file — kinds are aggregated, because a file joined twice would
 * silently duplicate rows in the grid.
 */
export const USED_SRC_CTE = `
  used AS (
    SELECT split_part(src, '?', 1) AS src, string_agg(DISTINCT kind, ',') AS kinds
      FROM (
        SELECT img->>'src' AS src, 'product' AS kind
          FROM products p, jsonb_array_elements(p.images) AS img
        UNION ALL
        SELECT image_src, 'product' FROM products WHERE image_src <> ''
        UNION ALL
        SELECT logo_url, 'brand' FROM brand_logos WHERE logo_url <> ''
        UNION ALL
        -- Site content is one jsonb blob of unknown shape; pulling paths out of
        -- its text is the only way that keeps working when the shape changes.
        SELECT (regexp_matches(val::text, '(/(?:catalog|uploads)/[^"\\s\\\\]+)', 'g'))[1], 'content'
          FROM content_store
      ) s
     WHERE src LIKE '/uploads/%' OR src LIKE '/catalog/%'
     GROUP BY split_part(src, '?', 1)
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
    if (f.folder !== null) {
      // A tree node means "this folder", but the useful question while browsing
      // a tree is usually "this folder and everything under it" — otherwise
      // clicking a parent that only holds subfolders shows an empty grid.
      if (f.deep && f.folder !== "") {
        const v = push(f.folder);
        where.push(`(m.folder = ${v} OR m.folder LIKE ${v} || '/%')`);
      } else if (f.deep && f.folder === "") {
        // deep on a root is no filter at all
      } else {
        where.push(`m.folder = ${push(f.folder)}`);
      }
    }
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

export type MediaUsage = { id: string; name: string; sku: string; kind?: "product" | "brand" | "content" };

/**
 * Which products point at which image, for a given set of paths.
 *
 * Scoped to the rows being rendered rather than the whole catalog: the unscoped
 * version expanded every product's images array on every request.
 */
export async function usageFor(paths: string[]): Promise<Map<string, MediaUsage[]>> {
  const map = new Map<string, MediaUsage[]>();
  if (paths.length === 0) return map;
  // Products carry a link worth following (id → card); a brand or a content
  // block just needs to say "занято, ось ким" so nobody deletes it by mistake.
  const rows = await q<{ id: string; name: string; sku: string; src: string; kind: string }>(
    `SELECT p.id::text, p.name, p.sku, split_part(img->>'src', '?', 1) AS src, 'product' AS kind
       FROM products p, jsonb_array_elements(p.images) AS img
      WHERE split_part(img->>'src', '?', 1) = ANY($1::text[])
     UNION ALL
     SELECT '', p.name, p.sku, split_part(p.image_src, '?', 1), 'product'
       FROM products p
      WHERE p.image_src <> '' AND split_part(p.image_src, '?', 1) = ANY($1::text[])
     UNION ALL
     SELECT '', b.brand, '', split_part(b.logo_url, '?', 1), 'brand'
       FROM brand_logos b
      WHERE b.logo_url <> '' AND split_part(b.logo_url, '?', 1) = ANY($1::text[])`,
    [paths],
  );
  for (const r of rows) {
    const list = map.get(r.src) ?? [];
    const entry: MediaUsage = { id: r.id, name: r.name, sku: r.sku, kind: r.kind as MediaUsage["kind"] };
    // Same product reached through both images[] and image_src is one user.
    if (!list.some((u) => u.name === entry.name && u.kind === entry.kind)) list.push(entry);
    map.set(r.src, list);
  }

  // Content blocks live in a single jsonb document, so they are matched in the
  // same regex pass the used/free filter uses rather than by a join.
  const contentRows = await q<{ src: string }>(
    `SELECT DISTINCT split_part((regexp_matches(val::text, '(/(?:catalog|uploads)/[^"\\s\\\\]+)', 'g'))[1], '?', 1) AS src
       FROM content_store`,
  );
  for (const r of contentRows) {
    if (!paths.includes(r.src)) continue;
    const list = map.get(r.src) ?? [];
    if (!list.some((u) => u.kind === "content")) list.push({ id: "", name: "Контент сайту", sku: "", kind: "content" });
    map.set(r.src, list);
  }

  return map;
}

export type MediaRow = {
  path: string; source: "uploads" | "catalog"; folder: string; original_name: string;
  bytes: string; width: number; height: number; alt: string; title: string;
  mtime: string | null; created_at: string; sha256: string; dup_count: number;
};

/** Rows matching a filter. `limit: null` for an export that must cover everything. */
export async function selectMedia(f: MediaFilter, opts: { limit: number | null; offset?: number; withTotal?: boolean }) {
  const { ctes, where, params, order } = buildMediaQuery(f);
  const totalCol = opts.withTotal ? ", (count(*) OVER ())::text AS total" : "";
  const paging = opts.limit === null ? "" : `LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}`;
  // dup_count travels with the row so the list can mark twins without a second
  // request per file. Grouping the whole table costs one pass; asking per file
  // would be one query per rendered row.
  const withDups = `${ctes.join(",")},
  dups AS (
    SELECT sha256, count(*)::int AS n FROM media WHERE sha256 <> '' GROUP BY sha256 HAVING count(*) > 1
  )`;
  return q<MediaRow & { total?: string }>(
    `WITH ${withDups}
     SELECT m.path, m.source, m.folder, m.original_name, m.bytes::text, m.width, m.height,
            m.alt, m.title, m.mtime, m.created_at, m.sha256,
            COALESCE(d.n, 0) AS dup_count${totalCol}
       FROM media m
       LEFT JOIN used u ON u.src = m.path
       LEFT JOIN dups d ON d.sha256 = m.sha256 AND m.sha256 <> ''
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

/**
 * Totals for the current filter, not the whole library.
 *
 * The chips above the grid answer "how big is the library"; this answers "what
 * am I looking at right now" — which is the question you actually have when you
 * have clicked into a branch and are deciding whether anything in it can go.
 */
export async function mediaSummary(f: MediaFilter) {
  const { ctes, where, params } = buildMediaQuery(f);
  const [r] = await q<{ files: string; bytes: string; free: string; dups: string; folders: string }>(
    `WITH ${ctes.join(",")},
     dups AS (
       SELECT sha256 FROM media WHERE sha256 <> '' GROUP BY sha256 HAVING count(*) > 1
     )
     SELECT count(*)::text AS files,
            COALESCE(sum(m.bytes), 0)::text AS bytes,
            count(*) FILTER (WHERE u.src IS NULL)::text AS free,
            count(*) FILTER (WHERE d.sha256 IS NOT NULL)::text AS dups,
            count(DISTINCT m.folder)::text AS folders
       FROM media m
       LEFT JOIN used u ON u.src = m.path
       LEFT JOIN dups d ON d.sha256 = m.sha256
       ${where}`,
    params,
  );
  return {
    files: Number(r?.files ?? 0),
    bytes: Number(r?.bytes ?? 0),
    free: Number(r?.free ?? 0),
    dups: Number(r?.dups ?? 0),
    folders: Number(r?.folders ?? 0),
  };
}
