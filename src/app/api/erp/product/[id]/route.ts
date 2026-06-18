import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getProduct, getOrSeedVariants, getMovements, updateErpProduct, type ErpProductPatch } from "@/lib/erp";

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

/** Edit the product's own fields (Товар tab) — name, organization, pricing, status. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pid = Number(id);
  if (!pid) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch = await req.json() as ErpProductPatch;
  if (patch.name !== undefined && !String(patch.name).trim())
    return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });
  try {
    await updateErpProduct(pid, patch);
    const product = await getProduct(pid);
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
