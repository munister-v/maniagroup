import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getReplenishment, createPurchaseOrderFromLines } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const threshold = sp.get("threshold") != null ? Number(sp.get("threshold")) : undefined;
  const brand = sp.get("brand") || undefined;
  return NextResponse.json({ rows: await getReplenishment({ threshold, brand }) });
}

/** POST { supplier_id?, expected_at?, note?, lines:[{variantId,qty,unitCost?}] } → new draft PO. */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as {
    supplier_id?: number | null; expected_at?: string; note?: string;
    lines: { variantId: number; qty: number; unitCost?: number }[];
  };
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return NextResponse.json({ error: "Оберіть хоча б одну позицію" }, { status: 400 });
  }
  try {
    const id = await createPurchaseOrderFromLines(b);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
