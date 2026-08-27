/**
 * Moving a file between real folders.
 *
 * Real folders were the explicit ask, and they are the one operation in this
 * library that can break the storefront: a path is not a label, it is a value
 * copied into products.images, into brand_logos.logo_url with a ?v= suffix,
 * into the site-content blob, and into Google's index. Renaming the file
 * without rewriting all of those leaves broken images on live product cards.
 *
 * So a move is one transaction over every reference plus the row, the file and
 * its thumb, and the old path is remembered in media_aliases — links that live
 * outside this database (a customer's open tab, a search result, a marketplace
 * feed) get a redirect instead of a 404.
 */
import { rename, mkdir, rm, rmdir, stat } from "fs/promises";
import path from "path";
import { pool } from "./pg";
import { MEDIA_ROOT } from "./mediaStorage";
import { fullPath } from "./mediaIndex";
import { thumbFile, THUMB_SIZE } from "./mediaThumbs";

/** Folder names are directory names on a real disk. Keep them boring. */
export function validFolder(folder: string): boolean {
  if (folder === "") return true; // the source root
  if (folder.length > 120) return false;
  if (folder.includes("..") || folder.startsWith("/") || folder.endsWith("/")) return false;
  return folder.split("/").every((seg) => /^[A-Za-z0-9._Ѐ-ӿ-]+$/.test(seg) && seg !== "." && seg !== "..");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** /catalog/12/3.webp + folder "нове" → /catalog/нове/3.webp */
function targetPath(src: string, folder: string): string {
  const [, source, ...rest] = src.split("/");
  const base = rest[rest.length - 1];
  return folder ? `/${source}/${folder}/${base}` : `/${source}/${base}`;
}

/** Never overwrite: two files called 1.webp from two product folders collide. */
async function freeName(candidate: string): Promise<string> {
  const abs = fullPath(candidate);
  if (!abs) throw new Error("bad target");
  if (!(await stat(abs).catch(() => null))) return candidate;
  const ext = path.extname(candidate);
  const stem = candidate.slice(0, -ext.length);
  for (let i = 2; i < 500; i++) {
    const next = `${stem}-${i}${ext}`;
    const nextAbs = fullPath(next);
    if (nextAbs && !(await stat(nextAbs).catch(() => null))) return next;
  }
  throw new Error("не вдалося підібрати вільне ім'я");
}

/**
 * Remove the directory a file just left, and its now-childless parents.
 *
 * rmdir refuses a non-empty directory, which is exactly the guard wanted here:
 * try, and stop at the first one that still holds something. Without this a
 * renamed folder leaves its old skeleton on disk — invisible in the tree (which
 * is built from the index) but very visible over SSH and in backups.
 */
async function pruneEmptyDirs(fileAbs: string, sourceRoot: string): Promise<void> {
  let dir = path.dirname(fileAbs);
  const stop = path.normalize(sourceRoot);
  while (dir.startsWith(stop + path.sep)) {
    try {
      await rmdir(dir);
    } catch {
      return; // not empty, or gone already
    }
    dir = path.dirname(dir);
  }
}

export type MoveResult = { from: string; to: string; refs: number };

export async function moveMedia(paths: string[], folder: string): Promise<MoveResult[]> {
  if (!validFolder(folder)) throw new Error("Недопустима назва теки");

  const results: MoveResult[] = [];

  for (const from of paths) {
    const srcAbs = fullPath(from);
    if (!srcAbs) throw new Error(`Невірний шлях: ${from}`);

    // Refuse before touching anything if the source is not really there.
    // Without this, moving a stale path ran every rewrite against zero rows and
    // then set media_aliases.media_id to NULL — a caller repeating a move it had
    // already done could damage redirects for files that were fine.
    const [row] = (await pool.query("SELECT id FROM media WHERE path = $1", [from])).rows;
    if (!row) throw new Error(`Файла немає в бібліотеці: ${from}`);
    if (!(await stat(srcAbs).catch(() => null))) throw new Error(`Файла немає на диску: ${from}`);

    const wanted = targetPath(from, folder);
    if (wanted === from) continue;
    const to = await freeName(wanted);
    const destAbs = fullPath(to);
    if (!destAbs) throw new Error(`Невірний шлях призначення: ${to}`);

    const client = await pool.connect();
    let refs = 0;
    try {
      await client.query("BEGIN");

      // Rewrite references first: if any of this fails, the file has not moved
      // yet and the transaction rolls back to a fully consistent state.
      const re = `(${escapeRe(from)})(["?])`;
      // Rewrite the whole images document, not just the src key: entries here
      // carry a thumbnail alongside src (and could grow more keys), and a
      // rewrite that updates one and not the other leaves a card pointing at
      // two different files, only one of which exists. The trailing ["?] is
      // what keeps /catalog/1/1.webp from matching inside a longer path that
      // merely starts with it.
      const prod = await client.query(
        `UPDATE products p
            SET images = regexp_replace(p.images::text, $3, $4, 'g')::jsonb,
                image_src = CASE WHEN split_part(image_src, '?', 1) = $1 THEN $2 ELSE image_src END
          WHERE p.images::text LIKE '%' || $1 || '%' OR split_part(p.image_src, '?', 1) = $1`,
        [from, to, re, `${to}\\2`],
      );
      refs += prod.rowCount ?? 0;

      const brands = await client.query(
        `UPDATE brand_logos
            SET logo_url = $2 || CASE WHEN position('?' in logo_url) > 0
                                      THEN substring(logo_url from position('?' in logo_url))
                                      ELSE '' END
          WHERE split_part(logo_url, '?', 1) = $1`,
        [from, to],
      );
      refs += brands.rowCount ?? 0;

      // Site content is one opaque jsonb document; a targeted regex over its
      // text is the only rewrite that survives the document changing shape.
      // The trailing ["?] keeps /catalog/1/1.webp from matching inside a
      // longer path that merely starts with it.
      const content = await client.query(
        `UPDATE content_store
            SET val = regexp_replace(val::text, $1, $2, 'g')::jsonb
          WHERE val::text ~ $1`,
        [re, `${to}\\2`],
      );
      refs += content.rowCount ?? 0;

      await client.query("UPDATE media SET path = $2, folder = $3 WHERE path = $1", [from, to, folder]);

      // A file can return to a path it once left. The alias for that path would
      // then point at the file now living there — a redirect to itself, which
      // 404s the moment the file is deleted and loops until then.
      await client.query("DELETE FROM media_aliases WHERE old_path = $1", [to]);
      await client.query(
        `INSERT INTO media_aliases (old_path, media_id) VALUES ($1, $2)
         ON CONFLICT (old_path) DO UPDATE SET media_id = EXCLUDED.media_id`,
        [from, row.id],
      );
      // An alias chain (a → b → c) should resolve in one hop, not two. Every
      // alias that pointed at this file keeps pointing at it, which is what the
      // row id already guarantees — so there is nothing to repoint, only the
      // new hop to add. Kept explicit because the row id is the thing that
      // makes it true, and that is easy to break later.

      await mkdir(path.dirname(destAbs), { recursive: true });
      await rename(srcAbs, destAbs);

      // The thumb follows; if it cannot, the grid falls back to the original
      // and the next backfill rebuilds it.
      const tFrom = thumbFile(from, THUMB_SIZE);
      const tTo = thumbFile(to, THUMB_SIZE);
      if (tFrom && tTo) {
        await mkdir(path.dirname(tTo), { recursive: true }).catch(() => {});
        await rename(tFrom, tTo).catch(() => {});
      }

      const sourceName = from.split("/")[1];
      await pruneEmptyDirs(srcAbs, path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, sourceName)).catch(() => {});
      if (tFrom) {
        await pruneEmptyDirs(tFrom, path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, "thumb")).catch(() => {});
      }

      await client.query("COMMIT");
      results.push({ from, to, refs });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  return results;
}

/** Folders that exist, with how much is in each. Cheap: one grouped query. */
export async function listFolders(): Promise<{ source: string; folder: string; files: number; bytes: number }[]> {
  const res = await pool.query(
    `SELECT source, folder, count(*)::int AS files, COALESCE(sum(bytes), 0)::bigint AS bytes
       FROM media GROUP BY source, folder ORDER BY source, folder`,
  );
  return res.rows.map((r) => ({ source: r.source, folder: r.folder, files: r.files, bytes: Number(r.bytes) }));
}

/** An empty folder has to exist on disk before anything can be moved into it. */
export async function createFolder(source: "uploads" | "catalog", folder: string): Promise<void> {
  if (!validFolder(folder) || folder === "") throw new Error("Недопустима назва теки");
  const abs = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, source, folder));
  const root = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, source));
  if (!abs.startsWith(root + path.sep)) throw new Error("Недопустимий шлях");
  await mkdir(abs, { recursive: true });
}

