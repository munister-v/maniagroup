import { NextResponse } from "next/server";
import { getProducts, getProductsByIds } from "@/lib/productSource";
import type { Product } from "@/lib/catalog";

function serialize(p: Product) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    price: p.price,
    oldPrice: p.oldPrice,
    image: p.image,
    tone: p.tone,
    inStock: p.inStock,
  };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;

  // Wishlist / bulk lookup by id list
  const idsParam = sp.get("ids");
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const products = await getProductsByIds(ids);
    return NextResponse.json({ products: products.map(serialize) });
  }

  const q = sp.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  const { products } = await getProducts({ q, perPage: 6 });
  return NextResponse.json({ products: products.map(serialize) });
}
