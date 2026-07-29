import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { readdir, stat, unlink } from "fs/promises";
import path from "path";

const DIR = path.join(process.cwd(), "public", "uploads");
const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

export type MediaUsage = { id: string; name: string; sku: string };

/**
 * Which products reference each /uploads/… file. One query for the whole
 * library rather than a LIKE per file — the naive version is a full table scan
 * per image, and the library grows without bound.
 */
async function usageBySrc(): Promise<Map<string, MediaUsage[]>> {
  const rows = await q<{ id: string; name: string; sku: string; src: string }>(
    `SELECT p.id::text, p.name, p.sku, img->>'src' AS src
       FROM products p, jsonb_array_elements(p.images) AS img
      WHERE img->>'src' LIKE '/uploads/%'`,
  );
  const map = new Map<string, MediaUsage[]>();
  for (const r of rows) {
    const list = map.get(r.src) ?? [];
    // A product can list the same file twice; show it once.
    if (!list.some((u) => u.id === r.id)) list.push({ id: r.id, name: r.name, sku: r.sku });
    map.set(r.src, list);
  }
  return map;
}

/** List uploaded images, newest first, each with the products using it. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  let names: string[] = [];
  try {
    names = await readdir(DIR);
  } catch {
    return NextResponse.json({ files: [] });
  }

  // A broken DB should not blank the media screen — fall back to no usage info.
  let usage = new Map<string, MediaUsage[]>();
  try { usage = await usageBySrc(); } catch { /* leave empty */ }

  const files = (
    await Promise.all(
      names
        .filter((n) => IMAGE_RE.test(n))
        .map(async (name) => {
          try {
            const s = await stat(path.join(DIR, name));
            const url = `/uploads/${name}`;
            return { url, name, size: s.size, mtime: s.mtimeMs, usedBy: usage.get(url) ?? [] };
          } catch {
            return null;
          }
        })
    )
  ).filter((f): f is NonNullable<typeof f> => f !== null);
  files.sort((a, b) => b.mtime - a.mtime);
  return NextResponse.json({ files });
}

/** Delete one upload by name (basename only — no path traversal). */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const name = path.basename(searchParams.get("name") ?? "");
  if (!name || !IMAGE_RE.test(name)) {
    return NextResponse.json({ error: "Невірне ім'я файлу" }, { status: 400 });
  }

  // Deleting a file a product still shows leaves a broken image on the
  // storefront, and nothing here used to check. Refuse unless the caller says
  // it means it (?force=1), and name the products so the warning is specific.
  if (searchParams.get("force") !== "1") {
    let inUse: MediaUsage[] = [];
    try { inUse = (await usageBySrc()).get(`/uploads/${name}`) ?? []; } catch { /* allow */ }
    if (inUse.length > 0) {
      return NextResponse.json(
        { error: "Файл використовується", usedBy: inUse },
        { status: 409 },
      );
    }
  }

  try {
    await unlink(path.join(DIR, name));
  } catch {
    return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
