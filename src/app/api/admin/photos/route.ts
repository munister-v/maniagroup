import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { photoStatus, migratePhotoBatch, resetFailedPhotos } from "@/lib/photoStore";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await photoStatus());
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { action?: string; limit?: number };

  try {
    if (b.action === "retry") {
      const requeued = await resetFailedPhotos();
      return NextResponse.json({ ok: true, requeued });
    }
    // default: migrate one batch
    const limit = Math.min(150, Math.max(10, b.limit ?? 80));
    const result = await migratePhotoBatch(limit);
    if (result.downloaded > 0) logActivity("photos", `Міграція фото: ${result.downloaded} завантажено, ${result.remaining} лишилось`, result.downloaded);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка міграції" }, { status: 500 });
  }
}
