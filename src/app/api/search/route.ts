import { NextResponse } from "next/server";
import { getProducts } from "@/lib/productSource";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  const { products } = await getProducts({ q, perPage: 6 });
  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      price: p.price,
      oldPrice: p.oldPrice,
      image: p.image,
      tone: p.tone,
      inStock: p.inStock,
    })),
  });
}
