import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { applyPriceRule, listBrandsWithCounts, type PriceRuleScope } from "@/lib/products";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ brands: await listBrandsWithCounts() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { scope, percent } = (await req.json()) as { scope: PriceRuleScope; percent: number };
  const pct = Number(percent) || 0;
  if (pct < 0 || pct > 95) return NextResponse.json({ error: "Знижка має бути 0–95%" }, { status: 400 });
  if (!scope?.brand && !scope?.categorySlug && !(scope?.ids && scope.ids.length)) {
    return NextResponse.json({ error: "Вкажіть бренд, категорію або товари" }, { status: 400 });
  }
  try {
    const count = await applyPriceRule(scope, pct);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
