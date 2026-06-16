import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { updateCoupon, deleteCoupon, type CouponInput } from "@/lib/coupons";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as Partial<CouponInput>;
  try {
    await updateCoupon(Number(id), body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  await deleteCoupon(Number(id));
  return NextResponse.json({ ok: true });
}
