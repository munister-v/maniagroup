import { NextResponse } from "next/server";
import { readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/adminAuth";
import { q1 } from "@/lib/pg";
import { getMeta } from "@/lib/db";
import { recentActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKUPS_DIR = "/opt/backups";
const BACKUP_RE = /^maniagroup-[\w.-]+\.sql\.gz$/;

/**
 * One-shot Monitoring payload: system health (DB, counts, disk, last backup,
 * last import) + the unified admin activity feed. Everything degrades
 * gracefully — a missing backups dir or non-Linux statfs just yields nulls
 * rather than failing the whole endpoint.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // DB health + counts (single round-trip)
  let db: { ok: boolean; products: number; orders: number; variants: number } = { ok: false, products: 0, orders: 0, variants: 0 };
  try {
    const row = await q1<{ products: string; orders: string; variants: string }>(
      `SELECT
         (SELECT count(*) FROM products)::text AS products,
         (SELECT count(*) FROM orders)::text AS orders,
         (SELECT count(*) FROM product_variants)::text AS variants`,
    );
    db = { ok: true, products: Number(row?.products ?? 0), orders: Number(row?.orders ?? 0), variants: Number(row?.variants ?? 0) };
  } catch {
    db = { ok: false, products: 0, orders: 0, variants: 0 };
  }

  // Backups: newest file age + size + total count
  let backups: { count: number; latestName: string | null; latestAt: string | null; latestSize: number | null; totalSize: number } = {
    count: 0, latestName: null, latestAt: null, latestSize: null, totalSize: 0,
  };
  try {
    const files = (await readdir(BACKUPS_DIR)).filter((f) => BACKUP_RE.test(f));
    let latest: { name: string; mtime: number; size: number } | null = null;
    let totalSize = 0;
    for (const name of files) {
      const st = await stat(path.join(BACKUPS_DIR, name));
      totalSize += st.size;
      if (!latest || st.mtimeMs > latest.mtime) latest = { name, mtime: st.mtimeMs, size: st.size };
    }
    backups = {
      count: files.length,
      latestName: latest?.name ?? null,
      latestAt: latest ? new Date(latest.mtime).toISOString() : null,
      latestSize: latest?.size ?? null,
      totalSize,
    };
  } catch { /* no backups dir (e.g. local dev) */ }

  // Disk usage of the partition holding the backups (VPS ops signal)
  let disk: { totalBytes: number; freeBytes: number; usedPct: number } | null = null;
  try {
    const fs = await statfs(BACKUPS_DIR).catch(() => statfs("/"));
    const total = fs.blocks * fs.bsize;
    const free = fs.bavail * fs.bsize;
    disk = { totalBytes: total, freeBytes: free, usedPct: total > 0 ? Math.round(((total - free) / total) * 100) : 0 };
  } catch { /* statfs unsupported */ }

  // Last import (from the dedicated import history)
  let lastImport: unknown = null;
  try {
    const raw = await getMeta("erp_import_history");
    const arr = JSON.parse(raw || "[]");
    lastImport = Array.isArray(arr) && arr.length ? arr[0] : null;
  } catch { /* none */ }

  const activity = await recentActivity(40).catch(() => []);

  return NextResponse.json({
    db,
    backups,
    disk,
    lastImport,
    activity,
    secretConfigured: !!process.env.ADMIN_SECRET,
    dbUrlConfigured: !!process.env.DATABASE_URL,
    now: new Date().toISOString(),
  });
}
