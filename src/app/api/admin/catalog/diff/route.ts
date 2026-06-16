import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import * as XLSX from "xlsx";

export const maxDuration = 60;

type DiffItem = {
  sku: string;
  name: string;
  brand: string;
  change: "new" | "price_up" | "price_down" | "now_in_stock" | "now_out" | "unchanged";
  db_price?: number;
  xls_price?: number;
  db_in_stock?: boolean;
  xls_in_stock: boolean;
};

function parseMgMap(buf: Buffer): Map<string, { brand: string; name: string; base: number; sale: number }> {
  const wb = XLSX.read(buf, { type: "buffer", codepage: 1251 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "", blankrows: false });
  const map = new Map<string, { brand: string; name: string; base: number; sale: number }>();
  for (const r of rows) {
    const code = String((r as string[])[0] ?? "").trim().split(".")[0];
    if (!/^\d+$/.test(code)) continue;
    map.set(code, {
      brand: String((r as string[])[2] ?? "").trim(),
      name:  String((r as string[])[3] ?? "").trim(),
      base:  Number((r as string[])[5]) || 0,
      sale:  Number((r as string[])[6]) || 0,
    });
  }
  return map;
}

function parseWpMap(buf: Buffer): Map<string, { name: string; regular: number; sale: number; in_stock: boolean }> {
  const wb = XLSX.read(buf, { type: "buffer", codepage: 1251 });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "" });
  const seen = new Set<string>();
  const map = new Map<string, { name: string; regular: number; sale: number; in_stock: boolean }>();
  for (const r of rows) {
    const id = String(r["ID"] ?? "").trim().split(".")[0];
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const regular = Number(r["Regular Price"]) || 0;
    const sale    = Number(r["Sale Price"])    || 0;
    map.set(id, {
      name:     String(r["Name"] ?? "").trim(),
      regular,
      sale:     sale > 0 && sale < regular ? sale : 0,
      in_stock: true,
    });
  }
  return map;
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Очікується multipart/form-data" }, { status: 400 });
  }

  const mg = form.get("mg");
  const wp = form.get("wp");
  if (!(mg instanceof File) || !(wp instanceof File)) {
    return NextResponse.json({ error: "Потрібні обидва файли: MG та WP" }, { status: 400 });
  }

  const [mgBuf, wpBuf] = await Promise.all([
    mg.arrayBuffer().then((b) => Buffer.from(b)),
    wp.arrayBuffer().then((b) => Buffer.from(b)),
  ]);

  const mgMap = parseMgMap(mgBuf);
  const wpMap = parseWpMap(wpBuf);

  // Current DB state indexed by sku
  const dbRows = await q<{ sku: string; name: string; brand: string; price: number; is_in_stock: boolean }>(
    `SELECT sku, name, brand, price::int AS price, is_in_stock FROM products WHERE status = 'publish'`,
  );
  const dbMap = new Map(dbRows.map((r) => [r.sku, r]));

  const allSkus = new Set([...wpMap.keys(), ...mgMap.keys()]);
  const diff: DiffItem[] = [];

  for (const sku of allSkus) {
    const wp = wpMap.get(sku);
    const mg = mgMap.get(sku);
    const db = dbMap.get(sku);

    const xlsInStock = !!wp;
    const xlsPrice   = wp ? (wp.sale > 0 ? wp.sale : wp.regular) : (mg ? (mg.sale > 0 && mg.sale < mg.base ? mg.sale : mg.base) : 0);
    const name  = wp?.name  || mg?.name  || sku;
    const brand = mg?.brand || "";

    if (!db) {
      // new product (in XLS, not in DB)
      diff.push({ sku, name, brand, change: "new", xls_price: xlsPrice, xls_in_stock: xlsInStock });
      continue;
    }

    const dbInStock = db.is_in_stock;
    const dbPrice   = db.price;

    if (!dbInStock && xlsInStock) {
      diff.push({ sku, name, brand, change: "now_in_stock", db_price: dbPrice, xls_price: xlsPrice, db_in_stock: false, xls_in_stock: true });
    } else if (dbInStock && !xlsInStock) {
      diff.push({ sku, name, brand, change: "now_out", db_price: dbPrice, xls_price: xlsPrice, db_in_stock: true, xls_in_stock: false });
    } else if (xlsPrice && dbPrice && Math.abs(xlsPrice - dbPrice) > 1) {
      diff.push({
        sku, name, brand,
        change: xlsPrice > dbPrice ? "price_up" : "price_down",
        db_price: dbPrice, xls_price: xlsPrice,
        db_in_stock: dbInStock, xls_in_stock: xlsInStock,
      });
    } else {
      diff.push({ sku, name, brand, change: "unchanged", db_price: dbPrice, xls_price: xlsPrice, db_in_stock: dbInStock, xls_in_stock: xlsInStock });
    }
  }

  const counts = {
    total:        diff.length,
    new_products: diff.filter((d) => d.change === "new").length,
    price_up:     diff.filter((d) => d.change === "price_up").length,
    price_down:   diff.filter((d) => d.change === "price_down").length,
    now_in_stock: diff.filter((d) => d.change === "now_in_stock").length,
    now_out:      diff.filter((d) => d.change === "now_out").length,
    unchanged:    diff.filter((d) => d.change === "unchanged").length,
    db_total:     dbMap.size,
  };

  // Return top 200 changed items + all counts (unchanged rows omitted from list to save bandwidth)
  const changed = diff.filter((d) => d.change !== "unchanged");
  const unchanged = diff.filter((d) => d.change === "unchanged");
  // Show first 50 unchanged for reference
  const items = [...changed, ...unchanged.slice(0, 50)];

  return NextResponse.json({ counts, items, mgCount: mgMap.size, wpCount: wpMap.size });
}
