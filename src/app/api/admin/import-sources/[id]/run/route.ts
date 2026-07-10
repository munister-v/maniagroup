import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { runImportSource } from "@/lib/importSources";
import { logActivity } from "@/lib/activity";

/** Guide 2.8's "Оновити зараз" — manually trigger one URL-feed source
 *  outside its 3-hour cron cycle (see /api/admin/import-sources/run-due). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const result = await runImportSource(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (!result.skipped) {
    logActivity("save", `Джерело #${id}: ${result.matchedRows} поз., ${result.productsCreated} нових товарів`, result.matchedRows);
  }
  return NextResponse.json(result);
}
