/**
 * Byte-identical copies of the same photo.
 *
 * The library holds 527 such groups — 1063 files, 44 MB. They are invisible in
 * a grid (they look like different photos of the same coat, because they are
 * the same photo) and they arrived honestly: before the picker could search the
 * whole library, re-uploading was the fastest way to reuse a photo you could
 * not find.
 *
 * Merging is not deletion. Every reference to the twins is repointed at the
 * kept file first, the old paths stay as redirects, and only then do the twins
 * go. Nothing on the storefront changes; what disappears is the ambiguity about
 * which of the four identical files a product actually shows.
 */
import { unlink } from "fs/promises";
import { pool } from "./pg";
import { fullPath, forgetMedia } from "./mediaIndex";
import { dropThumbs } from "./mediaThumbs";
import { pruneEmptyDirs, repointReferences } from "./mediaMove";
import { MEDIA_ROOT } from "./mediaStorage";
import path from "path";

export type DupFile = {
  path: string; bytes: number; width: number; height: number;
  folder: string; source: string; originalName: string; mtime: string | null;
  usedBy: { id: string; name: string; sku: string; kind: string }[];
};
export type DupGroup = { sha256: string; count: number; wasted: number; files: DupFile[] };

/**
 * Groups, newest-heaviest first, with who uses each copy.
 *
 * `wasted` is what merging the group would free: every copy but one.
 */
export async function listDuplicates(opts: { page: number; perPage: number }): Promise<{ groups: DupGroup[]; total: number; wasted: number }> {
  const offset = (opts.page - 1) * opts.perPage;

  const [totals] = (await pool.query(
    `SELECT count(*)::int AS groups, COALESCE(sum(extra), 0)::bigint AS wasted
       FROM (SELECT sum(bytes) - min(bytes) AS extra
               FROM media WHERE sha256 <> '' GROUP BY sha256 HAVING count(*) > 1) t`,
  )).rows;

  const shas = (await pool.query(
    `SELECT sha256, count(*)::int AS n, (sum(bytes) - min(bytes))::bigint AS extra
       FROM media WHERE sha256 <> ''
      GROUP BY sha256 HAVING count(*) > 1
      ORDER BY extra DESC, sha256
      LIMIT $1 OFFSET $2`,
    [opts.perPage, offset],
  )).rows as { sha256: string; n: number; extra: string }[];

  if (shas.length === 0) {
    return { groups: [], total: Number(totals?.groups ?? 0), wasted: Number(totals?.wasted ?? 0) };
  }

  const list = shas.map((s) => s.sha256);
  const files = (await pool.query(
    `SELECT sha256, path, bytes::bigint, width, height, folder, source, original_name, mtime
       FROM media WHERE sha256 = ANY($1::text[]) ORDER BY sha256, path`,
    [list],
  )).rows as {
    sha256: string; path: string; bytes: string; width: number; height: number;
    folder: string; source: string; original_name: string; mtime: string | null;
  }[];

  // Usage for exactly these paths, so a group can say which copy is the one
  // products actually point at — that is the copy worth keeping.
  const usage = (await pool.query(
    `SELECT p.id::text AS id, p.name, p.sku, split_part(img->>'src', '?', 1) AS src, 'product' AS kind
       FROM products p, jsonb_array_elements(p.images) AS img
      WHERE split_part(img->>'src', '?', 1) = ANY($1::text[])
     UNION ALL
     SELECT '', b.brand, '', split_part(b.logo_url, '?', 1), 'brand'
       FROM brand_logos b WHERE split_part(b.logo_url, '?', 1) = ANY($1::text[])`,
    [files.map((f) => f.path)],
  )).rows as { id: string; name: string; sku: string; src: string; kind: string }[];

  // Site content holds paths inside one jsonb blob, so it is matched by the
  // same regex pass the library uses. Leaving it out here would label a file
  // the homepage banner uses as "вільний" — the exact lie the library's usage
  // index was fixed to stop telling.
  const contentPaths = new Set(
    ((await pool.query(
      `SELECT DISTINCT split_part((regexp_matches(val::text, '(/(?:catalog|uploads)/[^"\\s\\\\]+)', 'g'))[1], '?', 1) AS src
         FROM content_store`,
    )).rows as { src: string }[]).map((r) => r.src),
  );

  const byPath = new Map<string, DupFile["usedBy"]>();
  for (const f of files) {
    if (contentPaths.has(f.path)) {
      byPath.set(f.path, [{ id: "", name: "Контент сайту", sku: "", kind: "content" }]);
    }
  }
  for (const u of usage) {
    const l = byPath.get(u.src) ?? [];
    if (!l.some((x) => x.name === u.name && x.kind === u.kind)) l.push({ id: u.id, name: u.name, sku: u.sku, kind: u.kind });
    byPath.set(u.src, l);
  }

  const groups: DupGroup[] = shas.map((s) => ({
    sha256: s.sha256,
    count: s.n,
    wasted: Number(s.extra),
    files: files
      .filter((f) => f.sha256 === s.sha256)
      .map((f) => ({
        path: f.path, bytes: Number(f.bytes), width: f.width, height: f.height,
        folder: f.folder, source: f.source, originalName: f.original_name, mtime: f.mtime,
        usedBy: byPath.get(f.path) ?? [],
      }))
      // The copy products already point at sorts first: it is the default keep,
      // and keeping it means the fewest references have to change.
      .sort((a, b) => b.usedBy.length - a.usedBy.length || a.path.localeCompare(b.path)),
  }));

  return { groups, total: Number(totals?.groups ?? 0), wasted: Number(totals?.wasted ?? 0) };
}

