import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { fetchProducts } from "@/lib/wc";
import { fromWcProduct } from "@/lib/catalog";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? undefined;
  const wcProducts = await fetchProducts({ perPage: 30, search });
  return NextResponse.json(wcProducts.map(fromWcProduct));
}
