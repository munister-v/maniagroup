import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { hasWcCredentials } from "@/lib/wcAdmin";
import { getMeta } from "@/lib/db";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({
    status: getMeta("sync_status") || "idle",
    last_sync: getMeta("last_sync"),
    total_products: Number(getMeta("total_products") || 0),
    error: getMeta("sync_error"),
    has_wc_creds: hasWcCredentials(),
  });
}

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  if (!hasWcCredentials()) {
    return NextResponse.json({ error: "WC_CREDS_MISSING" }, { status: 503 });
  }
  if (getMeta("sync_status") === "syncing") {
    return NextResponse.json({ ok: false, error: "already_syncing" });
  }

  // Kick off sync in background — PM2 keeps the process alive
  import("@/lib/sync")
    .then(({ syncCatalog }) => syncCatalog())
    .catch((e: unknown) => console.error("[sync] failed:", e));

  return NextResponse.json({ ok: true, status: "syncing" });
}
