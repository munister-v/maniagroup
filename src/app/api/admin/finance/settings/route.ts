import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import {
  getFinanceSettings, saveFinanceSettings,
  getCostRules, setCostRule, deleteCostRule, type CostBasis,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings, rules] = await Promise.all([getFinanceSettings(), getCostRules()]);
  return NextResponse.json({ settings, rules });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as {
    markupPct?: number; basis?: CostBasis;
    rule?: { brand: string; pct: number };
    deleteBrand?: string;
  };
  if (body.markupPct != null || body.basis) {
    await saveFinanceSettings({ markupPct: body.markupPct, basis: body.basis });
  }
  if (body.rule?.brand) await setCostRule(body.rule.brand.trim(), Number(body.rule.pct) || 0);
  if (body.deleteBrand) await deleteCostRule(body.deleteBrand);
  const [settings, rules] = await Promise.all([getFinanceSettings(), getCostRules()]);
  return NextResponse.json({ ok: true, settings, rules });
}
