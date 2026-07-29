import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import { CATALOG_DIR, UPLOADS_DIR, mediaUrlToPath } from "@/lib/mediaStorage";

const UPLOADS = UPLOADS_DIR;
const CATALOG = CATALOG_DIR;
const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

export type MediaUsage = { id: string; name: string; sku: string };
export type MediaSource = "uploads" | "catalog";

type Entry = { url: string; name: string; source: MediaSource; usedBy: MediaUsage[] };

/**
 * Every image path the catalog currently points at, mapped to the products
 * pointing at it. One query for the whole library — the obvious alternative,
 * a LIKE per file, is a full table scan per image and there are 13k of them.
 */
async function usageBySrc(): Promise<Map<string, MediaUsage[]>> {
  const rows = await q<{ id: string; name: string; sku: string; src: string }>(
    `SELECT p.id::text, p.name, p.sku, img->>'src' AS src
       FROM products p, jsonb_array_elements(p.images) AS img
      WHERE img->>'src' LIKE '/uploads/%' OR img->>'src' LIKE '/catalog/%'`,
  );
  const map = new Map<string, MediaUsage[]>();
  for (const r of rows) {
    const list = map.get(r.src) ?? [];
    if (!list.some((u) => u.id === r.id)) list.push({ id: r.id, name: r.name, sku: r.sku });
    map.set(r.src, list);
  }
  return map;
}

/** Flat list of what is actually on disk. Walking 13.5k files costs ~30ms. */
async function listFiles(usage: Map<string, MediaUsage[]>): Promise<Entry[]> {
  const out: Entry[] = [];

  for (const name of await readdir(UPLOADS).catch(() => [] as string[])) {
    if (!IMAGE_RE.test(name)) continue;
    const url = `/uploads/${name}`;
    out.push({ url, name, source: "uploads", usedBy: usage.get(url) ?? [] });
  }

  // public/catalog/<productId>/<n>.webp — the directory IS the product, so a
  // file whose product no longer lists it shows up as unused (an orphan left
  // behind by a re-import) rather than silently taking up space.
  for (const dir of await readdir(CATALOG, { withFileTypes: true }).catch(() => [])) {
    if (!dir.isDirectory()) continue;
    for (const name of await readdir(path.join(CATALOG, dir.name)).catch(() => [] as string[])) {
      if (!IMAGE_RE.test(name)) continue;
      const url = `/catalog/${dir.name}/${name}`;
      out.push({ url, name: `${dir.name}/${name}`, source: "catalog", usedBy: usage.get(url) ?? [] });
    }
  }

  return out;
}

/**
 * GET — the media library, filtered and paginated server-side.
 *
 * It used to list only /uploads and hand the whole array to the browser, which
 * was fine at one file and impossible once the 13k migrated product photos
 * joined. Filtering here keeps the response to one page regardless of how big
 * the library gets.
 *
 *   ?source=all|uploads|catalog  ?usage=all|used|free  ?q=  ?page=  ?perPage=
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const source = sp.get("source") ?? "all";
  const usageFilter = sp.get("usage") ?? "all";
  const term = (sp.get("q") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const perPage = Math.min(200, Math.max(1, Number(sp.get("perPage")) || 48));

  let usage = new Map<string, MediaUsage[]>();
  // A DB hiccup should degrade to "no usage info", not blank the screen.
  try { usage = await usageBySrc(); } catch { /* leave empty */ }

  const all = await listFiles(usage);

  const counts = {
    all: all.length,
    uploads: all.filter((f) => f.source === "uploads").length,
    catalog: all.filter((f) => f.source === "catalog").length,
    used: all.filter((f) => f.usedBy.length > 0).length,
    free: all.filter((f) => f.usedBy.length === 0).length,
  };

  const filtered = all.filter((f) => {
    if (source !== "all" && f.source !== source) return false;
    if (usageFilter === "used" && f.usedBy.length === 0) return false;
    if (usageFilter === "free" && f.usedBy.length > 0) return false;
    if (!term) return true;
    // Searchable by what the image belongs to, not just by its filename.
    return f.name.toLowerCase().includes(term)
      || f.url.toLowerCase().includes(term)
      || f.usedBy.some((u) => u.name.toLowerCase().includes(term) || u.sku.toLowerCase().includes(term));
  });

  const total = filtered.length;
  const slice = filtered.slice((page - 1) * perPage, page * perPage);

  // stat only the page being shown — 48 calls instead of 13.5k.
  const files = await Promise.all(
    slice.map(async (f) => {
      try {
        const full = mediaUrlToPath(f.url);
        if (!full) throw new Error("bad path");
        const s = await stat(full);
        return { ...f, size: s.size, mtime: s.mtimeMs };
      } catch {
        return { ...f, size: 0, mtime: 0 };
      }
    }),
  );
  files.sort((a, b) => (sp.get("sort") === "big" ? b.size - a.size : b.mtime - a.mtime));

  return NextResponse.json({ files, total, page, perPage, counts });
}

/** DELETE ?name=… (uploads) or ?url=/catalog/<id>/<file> — refuses if in use. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const sp = new URL(req.url).searchParams;

  // Two call shapes: the original ?name= (uploads only) and ?url= for anything
  // in the library. Both resolve to a path that must stay inside public/.
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
  const full = mediaUrlToPath(rel);
  if (!full) {
    return NextResponse.json({ error: "Невірний шлях" }, { status: 400 });
  }

  // Deleting a file a product still shows leaves a broken image on the
  // storefront. Refuse unless the caller insists, and name the products so the
  // confirmation can be specific instead of a vague "якщо використовується".
  if (sp.get("force") !== "1") {
    let inUse: MediaUsage[] = [];
    try { inUse = (await usageBySrc()).get(rel) ?? []; } catch { /* allow */ }
    if (inUse.length > 0) {
      return NextResponse.json({ error: "Файл використовується", usedBy: inUse }, { status: 409 });
    }
  }

  try {
    await unlink(full);
  } catch {
    return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
