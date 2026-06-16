import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listReceipts, createReceipt } from "@/lib/receiving";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ receipts: await listReceipts() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { supplier?: string; supplier_id?: number | null; doc_date?: string; note?: string };
  const id = await createReceipt(b);
  return NextResponse.json({ ok: true, id });
}