/**
 * Rename a folder = move everything in it (and under it) to the new prefix.
 *
 * There is no cheaper way that stays correct: the folder is not a record
 * anywhere, it is the middle of thousands of paths, each of which is copied
 * into product cards. So renaming is the same per-file move, and it reports how
 * many files and references it touched.
 */
export async function renameFolder(source: "uploads" | "catalog", from: string, to: string): Promise<MoveResult[]> {
  if (!validFolder(from) || from === "") throw new Error("Недопустима тека");
  if (!validFolder(to) || to === "") throw new Error("Недопустима назва теки");
  if (from === to) return [];

  const res = await pool.query(
    `SELECT path, folder FROM media
      WHERE source = $1 AND (folder = $2 OR folder LIKE $2 || '/%')
      ORDER BY path`,
    [source, from],
  );
  if (res.rows.length === 0) throw new Error("У теці немає файлів");
  if (res.rows.length > 2000) throw new Error(`У теці ${res.rows.length} файлів — забагато для одного перейменування`);

  const out: MoveResult[] = [];
  for (const r of res.rows as { path: string; folder: string }[]) {
    // Keep the shape below the renamed folder: a/b/c under a → x gives x/b/c.
    const tail = r.folder.slice(from.length);
    out.push(...(await moveMedia([r.path], `${to}${tail}`)));
  }
  return out;
}

/** Remove a folder that has nothing left in it. Refuses otherwise. */
export async function removeEmptyFolder(source: "uploads" | "catalog", folder: string): Promise<void> {
  if (!validFolder(folder) || folder === "") throw new Error("Недопустима тека");
  const res = await pool.query(
    `SELECT count(*)::int AS n FROM media
      WHERE source = $1 AND (folder = $2 OR folder LIKE $2 || '/%')`,
    [source, folder],
  );
  if ((res.rows[0]?.n ?? 0) > 0) throw new Error(`У теці ще ${res.rows[0].n} файлів`);
  const abs = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, source, folder));
  const root = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, source));
  if (!abs.startsWith(root + path.sep)) throw new Error("Недопустимий шлях");
  await rm(abs, { recursive: true, force: true });
}
