import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { readdir, stat, unlink } from "fs/promises";
import path from "path";

const DIR = path.join(process.cwd(), "public", "uploads");
const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

/** List uploaded images, newest first. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  let names: string[] = [];
  try {
    names = await readdir(DIR);
  } catch {
    return NextResponse.json({ files: [] });
  }
  const files = (
    await Promise.all(
      names
        .filter((n) => IMAGE_RE.test(n))
        .map(async (name) => {
          try {
            const s = await stat(path.join(DIR, name));
            return { url: `/uploads/${name}`, name, size: s.size, mtime: s.mtimeMs };
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
  try {
    await unlink(path.join(DIR, name));
  } catch {
    return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
