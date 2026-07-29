import { NextResponse } from "next/server";
import { q1 } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  try {
    const row = await q1<{ ok: number; products: string }>(
      "SELECT 1 AS ok, (SELECT count(*) FROM products)::text AS products",
    );
    return NextResponse.json({
      ok: true,
      db: "ok",
      products: Number(row?.products ?? 0),
      latencyMs: Date.now() - started,
      now: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      db: "error",
      error: e instanceof Error ? e.message.slice(0, 200) : "DB error",
      latencyMs: Date.now() - started,
      now: new Date().toISOString(),
    }, { status: 503 });
  }
}
