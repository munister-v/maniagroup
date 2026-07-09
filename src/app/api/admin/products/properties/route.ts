import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

/** «Властивості товарів» — Intertop's per-category attribute-schema screen.
 *  Our catalog doesn't have a per-category attribute schema, so this honestly
 *  lists the real filterable properties present in the catalogue (brand,
 *  color, season, gender, country) with value + product count, in the same
 *  Intertop table style, instead of fabricating an attribute editor. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const cols = ["brand", "color", "season", "gender", "country"] as const;
  const results = await Promise.all(
    cols.map((col) =>
      q<{ name: string; n: string }>(
        `SELECT ${col} AS name, count(*)::text AS n FROM products WHERE ${col} <> '' GROUP BY ${col} ORDER BY count(*) DESC LIMIT 200`,
      ),
    ),
  );

  const out: Record<string, { name: string; count: number }[]> = {};
  cols.forEach((col, i) => {
    out[col] = results[i].map((r) => ({ name: r.name, count: Number(r.n) }));
  });

  return NextResponse.json(out);
}
