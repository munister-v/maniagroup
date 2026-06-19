/**
 * D3 — Receipt from file (прихід з файлу).
 *
 * Parse a supplier invoice (the same OFFERS / MASTER formats the price/stock
 * importer already understands) and turn it into a DRAFT receipt: one line per
 * matched (product, size) with qty + unit purchase cost. The user then reviews
 * the draft in ERP → Прихід and posts it — posting runs the proven receiving
 * engine (stock + weighted-average cost). We never auto-post.
 *
 * Cost column: for an invoice the price IS the purchase cost. Default uses the
 * base price; pass costCol='discount' to take the discounted/net price instead.
 *
 * Server-only.
 */

import { pool } from "./pg";
import { parseImportSmart, resolveOfferTargets, type OfferRow } from "./stockImport";

export type ReceiptCostCol = "base" | "discount";

export type ReceiptFileLine = {
  productId: number;
  name: string;
  sku: string;
  size: string;
  qty: number;
  unitCost: number;
};

export type ReceiptFilePreview = {
  kind: string;
  filename: string;
  ai: boolean;
  totalRows: number;
  matched: ReceiptFileLine[];
  unmatched: { key: string; size?: string }[];
  totalUnits: number;
  totalCost: number;
};

/** Flatten any parsed file into offer-like rows (size + qty + price chain). */
function toOfferRows(parsed: Awaited<ReturnType<typeof parseImportSmart>>): OfferRow[] {
  if (parsed.kind === "offers") return parsed.rows;
  if (parsed.kind === "master") {
    const out: OfferRow[] = [];
    for (const r of parsed.rows) {
      for (const [size, qty] of Object.entries(r.sizes)) {
        out.push({
          external_id: r.kod, factory_article: r.factory_article, barcode: "",
          size, offer_code: "", quantity: qty,
          base_price: r.base_price, discount_price: r.sale_price,
        });
      }
    }
    return out;
  }
  return [];
}

function lineCost(r: OfferRow, costCol: ReceiptCostCol): number {
  if (costCol === "discount" && r.discount_price > 0) return r.discount_price;
  return r.base_price > 0 ? r.base_price : r.discount_price;
}

export async function previewReceiptFromFile(
  buf: Buffer, filename: string, costCol: ReceiptCostCol = "base",
): Promise<ReceiptFilePreview> {
  const parsed = await parseImportSmart(buf, filename);
  const rows = toOfferRows(parsed);
  const base: ReceiptFilePreview = {
    kind: parsed.kind, filename, ai: !!parsed.ai, totalRows: rows.length,
    matched: [], unmatched: [], totalUnits: 0, totalCost: 0,
  };
  if (!rows.length) return base;

  const target = await resolveOfferTargets(rows);
  // Need product names/skus for matched ids.
  const ids = [...new Set(rows.map(target).filter((x): x is number => !!x))];
  const nameMap = new Map<number, { name: string; sku: string }>();
  if (ids.length) {
    const { q } = await import("./pg");
    for (const p of await q<{ id: string; name: string; sku: string }>(
      "SELECT id::text, name, sku FROM products WHERE id = ANY($1)", [ids],
    )) nameMap.set(Number(p.id), { name: p.name, sku: p.sku });
  }

  for (const r of rows) {
    const pid = target(r);
    if (!pid || !r.size.trim()) {
      base.unmatched.push({ key: r.factory_article || r.offer_code || r.external_id || "?", size: r.size });
      continue;
    }
    const qty = r.quantity != null ? r.quantity : 0;
    if (qty <= 0) continue; // an invoice line with no qty isn't a receipt line
    const cost = lineCost(r, costCol);
    const meta = nameMap.get(pid);
    base.matched.push({
      productId: pid, name: meta?.name ?? String(pid), sku: meta?.sku ?? "",
      size: r.size.trim(), qty, unitCost: cost,
    });
    base.totalUnits += qty;
    base.totalCost += qty * cost;
  }
  return base;
}

/**
 * Create a DRAFT receipt from a file. Resolves each matched line to a variant
 * (creating the size variant at stock 0 if it doesn't exist yet, so the draft
 * can reference it), then inserts receipt_items. Returns the new receipt id.
 */
export async function createReceiptFromFile(
  buf: Buffer, filename: string,
  opts: { costCol?: ReceiptCostCol; supplier?: string; supplierId?: number | null; note?: string } = {},
): Promise<{ receiptId: number; lines: number; units: number; total: number; unmatched: number }> {
  const preview = await previewReceiptFromFile(buf, filename, opts.costCol ?? "base");
  if (!preview.matched.length) {
    return { receiptId: 0, lines: 0, units: 0, total: 0, unmatched: preview.unmatched.length };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let supplier = opts.supplier ?? "";
    if (opts.supplierId) {
      const s = await client.query<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [opts.supplierId]);
      if (s.rows[0]) supplier = s.rows[0].name;
    }

    const rcp = await client.query<{ id: string }>(
      `INSERT INTO receipts (supplier, supplier_id, note) VALUES ($1, $2, $3) RETURNING id::text`,
      [supplier, opts.supplierId ?? null, opts.note || `Імпорт накладної: ${filename}`],
    );
    const receiptId = Number(rcp.rows[0].id);

    let units = 0, total = 0;
    for (const ln of preview.matched) {
      // Find or create the variant for (product, size).
      const found = await client.query<{ id: string }>(
        "SELECT id::text FROM product_variants WHERE product_id = $1 AND size = $2", [ln.productId, ln.size],
      );
      let variantId: number;
      if (found.rows.length) {
        variantId = Number(found.rows[0].id);
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO product_variants (product_id, size, stock_qty, updated_by)
           VALUES ($1, $2, 0, 'receipt-file')
           ON CONFLICT (product_id, size) DO UPDATE SET updated_by = 'receipt-file'
           RETURNING id::text`,
          [ln.productId, ln.size],
        );
        variantId = Number(ins.rows[0].id);
      }
      await client.query(
        `INSERT INTO receipt_items (receipt_id, product_id, variant_id, size, name, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [receiptId, ln.productId, variantId, ln.size, ln.name, Math.max(0, Math.round(ln.qty)), Math.max(0, ln.unitCost)],
      );
      units += ln.qty;
      total += ln.qty * ln.unitCost;
    }

    await client.query("COMMIT");
    return { receiptId, lines: preview.matched.length, units, total, unmatched: preview.unmatched.length };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
