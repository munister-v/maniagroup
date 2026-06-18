import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listPurchaseOrders, createPurchaseOrder, type PoStatus } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status") as PoStatus | null;
  const valid: PoStatus[] = ["draft", "sent", "received", "cancelled"];
  return NextResponse.json({ orders: await listPurchaseOrders(status && valid.includes(status) ? status : undefined) });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { supplier_id?: number | null; supplier?: string; expected_at?: string; note?: string };
  const id = await createPurchaseOrder(b);
  return NextResponse.json({ ok: true, id });
}
