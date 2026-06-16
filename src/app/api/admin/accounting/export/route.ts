import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, q1 } from "@/lib/pg";

export const dynamic = "force-dynamic";

const UA_MONTHS = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

const STATUS_UK: Record<string, string> = {
  pending: "Очікує оплати", processing: "В обробці", "on-hold": "Утримано",
  completed: "Виконано", cancelled: "Скасовано", refunded: "Повернуто",
};

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map((c) => {
    const s = c == null ? "" : String(c);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(",");
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const report = sp.get("report") ?? "register";
  const format = sp.get("format") ?? "csv";
  const from   = sp.get("from") ?? "";
  const to     = sp.get("to")   ?? "";
  const status = sp.get("status") ?? "";
  const search = sp.get("q") ?? "";

  // ── Build data ────────────────────────────────────────────────────────
  if (report === "register") {
    const conds: string[] = ["1=1"];
    const bind: unknown[] = [];
    const p = (v: unknown) => { bind.push(v); return `$${bind.length}`; };

    if (from)   conds.push(`o.created_at >= ${p(from + "T00:00:00Z")}`);
    if (to)     conds.push(`o.created_at <= ${p(to   + "T23:59:59Z")}`);
    if (status) conds.push(`o.status = ${p(status)}`);
    if (search) {
      const like = "%" + search + "%";
      conds.push(`(o.number ILIKE ${p(like)} OR o.first_name ILIKE ${p(like)} OR o.last_name ILIKE ${p(like)} OR o.phone ILIKE ${p(like)})`);
    }

    const rows = await q<{
      id: number; number: string; status: string; created_at: string;
      first_name: string; last_name: string; phone: string; email: string;
      shipping_city: string; payment_method: string; ttn: string; coupon_code: string;
      subtotal: string; discount: string; shipping_cost: string; total: string;
    }>(
      `SELECT o.id, o.number, o.status, o.created_at,
              o.first_name, o.last_name, o.phone, o.email,
              o.shipping_city, o.payment_method, o.ttn, o.coupon_code,
              o.subtotal, o.discount, o.shipping_cost, o.total
       FROM orders o WHERE ${conds.join(" AND ")} ORDER BY o.created_at DESC LIMIT 5000`,
      bind,
    );

    if (format === "csv") {
      const bom = "﻿";
      const header = csvRow(["№ замовлення","Дата","Статус","Покупець","Телефон","Email","Місто","Оплата","ТТН","Промокод","Товари ₴","Знижка ₴","Доставка ₴","Разом ₴"]);
      const lines = rows.map((r) => csvRow([
        r.number,
        new Date(r.created_at).toLocaleDateString("uk-UA"),
        STATUS_UK[r.status] ?? r.status,
        `${r.first_name} ${r.last_name}`,
        r.phone, r.email, r.shipping_city,
        r.payment_method === "cod" ? "Накладений платіж" : r.payment_method,
        r.ttn, r.coupon_code,
        r.subtotal, r.discount, r.shipping_cost, r.total,
      ]));
      const csv = bom + [header, ...lines].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orders-${from || "all"}-${to || "all"}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      const { utils, write } = await import("xlsx");
      const header = ["№ замовлення","Дата","Статус","Ім'я","Прізвище","Телефон","Email","Місто","Оплата","ТТН","Промокод","Товари ₴","Знижка ₴","Доставка ₴","Разом ₴"];
      const data = rows.map((r) => [
        r.number,
        new Date(r.created_at).toLocaleDateString("uk-UA"),
        STATUS_UK[r.status] ?? r.status,
        r.first_name, r.last_name, r.phone, r.email, r.shipping_city,
        r.payment_method === "cod" ? "Накладений платіж" : r.payment_method,
        r.ttn, r.coupon_code,
        Number(r.subtotal), Number(r.discount), Number(r.shipping_cost), Number(r.total),
      ]);
      const ws = utils.aoa_to_sheet([header, ...data]);
      ws["!cols"] = [10,12,14,12,12,14,20,12,12,16,12,11,11,11,11].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Реєстр замовлень");
      const buf = write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="orders-${from || "all"}-${to || "all"}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const summRow = await q1<{ revenue: string; orders: string; discounts: string }>(
        `SELECT COALESCE(SUM(total),0)::int::text AS revenue,
                COUNT(*) FILTER (WHERE status NOT IN ('cancelled','refunded'))::text AS orders,
                COALESCE(SUM(discount),0)::int::text AS discounts
         FROM orders o WHERE ${conds.join(" AND ")} AND status NOT IN ('cancelled','refunded')`,
        bind,
      );
      const tRows = rows.map((r) => `
        <tr>
          <td>${r.number}</td>
          <td>${new Date(r.created_at).toLocaleDateString("uk-UA")}</td>
          <td>${STATUS_UK[r.status] ?? r.status}</td>
          <td>${r.first_name} ${r.last_name}</td>
          <td>${r.phone}</td>
          <td>${r.shipping_city}</td>
          <td>${r.ttn || "—"}</td>
          <td style="text-align:right">${Number(r.total).toLocaleString("uk-UA")}</td>
        </tr>`).join("");
      const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">
<title>Реєстр замовлень</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:24px}
  h1{font-size:16px;margin:0 0 4px}
  .meta{color:#666;margin-bottom:16px;font-size:11px}
  .kpi{display:flex;gap:32px;margin-bottom:20px}
  .kpi div{border:1px solid #ddd;padding:10px 16px;border-radius:4px}
  .kpi b{display:block;font-size:18px}
  table{width:100%;border-collapse:collapse}
  th{background:#f5f5f5;text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:5px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top}
  tr:nth-child(even) td{background:#fafafa}
  @media print{@page{size:A4 landscape;margin:12mm}}
</style></head><body>
<h1>Реєстр замовлень — Mania Group</h1>
<div class="meta">Період: ${from || "—"} — ${to || "—"} · Статус: ${STATUS_UK[status] || "Всі"} · Сформовано: ${new Date().toLocaleDateString("uk-UA")}</div>
<div class="kpi">
  <div><b>${Number(summRow?.revenue).toLocaleString("uk-UA")} ₴</b>Виручка</div>
  <div><b>${summRow?.orders}</b>Замовлень</div>
  <div><b>${Number(summRow?.discounts).toLocaleString("uk-UA")} ₴</b>Знижки</div>
</div>
<table>
<thead><tr><th>№</th><th>Дата</th><th>Статус</th><th>Покупець</th><th>Телефон</th><th>Місто</th><th>ТТН</th><th>Сума ₴</th></tr></thead>
<tbody>${tRows}</tbody>
</table>
</body></html>`;
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
  }

  if (report === "monthly") {
    const year = parseInt(sp.get("year") ?? String(new Date().getFullYear()), 10);
    const rows = await q<{
      month: string; orders: string; revenue: string; avg_check: string; cancelled: string; discounts: string;
    }>(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Kiev', 'YYYY-MM') AS month,
              COUNT(*) FILTER (WHERE status NOT IN ('cancelled','refunded'))::text AS orders,
              COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS revenue,
              COALESCE(AVG(total) FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS avg_check,
              COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancelled,
              COALESCE(SUM(discount) FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS discounts
       FROM orders WHERE created_at >= $1 AND created_at < $2
       GROUP BY 1 ORDER BY 1`,
      [`${year}-01-01`, `${year + 1}-01-01`],
    );

    if (format === "csv") {
      const bom = "﻿";
      const header = csvRow(["Місяць","Замовлень","Виручка ₴","Середній чек ₴","Скасовано","Знижки ₴"]);
      const lines = rows.map((r) => {
        const [, m] = r.month.split("-");
        return csvRow([UA_MONTHS[parseInt(m, 10) - 1] + " " + year, r.orders, r.revenue, r.avg_check, r.cancelled, r.discounts]);
      });
      return new NextResponse(bom + [header, ...lines].join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="monthly-${year}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      const { utils, write } = await import("xlsx");
      const header = ["Місяць","Замовлень","Виручка ₴","Середній чек ₴","Скасовано","Знижки ₴"];
      const data = rows.map((r) => {
        const [, m] = r.month.split("-");
        return [UA_MONTHS[parseInt(m, 10) - 1] + " " + year, Number(r.orders), Number(r.revenue), Number(r.avg_check), Number(r.cancelled), Number(r.discounts)];
      });
      const ws = utils.aoa_to_sheet([header, ...data]);
      ws["!cols"] = [16,12,14,16,12,12].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, `${year} по місяцях`);
      const buf = write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="monthly-${year}.xlsx"`,
        },
      });
    }
  }

  if (report === "products") {
    const conds = ["o.status NOT IN ('cancelled','refunded')"];
    const bind: unknown[] = [];
    const p = (v: unknown) => { bind.push(v); return `$${bind.length}`; };
    if (from) conds.push(`o.created_at >= ${p(from + "T00:00:00Z")}`);
    if (to)   conds.push(`o.created_at <= ${p(to   + "T23:59:59Z")}`);

    const rows = await q<{ product_id: string; name: string; brand: string; qty: string; revenue: string; avg_price: string }>(
      `SELECT oi.product_id, oi.name, oi.brand,
              SUM(oi.quantity)::text AS qty,
              SUM(oi.line_total)::int::text AS revenue,
              AVG(oi.price)::int::text AS avg_price
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE ${conds.join(" AND ")}
       GROUP BY oi.product_id, oi.name, oi.brand ORDER BY SUM(oi.line_total) DESC LIMIT 200`,
      bind,
    );

    if (format === "csv") {
      const bom = "﻿";
      const header = csvRow(["Товар","Бренд","Кількість шт","Виручка ₴","Середня ціна ₴"]);
      const lines = rows.map((r) => csvRow([r.name, r.brand, r.qty, r.revenue, r.avg_price]));
      return new NextResponse(bom + [header, ...lines].join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"top-products.csv\"",
        },
      });
    }

    if (format === "xlsx") {
      const { utils, write } = await import("xlsx");
      const header = ["#","Товар","Бренд","Кількість шт","Виручка ₴","Середня ціна ₴"];
      const data = rows.map((r, i) => [i + 1, r.name, r.brand, Number(r.qty), Number(r.revenue), Number(r.avg_price)]);
      const ws = utils.aoa_to_sheet([header, ...data]);
      ws["!cols"] = [4,40,20,12,14,14].map((w) => ({ wch: w }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Топ товарів");
      const buf = write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=\"top-products.xlsx\"",
        },
      });
    }
  }

  return NextResponse.json({ error: "Unknown report/format" }, { status: 400 });
}
