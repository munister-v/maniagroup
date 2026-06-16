import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

/** Filter facets for the admin catalog grid (all statuses, not just publish). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const [categories, colors, seasons, brands] = await Promise.all([
    q<{ slug: string; name: string; n: string }>(
      `SELECT category_slug AS slug, max(category) AS name, count(*)::text AS n
       FROM products WHERE category_slug <> '' GROUP BY category_slug ORDER BY count(*) DESC LIMIT 200`,
    ),
    q<{ name: string }>(
      `SELECT color AS name FROM products WHERE color <> '' GROUP BY color ORDER BY count(*) DESC LIMIT 60`,
    ),
    q<{ name: string }>(
      `SELECT season AS name FROM products WHERE season <> '' GROUP BY season ORDER BY count(*) DESC LIMIT 30`,
    ),
    q<{ name: string }>(
      `SELECT brand AS name FROM products WHERE brand <> '' GROUP BY brand ORDER BY count(*) DESC LIMIT 200`,
    ),
  ]);

  return NextResponse.json({
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, count: Number(c.n) })),
    colors: colors.map((c) => c.name),
    seasons: seasons.map((s) => s.name),
    brands: brands.map((b) => b.name),
  });
}
