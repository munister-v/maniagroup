import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { optimizeImage } from "@/lib/imageOptimize";
import { UPLOADS_DIR } from "@/lib/mediaStorage";
import { findByHash, recordUpload } from "@/lib/mediaIndex";
import { ensureThumb } from "@/lib/mediaThumbs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MAX_BYTES = 12 * 1024 * 1024; // pre-optimization ceiling; output is capped by imageOptimize

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передано" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Лише зображення (jpg, png, webp, avif, gif)" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Файл більше 12 МБ" }, { status: 400 });

  const raw = Buffer.from(await file.arrayBuffer());
  let optimized;
  try {
    optimized = await optimizeImage(raw, file.type);
  } catch {
    return NextResponse.json({ error: "Не вдалося обробити зображення — файл пошкоджено?" }, { status: 400 });
  }

  // Hash the optimized bytes, not the upload: the same photo dropped twice
  // produces identical output, and dropping a whole folder again is the normal
  // way this gets used. Reuse the existing file instead of storing a twin under
  // a fresh UUID that nothing can ever tell apart.
  const sha256 = createHash("sha256").update(optimized.buffer).digest("hex");
  const twin = await findByHash(sha256).catch(() => null);
  if (twin) {
    return NextResponse.json({ ok: true, url: twin.path, duplicate: true });
  }

  const dir = UPLOADS_DIR;
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${optimized.ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), optimized.buffer);

  const url = `/uploads/${name}`;
  // The stored name is a UUID, so the name the admin recognises survives only
  // if it is recorded here. Indexing must not fail the upload: the file is
  // already on disk, and a sync would pick it up anyway.
  try {
    const meta = await sharp(optimized.buffer, { animated: false }).metadata().catch(() => null);
    await recordUpload({
      url,
      source: "uploads",
      folder: "",
      originalName: file.name || "",
      ext: optimized.ext,
      bytes: optimized.buffer.length,
      width: meta?.width ?? 0,
      height: meta?.height ?? 0,
      sha256,
    });
  } catch (e) {
    console.error("[upload] media index write failed", e);
  }

  // Best-effort: the grid falls back to the full image when a thumb is
  // missing, so a failure here costs bandwidth, not correctness.
  ensureThumb(url).catch((e) => console.error("[upload] thumb failed", e));

  return NextResponse.json({ ok: true, url });
}
