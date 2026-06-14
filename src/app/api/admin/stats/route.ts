import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getOrderStats } from "@/lib/orders";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const s = await getOrderStats();
  return NextResponse.json({
    products_total: s.products_total,
    has_wc_creds: true, // stats now come from our own DB, always available
    orders_total: s.orders_total,
    pending: s.pending,
    processing: s.processing,
    on_hold: s.on_hold,
    revenue: s.revenue,
  });
}
