import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listImportSources, createImportSource, type ImportSourceInput } from "@/lib/importSources";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ sources: await listImportSources() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as ImportSourceInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву джерела" }, { status: 400 });
  try {
    const res = await createImportSource(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
