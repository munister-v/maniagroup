import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getStoreSettings, saveStoreSettings, type StoreSettings } from "@/lib/settings";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json(await getStoreSettings());
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as Partial<StoreSettings>;
  await saveStoreSettings(body);
  return NextResponse.json({ ok: true });
}
