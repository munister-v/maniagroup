"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FinancePnL, FinanceProfitability, FinanceExpenses,
  FinanceCashflow, FinanceInventory, FinanceCostSettings,
} from "./AdminFinance";

// ── Types ────────────────────────────────────────────────────────────────────

type OrderRow = {
  id: number; number: string; status: string; created_at: string;
  first_name: string; last_name: string; phone: string; email: string;
  shipping_city: string; payment_method: string; ttn: string; coupon_code: string;
  subtotal: string; discount: string; shipping_cost: string; total: string;
  items_count: string; items_qty: string;
};

type RegisterSummary = { revenue: string; orders: string; avg: string; discounts: string };

type MonthRow = {
  month: string; orders: string; revenue: string; avg_check: string; cancelled: string; discounts: string;
};

type ProductRow = {
  product_id: string; name: string; brand: string; qty: string; revenue: string; avg_price: string;
};

type InventorySummary = {
  total: string; in_stock: string; out_stock: string; stock_value: string; avg_price: string; no_photo: string;
};
type InventoryBrand = { brand: string; in_stock: string; out_stock: string; stock_value: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function uah(v: string | number) {
  return Number(v).toLocaleString("uk-UA") + " ₴";
}

const STATUS_UK: Record<string, string> = {
  pending: "Очікує оплати", processing: "В обробці", "on-hold": "Утримано",
  completed: "Виконано", cancelled: "Скасовано", refunded: "Повернуто",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  processing: "bg-blue-50 text-blue-800",
  "on-hold": "bg-orange-50 text-orange-800",
  completed: "bg-green-50 text-green-800",
  cancelled: "bg-red-50 text-red-800",
  refunded: "bg-purple-50 text-purple-800",
};

const UA_MONTHS = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function ExportMenu({ href, label }: { href: (fmt: string) => string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#e6eaec] px-3 text-[11px] uppercase tracking-[0.1em] text-[#2b2d42] hover:border-[#2b2d42]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {label ?? "Вигрузка"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-[90] mt-1 w-36 rounded-[3px] border border-[#e6eaec] bg-white shadow-lg">
            {(["xlsx","csv","pdf"] as const).map((fmt) => (
              <a
                key={fmt}
                href={href(fmt)}
                download
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-[12px] text-[#2b2d42] hover:bg-[#f7f9fa] first:rounded-t-[3px] last:rounded-b-[3px]"
              >
                {fmt === "xlsx" ? "📊" : fmt === "csv" ? "📋" : "🖨"} {fmt.toUpperCase()}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Реєстр замовлень ─────────────────────────────────────────────────────

function RegisterTab() {
  const [from,   setFrom]   = useState(monthStart());
  const [to,     setTo]     = useState(today());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page,   setPage]   = useState(1);

  const [orders,  setOrders]  = useState<OrderRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [summary, setSummary] = useState<RegisterSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const perPage = 50;

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const sp = new URLSearchParams({ report: "register", from, to, page: String(pg) });
    if (status) sp.set("status", status);
    if (search) sp.set("q", search);
    try {
      const r = await fetch(`/api/admin/accounting?${sp}`);
      const d = await r.json();
      setOrders(d.orders ?? []);
      setTotal(d.total ?? 0);
      setSummary(d.summary ?? null);
      setPage(pg);
    } finally { setLoading(false); }
  }, [from, to, status, search]);

  useEffect(() => { load(1); }, [load]);

  function exportHref(fmt: string) {
    const sp = new URLSearchParams({ report: "register", format: fmt, from, to });
    if (status) sp.set("status", status);
    if (search) sp.set("q", search);
    return `/api/admin/accounting/export?${sp}`;
  }

  const totalPages = Math.ceil(total / perPage);
  const inp = "h-9 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none";

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">З</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">По</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp + " pr-7"}>
            <option value="">Всі</option>
            {Object.entries(STATUS_UK).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Пошук</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="№, ім'я, тел, ТТН…" className={inp + " w-52"} />
        </label>
        <div className="ml-auto flex items-end gap-2">
          <ExportMenu href={exportHref} />
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex gap-2">
        {[
          { label: "Сьогодні",  from: today(), to: today() },
          { label: "Цей місяць", from: monthStart(), to: today() },
          { label: "Минулий місяць", from: (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); })(), to: (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0,10); })() },
          { label: "Цей рік", from: new Date().getFullYear() + "-01-01", to: today() },
          { label: "Все", from: "2020-01-01", to: today() },
        ].map((pr) => (
          <button key={pr.label}
            onClick={() => { setFrom(pr.from); setTo(pr.to); }}
            className={`rounded-[3px] border px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${from === pr.from && to === pr.to ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]"}`}
          >
            {pr.label}
          </button>
        ))}
      </div>

      {/* KPI summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Виручка", val: uah(summary.revenue), accent: true },
            { label: "Замовлень", val: summary.orders },
            { label: "Середній чек", val: uah(summary.avg) },
            { label: "Знижки", val: uah(summary.discounts) },
          ].map((k) => (
            <div key={k.label} className={`rounded-[4px] border p-4 ${k.accent ? "border-[#2b2d42] bg-white" : "border-[#e6eaec] bg-white"}`}>
              <p className="text-[22px] font-light tabular-nums text-[#2b2d42]">{k.val}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#8a94a0]">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
              <th className="px-4 py-3 text-left">№</th>
              <th className="px-4 py-3 text-left">Дата</th>
              <th className="px-4 py-3 text-left">Покупець</th>
              <th className="px-4 py-3 text-left">Місто</th>
              <th className="px-4 py-3 text-left">ТТН</th>
              <th className="px-4 py-3 text-center">Статус</th>
              <th className="px-4 py-3 text-right">Товари</th>
              <th className="px-4 py-3 text-right">Знижка</th>
              <th className="px-4 py-3 text-right">Разом</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f7f9fa]">
            {loading && !orders.length && (
              <tr><td colSpan={9} className="py-12 text-center text-[12px] text-[#8a94a0]">Завантаження…</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center text-[12px] text-[#8a94a0]">Замовлень не знайдено</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-[#fafbfc]">
                <td className="px-4 py-3 font-mono text-[12px] text-[#8a94a0]">{o.number}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[12px]">
                  {new Date(o.created_at).toLocaleDateString("uk-UA", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                  <span className="ml-1 text-[#aab4bf]">{new Date(o.created_at).toLocaleTimeString("uk-UA", { hour:"2-digit", minute:"2-digit" })}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-[#2b2d42]">{o.first_name} {o.last_name}</p>
                  <p className="text-[11px] text-[#8a94a0]">{o.phone}</p>
                </td>
                <td className="px-4 py-3 text-[12px] text-[#8a94a0]">{o.shipping_city || "—"}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#8a94a0]">{o.ttn || "—"}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_COLOR[o.status] ?? "bg-[#f5f5f5] text-[#555]"}`}>
                    {STATUS_UK[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{uah(o.subtotal)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[#8a94a0]">
                  {Number(o.discount) > 0 ? <span className="text-green-700">-{uah(o.discount)}</span> : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-[#2b2d42]">{uah(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#8a94a0]">{total} замовлень · стор. {page} з {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e6eaec] text-[#2b2d42] hover:border-[#2b2d42] disabled:opacity-30">‹</button>
            <button disabled={page >= totalPages} onClick={() => load(page + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e6eaec] text-[#2b2d42] hover:border-[#2b2d42] disabled:opacity-30">›</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: По місяцях ──────────────────────────────────────────────────────────

function MonthlyTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [totals, setTotals] = useState<{ revenue: string; orders: string; avg: string; discounts: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/accounting?report=monthly&year=${year}`)
      .then((r) => r.json())
      .then((d) => { setMonths(d.months ?? []); setTotals(d.totals ?? null); })
      .finally(() => setLoading(false));
  }, [year]);

  const maxRev = Math.max(1, ...months.map((m) => Number(m.revenue)));

  function exportHref(fmt: string) {
    return `/api/admin/accounting/export?report=monthly&year=${year}&format=${fmt}`;
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {years.map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`rounded-[3px] border px-4 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                year === y ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]"
              }`}>
              {y}
            </button>
          ))}
        </div>
        <ExportMenu href={exportHref} />
      </div>

      {/* Annual KPIs */}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: `Виручка ${year}`, val: uah(totals.revenue), accent: true },
            { label: "Замовлень", val: totals.orders },
            { label: "Середній чек", val: uah(totals.avg) },
            { label: "Знижки", val: uah(totals.discounts) },
          ].map((k) => (
            <div key={k.label} className={`rounded-[4px] border p-4 ${k.accent ? "border-[#2b2d42]" : "border-[#e6eaec]"} bg-white`}>
              <p className="text-[22px] font-light tabular-nums text-[#2b2d42]">{k.val}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#8a94a0]">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bar chart */}
      {months.length > 0 && (
        <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
          <h3 className="mb-4 text-[10px] uppercase tracking-wider text-[#8a94a0]">Виручка по місяцях</h3>
          <div className="flex h-36 items-end gap-2">
            {months.map((m) => {
              const [, mm] = m.month.split("-");
              const h = Math.round((Number(m.revenue) / maxRev) * 100);
              return (
                <div key={m.month} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-[#aab4bf] opacity-0 group-hover:opacity-100">
                    {Number(m.revenue) > 0 ? Math.round(Number(m.revenue)/1000) + "k" : ""}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-[2px] bg-[#2b2d42] transition-all hover:opacity-80"
                      style={{ height: `${Math.max(2, h)}%` }}
                      title={`${UA_MONTHS[parseInt(mm,10)-1]}: ${uah(m.revenue)}`} />
                  </div>
                  <span className="text-[10px] uppercase text-[#aab4bf]">{UA_MONTHS[parseInt(mm,10)-1].slice(0,3)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
        {loading ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">Завантаження…</div>
        ) : months.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">За {year} рік замовлень немає</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                <th className="px-5 py-3 text-left">Місяць</th>
                <th className="px-5 py-3 text-right">Замовлень</th>
                <th className="px-5 py-3 text-right">Виручка</th>
                <th className="px-5 py-3 text-right">Середній чек</th>
                <th className="px-5 py-3 text-right">Скасовано</th>
                <th className="px-5 py-3 text-right">Знижки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {months.map((m) => {
                const [, mm] = m.month.split("-");
                return (
                  <tr key={m.month} className="hover:bg-[#fafbfc]">
                    <td className="px-5 py-3 font-medium text-[#2b2d42]">{UA_MONTHS[parseInt(mm,10)-1]} {year}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{m.orders}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-[#2b2d42]">{uah(m.revenue)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#8a94a0]">{uah(m.avg_check)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#8a94a0]">{m.cancelled}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700">{Number(m.discounts) > 0 ? uah(m.discounts) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="border-t-2 border-[#e6eaec] font-medium">
                  <td className="px-5 py-3 text-[#2b2d42]">Разом {year}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#2b2d42]">{totals.orders}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#2b2d42]">{uah(totals.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#8a94a0]">{uah(totals.avg)}</td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right tabular-nums text-green-700">{Number(totals.discounts) > 0 ? uah(totals.discounts) : "—"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tab: Топ товарів ─────────────────────────────────────────────────────────

function ProductsTab() {
  const [from,   setFrom]    = useState(monthStart());
  const [to,     setTo]      = useState(today());
  const [rows,   setRows]    = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/accounting?report=products&from=${from}&to=${to}`);
      const d = await r.json();
      setRows(d.products ?? []);
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const maxRev = Math.max(1, ...rows.map((r) => Number(r.revenue)));
  const inp = "h-9 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none";

  function exportHref(fmt: string) {
    return `/api/admin/accounting/export?report=products&from=${from}&to=${to}&format=${fmt}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">З</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">По</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </label>
        <div className="ml-auto flex items-end gap-2">
          <ExportMenu href={exportHref} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
        {loading ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">Завантаження…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">Продажів за вказаний період немає</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                <th className="px-4 py-3 text-center w-8">#</th>
                <th className="px-4 py-3 text-left">Товар</th>
                <th className="px-4 py-3 text-left">Бренд</th>
                <th className="px-4 py-3 text-right">К-сть</th>
                <th className="px-4 py-3 text-right">Виручка</th>
                <th className="px-4 py-3 text-right">Ср. ціна</th>
                <th className="px-4 py-3 w-32">Частка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {rows.map((r, i) => (
                <tr key={r.product_id} className="hover:bg-[#fafbfc]">
                  <td className="px-4 py-2.5 text-center text-[11px] tabular-nums text-[#aab4bf]">{i + 1}</td>
                  <td className="px-4 py-2.5 text-[#2b2d42]">{r.name}</td>
                  <td className="px-4 py-2.5 text-[11px] text-[#8a94a0]">{r.brand}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.qty}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[#2b2d42]">{uah(r.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#8a94a0]">{uah(r.avg_price)}</td>
                  <td className="px-4 py-2.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef2f3]">
                      <div className="h-full rounded-full bg-[#2b2d42]"
                        style={{ width: `${Math.max(2, Math.round((Number(r.revenue) / maxRev) * 100))}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tab: Інвентаризація ──────────────────────────────────────────────────────

function InventoryTab() {
  const [summary,  setSummary]  = useState<InventorySummary | null>(null);
  const [byBrand,  setByBrand]  = useState<InventoryBrand[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/admin/accounting?report=inventory")
      .then((r) => r.json())
      .then((d) => { setSummary(d.summary); setByBrand(d.by_brand ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const maxVal = Math.max(1, ...byBrand.map((b) => Number(b.stock_value)));

  if (loading) return <div className="py-12 text-center text-[12px] text-[#8a94a0]">Завантаження…</div>;

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Всього товарів", val: Number(summary.total).toLocaleString("uk-UA") },
            { label: "В наявності", val: Number(summary.in_stock).toLocaleString("uk-UA"), ok: true },
            { label: "Немає в наявності", val: Number(summary.out_stock).toLocaleString("uk-UA"), bad: true },
            { label: "Без фото", val: Number(summary.no_photo).toLocaleString("uk-UA"), warn: true },
            { label: "Ср. ціна", val: uah(summary.avg_price) },
            { label: "Вартість залишку", val: uah(summary.stock_value), accent: true },
          ].map((k) => (
            <div key={k.label} className={`rounded-[4px] border p-4 bg-white ${k.accent ? "border-[#2b2d42]" : "border-[#e6eaec]"}`}>
              <p className={`text-[22px] font-light tabular-nums ${k.ok ? "text-green-700" : k.bad ? "text-red-600" : k.warn ? "text-amber-600" : "text-[#2b2d42]"}`}>
                {k.val}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#8a94a0]">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
        <h3 className="mb-4 text-[10px] uppercase tracking-wider text-[#8a94a0]">Залишки за брендами (Топ-20)</h3>
        <div className="space-y-2.5">
          {byBrand.map((b) => (
            <div key={b.brand}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#2b2d42]">{b.brand}</span>
                <span className="text-[12px] tabular-nums text-[#8a94a0]">
                  {Number(b.in_stock).toLocaleString("uk-UA")} шт
                  {Number(b.out_stock) > 0 && (
                    <span className="ml-1.5 text-[11px] text-red-500">({Number(b.out_stock)} немає)</span>
                  )}
                </span>
                <span className="w-24 text-right text-[12px] font-medium tabular-nums text-[#2b2d42]">
                  {uah(b.stock_value)}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#eef2f3]">
                <div className="h-full rounded-full bg-[#2b2d42]"
                  style={{ width: `${Math.max(2, Math.round((Number(b.stock_value) / maxVal) * 100))}%` }} />
              </div>
            </div>
          ))}
          {byBrand.length === 0 && (
            <p className="py-4 text-center text-[12px] text-[#8a94a0]">Немає даних</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

type AccountingTab =
  | "register" | "monthly" | "products" | "inventory"
  | "pnl" | "profit" | "expenses" | "cashflow" | "valuation" | "cost";

// Two groups: операційний облік (revenue/ops) and фінанси (profit/cost).
const TAB_GROUPS: { title: string; tabs: { id: AccountingTab; label: string }[] }[] = [
  {
    title: "Операційний облік",
    tabs: [
      { id: "register",  label: "Реєстр замовлень" },
      { id: "monthly",   label: "По місяцях" },
      { id: "products",  label: "Топ товарів" },
      { id: "inventory", label: "Залишки" },
    ],
  },
  {
    title: "Фінанси",
    tabs: [
      { id: "pnl",       label: "Прибутки і збитки" },
      { id: "profit",    label: "Маржа" },
      { id: "expenses",  label: "Витрати" },
      { id: "cashflow",  label: "Грошовий потік" },
      { id: "valuation", label: "Оцінка складу" },
      { id: "cost",      label: "Собівартість" },
    ],
  },
];

export function AdminAccounting({ onToast }: { onToast?: (m: string) => void }) {
  const [tab, setTab] = useState<AccountingTab>("pnl");

  return (
    <div className="space-y-6">
      {/* Tab bar — grouped */}
      <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-[#e6eaec] bg-white p-2">
        {TAB_GROUPS.map((g, gi) => (
          <div key={g.title} className="flex flex-wrap items-center gap-1">
            {gi > 0 && <span className="mx-1 hidden h-5 w-px bg-[#e6eaec] sm:block" />}
            <span className="mr-1 text-[9px] uppercase tracking-[0.14em] text-[#aab4bf]">{g.title}</span>
            {g.tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-[3px] px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                  tab === t.id ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {tab === "register"  && <RegisterTab />}
      {tab === "monthly"   && <MonthlyTab />}
      {tab === "products"  && <ProductsTab />}
      {tab === "inventory" && <InventoryTab />}
      {tab === "pnl"       && <FinancePnL />}
      {tab === "profit"    && <FinanceProfitability />}
      {tab === "expenses"  && <FinanceExpenses />}
      {tab === "cashflow"  && <FinanceCashflow />}
      {tab === "valuation" && <FinanceInventory />}
      {tab === "cost"      && <FinanceCostSettings onToast={onToast} />}
    </div>
  );
}
