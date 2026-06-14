import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { hasWcCredentials } from "@/lib/wcAdmin";
import { getMeta } from "@/lib/db";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const [status, last_sync, total, error] = await Promise.all([
    getMeta("sync_status"),
    getMeta("last_sync"),
    getMeta("total_products"),
    getMeta("sync_error"),
  ]);
  return NextResponse.json({
    status: status || "idle",
    last_sync,
    total_products: Number(total || 0),
    error,
    has_wc_creds: hasWcCredentials(),
  });
}

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  if (!hasWcCredentials()) {
    return NextResponse.json({ error: "WC_CREDS_MISSING" }, { status: 503 });
  }
  if ((await getMeta("sync_status")) === "syncing") {
    return NextResponse.json({ ok: false, error: "already_syncing" });
  }

  // Kick off sync in background — PM2 keeps the process alive
  import("@/lib/sync")
    .then(({ syncCatalog }) => syncCatalog())
    .catch((e: unknown) => console.error("[sync] failed:", e));

  return NextResponse.json({ ok: true, status: "syncing" });
}
