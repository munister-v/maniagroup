import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { downloadAllBrandLogos } from "@/lib/brandLogos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST — download all brand logos to local disk and update DB URLs.
 * ?force=1 re-fetches even cached ones (upgrades old low-res favicons to
 * high-res Logo.dev, purging brands Logo.dev no longer serves back to text).
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const result = await downloadAllBrandLogos(force);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
