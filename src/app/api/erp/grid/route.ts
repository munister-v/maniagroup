import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getGridData } from "@/lib/erpGrid";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const data = await getGridData({
    q: sp.get("q") ?? undefined,
    page: Number(sp.get("page") ?? 1),
    perPage: Number(sp.get("perPage") ?? 100),
    brand: sp.get("brand") ?? undefined,
    status: sp.get("status") ?? undefined,
  });
  return NextResponse.json(data);
}
