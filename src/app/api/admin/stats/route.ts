import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getDashboardStats } from "@/lib/orders";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const s = await getDashboardStats();
  return NextResponse.json(s);
}
