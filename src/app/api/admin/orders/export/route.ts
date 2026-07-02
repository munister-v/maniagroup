import { isAdmin } from "@/lib/adminAuth";
import { listOrders } from "@/lib/orders";
import { logActivity } from "@/lib/activity";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const qParam = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const { orders } = await listOrders({
    perPage: 5000,
    status: status || undefined,
    q: qParam || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  logActivity("export", `Замовлення → CSV (${orders.length})`, orders.length);

  const header = [
    "Номер", "Дата", "Статус", "Імʼя", "Прізвище", "Телефон", "Email",
    "Місто", "Відділення НП", "Оплата", "Товари", "Сума",
  ];
  const rows = orders.map((o) => [
    o.number,
    new Date(o.created_at).toLocaleString("uk-UA"),
    o.status,
    o.first_name,
    o.last_name,
    o.phone,
    o.email,
    o.shipping_city,
    o.shipping_branch,
    o.payment_method,
    o.items.map((it) => `${it.name}${it.variation ? ` (${it.variation})` : ""} ×${it.quantity}`).join("; "),
    o.total,
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const bom = "﻿"; // UTF-8 BOM so Excel reads Cyrillic correctly

  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
