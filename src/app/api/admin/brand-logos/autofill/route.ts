import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { dbBrands } from "@/lib/productSource";
import { autoFillBrandLogos } from "@/lib/brandLogos";

/** POST — fill logos from the logo CDN for every known brand without one. */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const brands = await dbBrands();
  const filled = await autoFillBrandLogos(brands.map((b) => b.name));
  return NextResponse.json({ ok: true, filled });
}
