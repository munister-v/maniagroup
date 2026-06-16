import { isAdmin } from "@/lib/adminAuth";
import { exportAdminProducts, parseFilterParams } from "@/lib/products";
import * as XLSX from "xlsx";

/**
 * Multi-format catalog export. Respects the grid filters (q, stock, brand,
 * category, gender, color, season, price, status) or an explicit id list, and
 * an optional `cols` whitelist. Formats: xlsx | csv | json. PDF is produced
 * client-side from the json scope (Cyrillic-safe, no embedded fonts).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase();
  const idsParam = searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;
  const colsParam = searchParams.get("cols");
  const cols = colsParam ? colsParam.split(",").map((c) => c.trim()).filter(Boolean) : null;

  const rows = await exportAdminProducts({ ...parseFilterParams(searchParams), ids });

  // Flatten to localized, ordered columns for human-friendly spreadsheets.
  const ALL: Record<string, (r: typeof rows[number]) => string | number> = {
    "ID": (r) => r.id,
    "Артикул": (r) => r.sku ?? "",
    "Назва": (r) => r.name ?? "",
    "Бренд": (r) => r.brand ?? "",
    "Категорія": (r) => r.category ?? "",
    "Стать": (r) => (r.gender === "men" ? "Чоловіче" : r.gender === "women" ? "Жіноче" : ""),
    "Ціна": (r) => r.regular_price ?? 0,
    "Акційна": (r) => r.sale_price ?? "",
    "Підсумкова": (r) => r.price ?? 0,
    "В наявності": (r) => (r.is_in_stock ? "Так" : "Ні"),
    "Статус": (r) => (r.status === "publish" ? "Опубліковано" : "Чернетка"),
    "Колір": (r) => r.color ?? "",
    "Сезон": (r) => r.season ?? "",
    "Склад": (r) => r.composition ?? "",
    "Країна": (r) => r.country ?? "",
    "Розміри": (r) => r.sizes ?? "",
    "Slug": (r) => r.slug ?? "",
    "Фото": (r) => r.image_src ?? "",
  };
  const colNames = cols && cols.length ? cols.filter((c) => c in ALL) : Object.keys(ALL);
  const localized = rows.map((r) => {
    const o: Record<string, string | number> = {};
    for (const c of colNames) o[c] = ALL[c](r);
    return o;
  });

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new Response(JSON.stringify(localized, null, 2), {
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

  // Default: real .xlsx — width per selected column (name/photo wider).
  const WIDTH: Record<string, number> = {
    "ID": 10, "Артикул": 16, "Назва": 40, "Бренд": 18, "Категорія": 18, "Стать": 10,
    "Ціна": 10, "Акційна": 10, "Підсумкова": 12, "В наявності": 12, "Статус": 14,
    "Колір": 14, "Сезон": 12, "Склад": 24, "Країна": 14, "Розміри": 16, "Slug": 22, "Фото": 40,
  };
  ws["!cols"] = colNames.map((c) => ({ wch: WIDTH[c] ?? 16 }));
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
