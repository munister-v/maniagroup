import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { unlink } from "fs/promises";
import path from "path";
import { forgetMedia, fullPath, IMAGE_RE, syncMediaIndex } from "@/lib/mediaIndex";
import { mediaCounts, MediaUsage, parseMediaFilter, selectMedia, usageFor } from "@/lib/mediaQuery";

export type { MediaUsage } from "@/lib/mediaQuery";
export type MediaSource = "uploads" | "catalog";

/**
 * GET — the media library, filtered, counted and paginated in Postgres.
 *
 * This used to readdir() the whole 13.5k-file library on every keystroke and
 * filter in JS. Now the index table answers it, so the cost is one indexed
 * query per request instead of one directory walk.
 *
 *   ?source=all|uploads|catalog  ?usage=all|used|free  ?folder=  ?q=
 *   ?since=<ISO date>  ?urls=<comma-separated selection>
 *   ?sort=new|big|name  ?page=  ?perPage=
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const filter = parseMediaFilter(sp);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const perPage = Math.min(200, Math.max(1, Number(sp.get("perPage")) || 48));

  const rows = await selectMedia(filter, { limit: perPage, offset: (page - 1) * perPage, withTotal: true });
  const counts = await mediaCounts();
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

  return NextResponse.json({ files, total: Number(rows[0]?.total ?? 0), page, perPage, counts });
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
