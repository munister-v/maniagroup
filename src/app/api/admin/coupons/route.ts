import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listCoupons, createCoupon, type CouponInput } from "@/lib/coupons";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ coupons: await listCoupons() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as CouponInput;
  try {
    const res = await createCoupon(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
