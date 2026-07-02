import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listCoupons, createCoupon, type CouponInput } from "@/lib/coupons";
import { logActivity } from "@/lib/activity";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ coupons: await listCoupons() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as CouponInput;
  try {
    const res = await createCoupon(body);
    logActivity("settings", `Створено промокод «${body.code ?? ""}»`);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
