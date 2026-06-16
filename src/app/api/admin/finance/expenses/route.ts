import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listExpenses, addExpense, deleteExpense } from "@/lib/finance";

export const dynamic = "force-dynamic";

function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") || "2020-01-01";
  const to = sp.get("to") || today();
  const items = await listExpenses(from, to);
  const total = items.reduce((s, e) => s + e.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const e of items) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  return NextResponse.json({ items, total, byCategory });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { spent_on?: string; category?: string; amount?: number; note?: string };
  const amount = Number(b.amount) || 0;
  if (amount <= 0) return NextResponse.json({ error: "Вкажіть суму" }, { status: 400 });
  await addExpense({
    spent_on: b.spent_on || monthStart(),
    category: b.category || "other",
    amount,
    note: (b.note ?? "").trim(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteExpense(id);
  return NextResponse.json({ ok: true });
}
