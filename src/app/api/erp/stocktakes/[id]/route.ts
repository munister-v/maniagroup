import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import {
  getStocktake, addStocktakeItems, setStocktakeCount, deleteStocktakeItem,
  deleteStocktake, postStocktake,
} from "@/lib/stocktake";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await getStocktake(Number(id));
  if (!data) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sid = Number(id);
  const b = await req.json() as {
    action: "addItems" | "setCount" | "deleteItem" | "post";
    productId?: number; brand?: string; allInStock?: boolean;
    itemId?: number; counted?: number | null;
  };

  try {
    if (b.action === "addItems") {
      const added = await addStocktakeItems(sid, { productId: b.productId, brand: b.brand, allInStock: b.allInStock });
      const data = await getStocktake(sid);
      return NextResponse.json({ ok: true, added, ...data });
    }
    if (b.action === "setCount") {
      if (!b.itemId) return NextResponse.json({ error: "itemId" }, { status: 400 });
      await setStocktakeCount(b.itemId, b.counted ?? null);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "deleteItem") {
      if (!b.itemId) return NextResponse.json({ error: "itemId" }, { status: 400 });
      await deleteStocktakeItem(b.itemId);
      const data = await getStocktake(sid);
      return NextResponse.json({ ok: true, ...data });
    }
    if (b.action === "post") {
      const res = await postStocktake(sid);
      const data = await getStocktake(sid);
      return NextResponse.json({ ...res, ...data });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteStocktake(Number(id));
  return NextResponse.json({ ok: true });
}
