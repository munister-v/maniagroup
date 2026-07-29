import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { optimizeImage } from "@/lib/imageOptimize";
import { UPLOADS_DIR } from "@/lib/mediaStorage";

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

  const dir = UPLOADS_DIR;
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${optimized.ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), optimized.buffer);

  return NextResponse.json({ ok: true, url: `/uploads/${name}` });
}
