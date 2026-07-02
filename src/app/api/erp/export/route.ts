import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getExportRows, buildExport, EXPORT_FORMATS, type ExportFormat, type ExportFilters } from "@/lib/channelExport";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseFilters(sp: URLSearchParams): ExportFilters {
  return {
    scope: sp.get("scope") === "all" ? "all" : "instock",
    minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
    requireImage: sp.get("requireImage") !== "0",
    brand: sp.get("brand") || undefined,
  };
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const filters = parseFilters(sp);

  // Count-only mode for the live preview in the UI.
  if (sp.get("count") === "1") {
    const rows = await getExportRows(filters);
    const units = rows.reduce((s, r) => s + r.stock, 0);
    const value = rows.reduce((s, r) => s + r.price * (r.stock || 0), 0);
    return NextResponse.json({ count: rows.length, units, value });
  }

  const format = (sp.get("format") || "csv") as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Невідомий формат" }, { status: 400 });
  }

  const rows = await getExportRows(filters);
  logActivity("export", `Каталог (ERP) → ${format.toUpperCase()} (${rows.length})`, rows.length);
  const { filename, contentType, body } = buildExport(format, rows);

  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
