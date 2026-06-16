import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getOrderEvents, addOrderEvent } from "@/lib/orders";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const events = await getOrderEvents(Number(id));
  return NextResponse.json({ events });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const { message } = (await req.json()) as { message: string };
  const text = (message ?? "").trim();
  if (!text) return NextResponse.json({ error: "Порожня нотатка" }, { status: 400 });
  await addOrderEvent(Number(id), "note", text);
  const events = await getOrderEvents(Number(id));
  return NextResponse.json({ ok: true, events });
}
