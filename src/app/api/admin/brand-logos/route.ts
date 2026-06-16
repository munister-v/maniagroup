import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { dbBrands } from "@/lib/productSource";
import { BRAND_LOGO_BY_DBNAME } from "@/lib/catalog";
import { listBrandLogos, setBrandLogo, deleteBrandLogo } from "@/lib/brandLogos";

/** GET — every catalog brand merged with its stored/bundled logo + source. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const [brands, stored] = await Promise.all([dbBrands(), listBrandLogos()]);
  const storedMap = new Map(stored.map((s) => [s.brand, s]));
  const data = brands.map((b) => {
    const row = storedMap.get(b.name);
    const bundled = BRAND_LOGO_BY_DBNAME[b.name];
    return {
      brand: b.name,
      slug: b.slug,
      logo: row?.logo_url || bundled || null,
      source: row ? row.source : bundled ? "bundled" : "none",
    };
  });
  return NextResponse.json({ brands: data });
}

/** POST {brand, logoUrl} — set a manual logo (after upload or paste URL). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { brand, logoUrl } = await req.json();
  if (!brand || !logoUrl) return NextResponse.json({ error: "brand і logoUrl обов'язкові" }, { status: 400 });
  await setBrandLogo(String(brand), String(logoUrl), "manual");
  return NextResponse.json({ ok: true });
}

/** DELETE ?brand= — drop the stored logo (falls back to bundled/text). */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const brand = new URL(req.url).searchParams.get("brand");
  if (!brand) return NextResponse.json({ error: "brand обов'язковий" }, { status: 400 });
  await deleteBrandLogo(brand);
  return NextResponse.json({ ok: true });
}
