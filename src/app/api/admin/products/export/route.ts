import { isAdmin } from "@/lib/adminAuth";
import { exportAdminProducts } from "@/lib/products";
import * as XLSX from "xlsx";

/**
 * Multi-format catalog export. Respects the same filters as the grid (q,
 * stock, brand) or an explicit id list. Formats: xlsx | csv | json.
 * PDF is produced client-side via the print view (Cyrillic-safe, no fonts).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase();
  const q = searchParams.get("q") ?? undefined;
  const brand = searchParams.get("brand") ?? undefined;
  const stockParam = searchParams.get("stock");
  const stock = stockParam === "in" || stockParam === "out" ? stockParam : undefined;
  const idsParam = searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportAdminProducts({ q, stock, brand, ids });

  // Flatten to localized, ordered columns for human-friendly spreadsheets.
  const localized = rows.map((r) => ({
    "ID": r.id,
    "Артикул": r.sku ?? "",
    "Назва": r.name ?? "",
    "Бренд": r.brand ?? "",
    "Категорія": r.category ?? "",
    "Стать": r.gender === "men" ? "Чоловіче" : r.gender === "women" ? "Жіноче" : "",
    "Ціна": r.regular_price ?? 0,
    "Акційна": r.sale_price ?? "",
    "Підсумкова": r.price ?? 0,
    "В наявності": r.is_in_stock ? "Так" : "Ні",
    "Статус": r.status === "publish" ? "Опубліковано" : "Чернетка",
    "Колір": r.color ?? "",
    "Сезон": r.season ?? "",
    "Склад": r.composition ?? "",
    "Країна": r.country ?? "",
    "Розміри": r.sizes ?? "",
    "Slug": r.slug ?? "",
    "Фото": r.image_src ?? "",
  }));

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.json"`,
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(localized);

  if (format === "csv") {
    const csv = "﻿" + XLSX.utils.sheet_to_csv(ws); // BOM so Excel reads UTF-8
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.csv"`,
      },
    });
  }

  // Default: real .xlsx
  ws["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Каталог");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.xlsx"`,
    },
  });
}
