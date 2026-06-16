import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listStocktakes, createStocktake } from "@/lib/stocktake";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ stocktakes: await listStocktakes() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { note?: string; scope?: string };
  const id = await createStocktake(b);
  return NextResponse.json({ ok: true, id });
}
