import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { dbBrands } from "@/lib/productSource";
import { BRAND_LOGO_BY_DBNAME } from "@/lib/catalog";
import { listBrandLogos, setBrandLogo, deleteBrandLogo, saveBrandDisplay } from "@/lib/brandLogos";

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
      source: row?.logo_url ? row.source : bundled ? "bundled" : "none",
      bg: row?.bg ?? "light",
      visible: row?.visible ?? true,
      sort_order: row?.sort_order ?? null,
    };
  });
  // Впорядковані вручну — першими, решта за алфавітом: так новий бренд не
  // ламає вибудуваний порядок, а просто стає в кінець.
  data.sort((a, z) => {
    if (a.sort_order != null && z.sort_order != null) return a.sort_order - z.sort_order;
    if (a.sort_order != null) return -1;
    if (z.sort_order != null) return 1;
    return a.brand.localeCompare(z.brand, "uk");
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

/** PATCH {items:[{brand,visible,sort_order}]} — save strip order + visibility. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) return NextResponse.json({ error: "items обов'язкові" }, { status: 400 });
  await saveBrandDisplay(
    items.map((it: { brand: string; visible?: boolean; sort_order?: number }, i: number) => ({
      brand: String(it.brand),
      visible: it.visible !== false,
      sort_order: Number.isFinite(it.sort_order) ? Number(it.sort_order) : i,
    })),
  );
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
