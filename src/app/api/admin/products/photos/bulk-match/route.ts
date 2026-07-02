import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { optimizeImage } from "@/lib/imageOptimize";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PUB_DIR = path.join(process.cwd(), "public", "catalog");

/**
 * Bulk photo intake: drop a folder of files named by supplier code (SKU or
 * factory_article) — "90101.jpg", "90101-1.jpg", "DEMO-PALTO-01_2.png" — and
 * every file gets auto-attached to the matching product with zero per-product
 * manual work. This is the answer to "products imported via MG.xls have no
 * photos" — the client (or their supplier) can batch-attach real photos right
 * after import instead of opening each product card one at a time.
 *
 * Matching strategy: for each filename (minus extension), find the LONGEST
 * known sku/factory_article that is a case-insensitive PREFIX of it. This
 * works whether the code is purely numeric ("90101") or itself contains
 * hyphens/dots ("DEMO-PALTO-01", "EFM221.100.6290") without needing to guess
 * a fixed delimiter — the remaining suffix (if any) is only used to order
 * multiple photos of the same product.
 */

type Candidate = { code: string; productId: number };

function extractTrailingNumber(s: string): number {
  const m = s.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : 0;
}

function findMatch(basenameLower: string, candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of candidates) {
    if (basenameLower.startsWith(c.code) && (!best || c.code.length > best.code.length)) best = c;
  }
  return best;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Файли не надіслано" }, { status: 400 });

  const rows = await q<{ id: string; sku: string; factory_article: string; name: string }>(
    "SELECT id::text, sku, factory_article, name FROM products WHERE sku <> '' OR factory_article <> ''",
  );
  const candidates: Candidate[] = [];
  for (const r of rows) {
    if (r.sku) candidates.push({ code: r.sku.toLowerCase(), productId: Number(r.id) });
    if (r.factory_article) candidates.push({ code: r.factory_article.toLowerCase(), productId: Number(r.id) });
  }
  const nameById = new Map(rows.map((r) => [Number(r.id), r.name]));

  // Group files by matched product, preserving a per-file order key for sorting.
  const groups = new Map<number, { file: File; order: number }[]>();
  const unmatched: string[] = [];

  for (const file of files) {
    const base = file.name.replace(/\.[^.]+$/, "");
    const match = findMatch(base.toLowerCase(), candidates);
    if (!match) { unmatched.push(file.name); continue; }
    const rest = base.slice(match.code.length);
    const order = extractTrailingNumber(rest) || 0;
    const arr = groups.get(match.productId) ?? [];
    arr.push({ file, order });
    groups.set(match.productId, arr);
  }

  const matched: { filename: string; productId: number; productName: string }[] = [];
  const failed: string[] = [];

  for (const [productId, items] of groups) {
    items.sort((a, b) => a.order - b.order);
    const existing = await q<{ images: string; image_src: string }>(
      "SELECT images::text AS images, image_src FROM products WHERE id = $1", [productId],
    );
    let imgs: { src: string }[] = [];
    try { imgs = JSON.parse(existing[0]?.images || "[]"); } catch {}
    let nextIdx = imgs.length + 1;
    const destDir = path.join(PUB_DIR, String(productId));

    for (const { file } of items) {
      try {
        const raw = Buffer.from(await file.arrayBuffer());
        const opt = await optimizeImage(raw, file.type || "image/jpeg");
        await mkdir(destDir, { recursive: true });
        const outName = `${nextIdx}.${opt.ext}`;
        await writeFile(path.join(destDir, outName), opt.buffer);
        imgs.push({ src: `/catalog/${productId}/${outName}` });
        nextIdx++;
        matched.push({ filename: file.name, productId, productName: nameById.get(productId) ?? String(productId) });
      } catch {
        failed.push(file.name);
      }
    }

    const firstSrc = imgs[0]?.src ?? "";
    await q(
      `UPDATE products SET images = $2::jsonb, image_src = CASE WHEN image_src = '' THEN $3 ELSE image_src END, updated_at = now() WHERE id = $1`,
      [productId, JSON.stringify(imgs), firstSrc],
    );
  }

  logActivity("photos", `Масова прив'язка фото: ${matched.length} прив'язано${unmatched.length ? `, ${unmatched.length} без товару` : ""}`, matched.length);
  return NextResponse.json({ ok: true, matched, unmatched, failed });
}
