import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listImportTemplates, createImportTemplate, type ImportTemplateInput } from "@/lib/importTemplates";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ templates: await listImportTemplates() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as ImportTemplateInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву шаблону" }, { status: 400 });
  try {
    const res = await createImportTemplate(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
