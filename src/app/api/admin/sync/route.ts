import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getMeta } from "@/lib/db";

/**
 * Catalog status. The catalog is now sourced from Postgres, populated by the
 * XLS import (see /api/admin/import-catalog). This endpoint just reports the
 * last import time and product count written to sync_meta.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const [status, last_sync, total, error, source, historyRaw] = await Promise.all([
    getMeta("sync_status"),
    getMeta("last_sync"),
    getMeta("total_products"),
    getMeta("sync_error"),
    getMeta("source"),
    getMeta("import_history"),
  ]);
  let history: unknown[] = [];
  try { history = JSON.parse(historyRaw || "[]"); } catch { history = []; }
  return NextResponse.json({
    status: status || "idle",
    last_sync,
    total_products: Number(total || 0),
    error,
    source,
    history,
  });
}
