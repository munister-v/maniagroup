import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listSuppliers, createSupplier } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ suppliers: await listSuppliers() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { name?: string; contact?: string; phone?: string; note?: string };
  if (!b.name?.trim()) return NextResponse.json({ error: "Вкажіть назву постачальника" }, { status: 400 });
  const id = await createSupplier({ name: b.name, contact: b.contact, phone: b.phone, note: b.note });
  return NextResponse.json({ ok: true, id });
}
