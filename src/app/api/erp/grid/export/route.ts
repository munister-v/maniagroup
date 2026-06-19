import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getGridData } from "@/lib/erpGrid";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const data = await getGridData({
    q: sp.get("q") ?? undefined,
    page: 1,
    perPage: Number(sp.get("perPage") ?? 9999),
    brand: sp.get("brand") ?? undefined,
    status: sp.get("status") ?? undefined,
  });

  const { products, sizes } = data;

  // Build header row
  const header = ["Бренд", "Назва", "SKU", "Ціна", "Собівартість", "Статус", ...sizes, "Разом"];

  // Build data rows
  const rows = products.map((p) => {
    const bySize = new Map(p.variants.map((v: { size: string; qty: number }) => [v.size, v.qty]));
    const sizeQtys = sizes.map((sz: string) => bySize.get(sz) ?? 0);
    const total = sizeQtys.reduce((a: number, b: number) => a + b, 0);
    return [p.brand, p.name, p.sku, p.price, p.cost_price ?? "", p.status, ...sizeQtys, total];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  // Column widths
  ws["!cols"] = [
    { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    ...sizes.map(() => ({ wch: 6 })),
    { wch: 8 },
  ];

  // Header style: bold
  for (let c = 0; c < header.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: "F7F4F0" } } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Залишки");

  const raw = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  const arrayBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  return new NextResponse(arrayBuf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mania_grid_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