export type MergeResult = { kept: string; dropped: number; refs: number };

/**
 * Keep one copy, repoint everything at it, delete the rest.
 *
 * Refuses unless every path really is the same bytes as the kept one: merging
 * is irreversible for the files, and "looked similar in the grid" is not the
 * same claim as "identical sha256".
 */
export async function mergeDuplicates(keep: string, drop: string[]): Promise<MergeResult> {
  const targets = drop.filter((p) => p !== keep);
  if (targets.length === 0) return { kept: keep, dropped: 0, refs: 0 };

  const rows = (await pool.query(
    "SELECT path, sha256, id FROM media WHERE path = ANY($1::text[])",
    [[keep, ...targets]],
  )).rows as { path: string; sha256: string; id: string }[];

  const keeper = rows.find((r) => r.path === keep);
  if (!keeper) throw new Error(`Файла немає в бібліотеці: ${keep}`);
  if (!keeper.sha256) throw new Error("У файла немає хешу — спершу «Звірити з диском»");

  for (const t of targets) {
    const row = rows.find((r) => r.path === t);
    if (!row) throw new Error(`Файла немає в бібліотеці: ${t}`);
    if (row.sha256 !== keeper.sha256) throw new Error(`Не однакові файли: ${t}`);
  }

  const client = await pool.connect();
  let refs = 0;
  try {
    await client.query("BEGIN");
    for (const t of targets) {
      refs += await repointReferences(client, t, keep);
      // The twin's path keeps working: anything outside this database that
      // pointed at it — a marketplace feed, a search result — gets a redirect
      // to the copy that survived.
      await client.query(
        `INSERT INTO media_aliases (old_path, media_id) VALUES ($1, $2)
         ON CONFLICT (old_path) DO UPDATE SET media_id = EXCLUDED.media_id`,
        [t, keeper.id],
      );
      await client.query("UPDATE media_aliases SET media_id = $2 WHERE media_id = (SELECT id FROM media WHERE path = $1)", [t, keeper.id]);
      await client.query("DELETE FROM media WHERE path = $1", [t]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    throw e;
  }
  client.release();

  // Files go last and outside the transaction: a failed unlink must not undo a
  // correct rewrite, and a leftover file on disk is picked up by the next sync
  // as an untracked extra — noisy, but not wrong.
  for (const t of targets) {
    const abs = fullPath(t);
    if (abs) await unlink(abs).catch(() => {});
    await dropThumbs(t);
    await forgetMedia(t).catch(() => {});

    // Same tidy-up a move does: the directory a merged-away copy left behind
    // is litter — invisible in the tree, very visible over ssh and in backups.
    const sourceName = t.split("/")[1];
    if (abs) await pruneEmptyDirs(abs, path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, sourceName)).catch(() => {});
    const thumbAbs = path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, "thumb", "320", t.replace(/^\/+/, ""));
    await pruneEmptyDirs(thumbAbs, path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, "thumb")).catch(() => {});
  }

  return { kept: keep, dropped: targets.length, refs };
}
