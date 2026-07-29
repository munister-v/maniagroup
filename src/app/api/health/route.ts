import { NextResponse } from "next/server";
import { access, readdir, statfs } from "node:fs/promises";
import { q1 } from "@/lib/pg";
import { CATALOG_DIR, MEDIA_ROOT, UPLOADS_DIR } from "@/lib/mediaStorage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  const media = await mediaHealth();
  try {
    const row = await q1<{ ok: number; products: string }>(
      "SELECT 1 AS ok, (SELECT count(*) FROM products)::text AS products",
    );
    return NextResponse.json({
      ok: true,
      db: "ok",
      products: Number(row?.products ?? 0),
      media,
      latencyMs: Date.now() - started,
      now: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      db: "error",
      error: e instanceof Error ? e.message.slice(0, 200) : "DB error",
      media,
      latencyMs: Date.now() - started,
      now: new Date().toISOString(),
    }, { status: 503 });
  }
}

async function exists(dir: string): Promise<boolean> {
  try { await access(dir); return true; } catch { return false; }
}

async function countTopLevel(dir: string): Promise<number | null> {
  try { return (await readdir(dir)).length; } catch { return null; }
}

async function mediaHealth() {
  const disk = await statfs(MEDIA_ROOT).catch(() => null);
  const totalBytes = disk ? disk.blocks * disk.bsize : null;
  const freeBytes = disk ? disk.bavail * disk.bsize : null;
  return {
    root: MEDIA_ROOT,
    catalog: { path: CATALOG_DIR, exists: await exists(CATALOG_DIR), entries: await countTopLevel(CATALOG_DIR) },
    uploads: { path: UPLOADS_DIR, exists: await exists(UPLOADS_DIR), entries: await countTopLevel(UPLOADS_DIR) },
    disk: totalBytes && freeBytes != null
      ? { totalBytes, freeBytes, usedPct: Math.round(((totalBytes - freeBytes) / totalBytes) * 100) }
      : null,
  };
}
