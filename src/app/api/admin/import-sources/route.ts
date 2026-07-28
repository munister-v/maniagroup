import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { IMPORT_INTERVALS, listImportSources, createImportSource, type ImportSourceInput } from "@/lib/importSources";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ sources: await listImportSources() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as ImportSourceInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву джерела" }, { status: 400 });
  if (body.feed_type === "url" && !body.feed_url?.trim()) return NextResponse.json({ error: "Вкажіть пряме посилання на фід" }, { status: 400 });
  if (body.interval_minutes != null && !(IMPORT_INTERVALS as readonly number[]).includes(Number(body.interval_minutes)))
    return NextResponse.json({ error: "Оберіть доступний інтервал оновлення" }, { status: 400 });
  try {
    const res = await createImportSource(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
