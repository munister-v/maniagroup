import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listAdminVariants } from "@/lib/variants";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const { variants, total } = await listAdminVariants({
    q: searchParams.get("q") ?? undefined,
    active: searchParams.get("active") ?? undefined,
    inStock: searchParams.get("inStock") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    siteStatus: searchParams.get("siteStatus") ?? undefined,
    productId: searchParams.get("productId") ?? undefined,
    page: Number(searchParams.get("page") ?? "1"),
    perPage: searchParams.get("perPage") ? Number(searchParams.get("perPage")) : undefined,
  });
  return NextResponse.json({ variants, total });
}
