import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getRevenueAnalytics } from "@/lib/orders";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const days = Number(new URL(req.url).searchParams.get("days") ?? "30");
  const data = await getRevenueAnalytics(days);
  return NextResponse.json(data);
}
