import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getErpDashboard } from "@/lib/erpDashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getErpDashboard());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
