import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/adminAuth";
import { rollbackImportRun } from "@/lib/stockImport";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { runId?: string };
  if (!body.runId || !/^\d+$/.test(body.runId)) {
    return NextResponse.json({ error: "Некоректний номер імпорту" }, { status: 400 });
  }
  try {
    const result = await rollbackImportRun(body.runId);
    await logActivity("import", `Відкат імпорту #${body.runId} — ${result.restoredVariants} позицій`, result.restoredVariants);
    revalidatePath("/");
    revalidatePath("/catalog");
    revalidatePath("/product/[slug]", "page");
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не вдалося скасувати імпорт" }, { status: 409 });
  }
}
