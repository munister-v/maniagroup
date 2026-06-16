import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getProduct, getOrSeedVariants, getMovements } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pid = Number(id);
  const product = await getProduct(pid);
  if (!product) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  const [variants, movements] = await Promise.all([getOrSeedVariants(pid), getMovements(pid)]);
  return NextResponse.json({ product, variants, movements });
}
