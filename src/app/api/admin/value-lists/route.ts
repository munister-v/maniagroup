import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listValueLists, createValueList, type ValueListInput } from "@/lib/valueLists";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ lists: await listValueLists() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as ValueListInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву списку" }, { status: 400 });
  try {
    const res = await createValueList(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
