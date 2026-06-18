import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { updateVariantMeta, applyStockChange, addVariant, deleteVariant } from "@/lib/erp";

export const dynamic = "force-dynamic";

/** Update a variant: stock change (setQty/delta) and/or meta (barcode/price/active). */
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as {
    variantId?: number;
    setQty?: number; delta?: number; type?: string; note?: string;
    barcode?: string; offer_code?: string; price?: number | null; sale_price?: number | null; active?: boolean;
  };
  const variantId = Number(b.variantId);
  if (!variantId) return NextResponse.json({ error: "variantId required" }, { status: 400 });

  if (b.barcode !== undefined || b.offer_code !== undefined || b.price !== undefined || b.sale_price !== undefined || b.active !== undefined) {
    await updateVariantMeta(variantId, {
      barcode: b.barcode, offer_code: b.offer_code, price: b.price, sale_price: b.sale_price, active: b.active,
    });
  }
  let qty: number | undefined;
  if (b.setQty !== undefined || b.delta !== undefined) {
    const res = await applyStockChange({
      variantId, setQty: b.setQty, delta: b.delta,
      type: b.type, note: b.note,
    });
    qty = res.qty;
  }
  return NextResponse.json({ ok: true, qty });
}

/** Add a new size row to a product. */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { productId?: number; size?: string };
  const pid = Number(b.productId);
  if (!pid || !b.size?.trim()) return NextResponse.json({ error: "productId + size required" }, { status: 400 });
  const variant = await addVariant(pid, b.size);
  return NextResponse.json({ ok: true, variant });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteVariant(id);
  return NextResponse.json({ ok: true });
}
