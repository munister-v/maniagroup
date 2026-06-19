import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function photoDir(id: string) {
  return path.join(process.cwd(), "public", "uploads", "products", id);
}
function photoUrl(id: string, filename: string) {
  return `/uploads/products/${id}/${filename}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const p = await q<{ images: unknown }>(`SELECT images FROM products WHERE id = $1`, [id]);
  if (!p.length) return NextResponse.json({ photos: [] });
  const imgs = p[0].images;
  const photos = Array.isArray(imgs) ? imgs : [];
  return NextResponse.json({ photos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const allowed = ["jpg", "jpeg", "png", "webp", "avif"];
  if (!allowed.includes(ext)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const dir = photoDir(id);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const filename = `${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  await writeFile(path.join(dir, filename), Buffer.from(bytes));

  const url = photoUrl(id, filename);

  // Prepend to product images array
  const cur = await q<{ images: unknown }>(`SELECT images FROM products WHERE id = $1`, [id]);
  const existing: string[] = Array.isArray(cur[0]?.images)
    ? (cur[0].images as string[]).filter((x) => typeof x === "string")
    : [];
  const updated = [url, ...existing];
  await q(`UPDATE products SET images = $1, image_src = $2, updated_at = now() WHERE id = $3`,
    [JSON.stringify(updated), updated[0], id]);

  return NextResponse.json({ ok: true, url, images: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const { url } = await req.json();

  // Remove from images array
  const cur = await q<{ images: unknown }>(`SELECT images FROM products WHERE id = $1`, [id]);
  const existing: string[] = Array.isArray(cur[0]?.images)
    ? (cur[0].images as string[]).filter((x) => typeof x === "string")
    : [];
  const updated = existing.filter((u) => u !== url);
  await q(`UPDATE products SET images = $1, image_src = $2, updated_at = now() WHERE id = $3`,
    [JSON.stringify(updated), updated[0] ?? "", id]);

  // Delete file if local
  if (url.startsWith("/uploads/products/")) {
    try {
      const fp = path.join(process.cwd(), "public", url);
      await unlink(fp);
    } catch {}
  }

  return NextResponse.json({ ok: true, images: updated });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const { images } = await req.json() as { images: string[] };
  if (!Array.isArray(images)) return NextResponse.json({ error: "images array required" }, { status: 400 });
  await q(`UPDATE products SET images = $1, image_src = $2, updated_at = now() WHERE id = $3`,
    [JSON.stringify(images), images[0] ?? "", id]);
  return NextResponse.json({ ok: true });
}
