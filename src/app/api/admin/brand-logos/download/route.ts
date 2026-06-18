import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { downloadAllBrandLogos } from "@/lib/brandLogos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST — download all brand logos to local disk and update DB URLs. */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  try {
    const result = await downloadAllBrandLogos();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
