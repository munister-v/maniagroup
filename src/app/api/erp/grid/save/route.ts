import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { saveGridChanges, type GridSaveChange, type GridFieldChange } from "@/lib/erpGrid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const b = await req.json() as { changes?: GridSaveChange[]; fields?: GridFieldChange[]; label?: string };
  const changes = Array.isArray(b.changes) ? b.changes : [];
  const fields = Array.isArray(b.fields) ? b.fields : [];
  if (!changes.length && !fields.length)
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  try {
    const result = await saveGridChanges(changes, b.label, fields);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
