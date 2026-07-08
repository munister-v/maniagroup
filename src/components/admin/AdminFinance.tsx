"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ── shared helpers ─────────────────────────────────────────────────────── */

function uah(v: number) {
  return Math.round(v).toLocaleString("uk-UA") + " ₴";
}
function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

const UA_MONTHS = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

const EXPENSE_CATS: { id: string; label: string }[] = [
  { id: "goods", label: "Закупівля товару" },
  { id: "ads", label: "Реклама" },
  { id: "shipping", label: "Доставка / логістика" },
  { id: "salary", label: "Зарплата" },
  { id: "rent", label: "Оренда" },
  { id: "fee", label: "Комісії / еквайринг" },
  { id: "tax", label: "Податки" },
  { id: "other", label: "Інше" },
];
const CAT_LABEL = Object.fromEntries(EXPENSE_CATS.map((c) => [c.id, c.label]));

const inp = "h-9 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none";

function DateRange({ from, to, setFrom, setTo }: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
}) {
  const presets = [
    { label: "Цей місяць", from: monthStart(), to: today() },
    { label: "Минулий місяць",
      from: (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })(),
      to: (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); })() },
    { label: "Цей рік", from: new Date().getFullYear() + "-01-01", to: today() },
    { label: "Все", from: "2020-01-01", to: today() },
  ];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">З</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">По</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
      </label>
      <div className="flex flex-wrap gap-2">
        {presets.map((pr) => (
          <button key={pr.label} onClick={() => { setFrom(pr.from); setTo(pr.to); }}
            className={`rounded-[3px] border px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              from === pr.from && to === pr.to ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]"
            }`}>{pr.label}</button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, val, tone }: { label: string; val: string; tone?: "ok" | "bad" | "accent" }) {
  const color = tone === "ok" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-[#2b2d42]";
  return (
    <div className={`rounded-[4px] border p-4 bg-white ${tone === "accent" ? "border-[#2b2d42]" : "border-[#e6eaec]"}`}>
      <p className={`text-[22px] font-light tabular-nums ${color}`}>{val}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#8a94a0]">{label}</p>
    </div>
  );
}

function Loading() {
  return <div className="py-12 text-center text-[12px] text-[#8a94a0]">Завантаження…</div>;
}

/* ── Tab: Прибуток і збитки (P&L) ───────────────────────────────────────── */

type Dash = {
  revenue: number; cogs: number; gross: number; expenses: number; net: number;
  orders: number; grossMargin: number; netMargin: number;
};
type PnlMonth = { month: string; revenue: number; cogs: number; gross: number; expenses: number; net: number };

export function FinancePnL() {
  const [from, setFrom] = useState(new Date().getFullYear() + "-01-01");
  const [to, setTo] = useState(today());
  const [dash, setDash] = useState<Dash | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState<PnlMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/finance?report=dashboard&from=${from}&to=${to}`)
      .then((r) => r.json()).then(setDash).finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    fetch(`/api/admin/finance?report=pnl&year=${year}`)
      .then((r) => r.json()).then((d) => setMonths(d.months ?? []));
  }, [year]);

  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.net)));
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-5">
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />

      {loading && !dash ? <Loading /> : dash && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Виручка" val={uah(dash.revenue)} tone="accent" />
          <Kpi label="Собівартість" val={uah(dash.cogs)} />
          <Kpi label="Валовий прибуток" val={uah(dash.gross)} tone={dash.gross >= 0 ? "ok" : "bad"} />
          <Kpi label="Витрати" val={uah(dash.expenses)} />
          <Kpi label="Чистий прибуток" val={uah(dash.net)} tone={dash.net >= 0 ? "ok" : "bad"} />
          <Kpi label="Чиста маржа" val={pct(dash.netMargin)} />
        </div>
      )}

      {/* P&L waterfall-ish explainer */}
      {dash && (
        <div className="rounded-[4px] border border-[#e6eaec] bg-white p-4 text-[12px] text-[#5b5346]">
          <span className="tabular-nums">{uah(dash.revenue)}</span> виручка
          <span className="mx-1.5 text-[#aab4bf]">−</span>
          <span className="tabular-nums">{uah(dash.cogs)}</span> собівартість
          <span className="mx-1.5 text-[#aab4bf]">=</span>
          <span className="tabular-nums font-medium text-[#2b2d42]">{uah(dash.gross)}</span> валовий
          <span className="mx-1.5 text-[#aab4bf]">−</span>
          <span className="tabular-nums">{uah(dash.expenses)}</span> витрати
          <span className="mx-1.5 text-[#aab4bf]">=</span>
          <span className={`tabular-nums font-medium ${dash.net >= 0 ? "text-green-700" : "text-red-600"}`}>{uah(dash.net)}</span> чистими
          <span className="ml-2 text-[#8a94a0]">· {dash.orders} замовлень · валова маржа {pct(dash.grossMargin)}</span>
        </div>
      )}

      {/* Year P&L */}
      <div className="flex items-center gap-2">
        {years.map((y) => (
          <button key={y} onClick={() => setYear(y)}
            className={`rounded-[3px] border px-4 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              year === y ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]"
            }`}>{y}</button>
        ))}
      </div>

      {months.length > 0 && (
        <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
          <h3 className="mb-4 text-[10px] uppercase tracking-wider text-[#8a94a0]">Чистий прибуток по місяцях</h3>
          <div className="flex h-36 items-end gap-2">
            {months.map((m) => {
              const h = Math.round((Math.abs(m.net) / maxAbs) * 100);
              const mm = parseInt(m.month.split("-")[1], 10);
              return (
                <div key={m.month} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-[#aab4bf] opacity-0 group-hover:opacity-100">
                    {Math.round(m.net / 1000)}k
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div className={`w-full rounded-t-[2px] transition-all hover:opacity-80 ${m.net >= 0 ? "bg-[#2b2d42]" : "bg-red-400"}`}
                      style={{ height: `${Math.max(2, h)}%` }}
                      title={`${UA_MONTHS[mm - 1]}: ${uah(m.net)} чистими`} />
                  </div>
                  <span className="text-[10px] uppercase text-[#aab4bf]">{UA_MONTHS[mm - 1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
        {months.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">За {year} рік даних немає</div>
        ) : (
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                <th className="px-4 py-3 text-left">Місяць</th>
                <th className="px-4 py-3 text-right">Виручка</th>
                <th className="px-4 py-3 text-right">Собівартість</th>
                <th className="px-4 py-3 text-right">Валовий</th>
                <th className="px-4 py-3 text-right">Витрати</th>
                <th className="px-4 py-3 text-right">Чистий</th>
                <th className="px-4 py-3 text-right">Маржа</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {months.map((m) => {
                const mm = parseInt(m.month.split("-")[1], 10);
                return (
                  <tr key={m.month} className="hover:bg-[#fafbfc]">
                    <td className="px-4 py-2.5 font-medium text-[#2b2d42]">{UA_MONTHS[mm - 1]} {year}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{uah(m.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#8a94a0]">{uah(m.cogs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{uah(m.gross)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#8a94a0]">{m.expenses > 0 ? uah(m.expenses) : "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${m.net >= 0 ? "text-green-700" : "text-red-600"}`}>{uah(m.net)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#8a94a0]">{m.revenue > 0 ? pct(m.net / m.revenue) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#e6eaec] font-medium">
                <td className="px-4 py-3 text-[#2b2d42]">Разом {year}</td>
                <td className="px-4 py-3 text-right tabular-nums">{uah(months.reduce((s, m) => s + m.revenue, 0))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[#8a94a0]">{uah(months.reduce((s, m) => s + m.cogs, 0))}</td>
                <td className="px-4 py-3 text-right tabular-nums">{uah(months.reduce((s, m) => s + m.gross, 0))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[#8a94a0]">{uah(months.reduce((s, m) => s + m.expenses, 0))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700">{uah(months.reduce((s, m) => s + m.net, 0))}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Tab: Маржа по товарах/брендах ──────────────────────────────────────── */

type ProfRow = {
  label: string; sublabel: string; qty: number; revenue: number; cogs: number;
  profit: number; margin: number; markup: number;
};

export function FinanceProfitability() {
  const [by, setBy] = useState<"product" | "brand">("product");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<ProfRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/finance?report=profitability&by=${by}&from=${from}&to=${to}`)
      .then((r) => r.json()).then((d) => setRows(d.items ?? [])).finally(() => setLoading(false));
  }, [by, from, to]);
  useEffect(() => { load(); }, [load]);

  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const maxProfit = Math.max(1, ...rows.map((r) => r.profit));
  // ABC: cumulative profit share → A ≤80%, B ≤95%, else C
  let cum = 0;
  const abc = rows.map((r) => {
    cum += r.profit;
    const share = totalProfit > 0 ? cum / totalProfit : 1;
    return share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-[3px] border border-[#e6eaec] p-0.5">
          {(["product", "brand"] as const).map((m) => (
            <button key={m} onClick={() => setBy(m)}
              className={`rounded-[2px] px-4 py-1.5 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                by === m ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"
              }`}>{m === "product" ? "По товарах" : "По брендах"}</button>
          ))}
        </div>
      </div>
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />

      <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
        {loading ? <Loading /> : rows.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">Продажів за період немає</div>
        ) : (
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                <th className="px-3 py-3 text-center w-8">ABC</th>
                <th className="px-3 py-3 text-left">{by === "brand" ? "Бренд" : "Товар"}</th>
                <th className="px-3 py-3 text-right">К-сть</th>
                <th className="px-3 py-3 text-right">Виручка</th>
                <th className="px-3 py-3 text-right">Собів.</th>
                <th className="px-3 py-3 text-right">Прибуток</th>
                <th className="px-3 py-3 text-right">Маржа</th>
                <th className="px-3 py-3 text-right">Націнка</th>
                <th className="px-3 py-3 w-28">Частка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-[#fafbfc]">
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block w-5 rounded-full text-[10px] font-medium ${
                      abc[i] === "A" ? "bg-green-100 text-green-800" : abc[i] === "B" ? "bg-amber-100 text-amber-800" : "bg-[#eef2f3] text-[#8a94a0]"
                    }`}>{abc[i]}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-[#2b2d42]">{r.label}</p>
                    {r.sublabel && <p className="text-[11px] text-[#8a94a0]">{r.sublabel}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{uah(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#8a94a0]">{uah(r.cogs)}</td>
                  <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${r.profit >= 0 ? "text-green-700" : "text-red-600"}`}>{uah(r.profit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#8a94a0]">{pct(r.margin)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#8a94a0]">{pct(r.markup)}</td>
                  <td className="px-3 py-2.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef2f3]">
                      <div className="h-full rounded-full bg-[#2b2d42]" style={{ width: `${Math.max(2, Math.round((r.profit / maxProfit) * 100))}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > 0 && (
        <p className="text-[11px] text-[#8a94a0]">
          ABC-аналіз: <b className="text-green-800">A</b> — товари, що дають 80% прибутку,{" "}
          <b className="text-amber-800">B</b> — наступні 15%, <b>C</b> — решта.
        </p>
      )}
    </div>
  );
}

/* ── Tab: Витрати ───────────────────────────────────────────────────────── */

type Expense = { id: number; spent_on: string; category: string; amount: number; note: string };

export function FinanceExpenses() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [items, setItems] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [byCat, setByCat] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // add form
  const [date, setDate] = useState(today());
  const [cat, setCat] = useState("ads");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/finance/expenses?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setTotal(d.total ?? 0); setByCat(d.byCategory ?? {}); })
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!Number(amount)) return;
    setSaving(true);
    await fetch("/api/admin/finance/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spent_on: date, category: cat, amount: Number(amount), note }),
    });
    setAmount(""); setNote(""); setSaving(false); load();
  }
  async function del(id: number) {
    if (!confirm("Видалити витрату?")) return;
    await fetch(`/api/admin/finance/expenses?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5">
      {/* Add */}
      <div className="rounded-[4px] border border-[#e6eaec] bg-white p-4">
        <h3 className="mb-3 text-[10px] uppercase tracking-wider text-[#8a94a0]">Додати витрату</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Категорія</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={inp + " pr-7"}>
              {EXPENSE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Сума, ₴</span>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={inp + " w-32"} />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Примітка</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр. Facebook Ads, червень" className={inp + " w-full"} />
          </label>
          <button onClick={add} disabled={saving || !Number(amount)}
            className="flex h-9 items-center rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
            {saving ? "…" : "Додати"}
          </button>
        </div>
      </div>

      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Всього витрат" val={uah(total)} tone="accent" />
        {Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => (
          <Kpi key={c} label={CAT_LABEL[c] ?? c} val={uah(v)} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
        {loading ? <Loading /> : items.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-[#8a94a0]">Витрат за період немає</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-left">Категорія</th>
                <th className="px-4 py-3 text-left">Примітка</th>
                <th className="px-4 py-3 text-right">Сума</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-[#fafbfc]">
                  <td className="px-4 py-2.5 whitespace-nowrap text-[12px]">{new Date(e.spent_on).toLocaleDateString("uk-UA")}</td>
                  <td className="px-4 py-2.5 text-[12px]">{CAT_LABEL[e.category] ?? e.category}</td>
                  <td className="px-4 py-2.5 text-[12px] text-[#8a94a0]">{e.note || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[#2b2d42]">{uah(e.amount)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => del(e.id)} className="text-[#aab4bf] hover:text-red-600" title="Видалити">✕</button>
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

/* ── Tab: Грошовий потік ────────────────────────────────────────────────── */

type CashTotals = { paid: number; pending: number; refunded: number; expenses: number };
type CashDay = { day: string; paid: number; pending: number; refunded: number; expenses: number };

export function FinanceCashflow() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [days, setDays] = useState<CashDay[]>([]);
  const [totals, setTotals] = useState<CashTotals | null>(null);
  const [net, setNet] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/finance?report=cashflow&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { setDays(d.days ?? []); setTotals(d.totals ?? null); setNet(d.net ?? 0); })
      .finally(() => setLoading(false));
  }, [from, to]);

  const maxIn = Math.max(1, ...days.map((d) => d.paid));

  return (
    <div className="space-y-5">
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {loading ? <Loading /> : (
        <>
          {totals && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Kpi label="Надійшло (оплач.)" val={uah(totals.paid)} tone="ok" />
              <Kpi label="Очікується" val={uah(totals.pending)} />
              <Kpi label="Повернення" val={uah(totals.refunded)} tone="bad" />
              <Kpi label="Витрати" val={uah(totals.expenses)} tone="bad" />
              <Kpi label="Чистий потік" val={uah(net)} tone={net >= 0 ? "ok" : "bad"} />
            </div>
          )}
          {days.length > 0 && (
            <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
              <h3 className="mb-4 text-[10px] uppercase tracking-wider text-[#8a94a0]">Надходження по днях</h3>
              <div className="flex h-32 items-end gap-1 overflow-x-auto">
                {days.map((d) => (
                  <div key={d.day} className="flex min-w-[10px] flex-1 flex-col items-center" title={`${new Date(d.day).toLocaleDateString("uk-UA")}: +${uah(d.paid)}`}>
                    <div className="flex w-full flex-1 items-end">
                      <div className="w-full rounded-t-[2px] bg-[#2b2d42]" style={{ height: `${Math.max(2, Math.round((d.paid / maxIn) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-[4px] border border-[#e6eaec] bg-white">
            {days.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-[#8a94a0]">Руху коштів за період немає</div>
            ) : (
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                    <th className="px-4 py-3 text-left">Дата</th>
                    <th className="px-4 py-3 text-right">Надійшло</th>
                    <th className="px-4 py-3 text-right">Очікується</th>
                    <th className="px-4 py-3 text-right">Повернення</th>
                    <th className="px-4 py-3 text-right">Витрати</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f9fa]">
                  {days.map((d) => (
                    <tr key={d.day} className="hover:bg-[#fafbfc]">
                      <td className="px-4 py-2.5 text-[12px]">{new Date(d.day).toLocaleDateString("uk-UA")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{d.paid > 0 ? uah(d.paid) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#8a94a0]">{d.pending > 0 ? uah(d.pending) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-500">{d.refunded > 0 ? uah(d.refunded) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#8a94a0]">{d.expenses > 0 ? uah(d.expenses) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Tab: Оцінка складу ─────────────────────────────────────────────────── */

type InvSummary = { skus: number; units: number; cost_value: number; retail_value: number; potential_profit: number; out_units: number };
type InvBrand = { brand: string; units: number; cost_value: number; retail_value: number };

export function FinanceInventory() {
  const [summary, setSummary] = useState<InvSummary | null>(null);
  const [byBrand, setByBrand] = useState<InvBrand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/finance?report=inventory")
      .then((r) => r.json())
      .then((d) => { setSummary(d.summary); setByBrand(d.by_brand ?? []); })
      .finally(() => setLoading(false));
  }, []);

  const maxVal = Math.max(1, ...byBrand.map((b) => b.retail_value));
  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Позицій в наявності" val={summary.skus.toLocaleString("uk-UA")} />
          <Kpi label="Одиниць на складі" val={summary.units.toLocaleString("uk-UA")} />
          <Kpi label="Вартість у закупці" val={uah(summary.cost_value)} tone="accent" />
          <Kpi label="Вартість у роздробі" val={uah(summary.retail_value)} />
          <Kpi label="Потенц. прибуток" val={uah(summary.potential_profit)} tone="ok" />
          <Kpi label="Немає в наявності" val={summary.out_units.toLocaleString("uk-UA")} tone="bad" />
        </div>
      )}
      <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
        <h3 className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-wider text-[#8a94a0]">
          <span>Вартість складу за брендами (Топ-25)</span>
          <span>закупка / роздріб</span>
        </h3>
        <div className="space-y-2.5">
          {byBrand.map((b) => (
            <div key={b.brand}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#2b2d42]">{b.brand}</span>
                <span className="text-[11px] tabular-nums text-[#8a94a0]">{b.units.toLocaleString("uk-UA")} шт</span>
                <span className="w-44 text-right text-[12px] tabular-nums">
                  <span className="font-medium text-[#2b2d42]">{uah(b.cost_value)}</span>
                  <span className="mx-1 text-[#aab4bf]">/</span>
                  <span className="text-[#8a94a0]">{uah(b.retail_value)}</span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#eef2f3]">
                <div className="h-full rounded-full bg-[#2b2d42]" style={{ width: `${Math.max(2, Math.round((b.retail_value / maxVal) * 100))}%` }} />
              </div>
            </div>
          ))}
          {byBrand.length === 0 && <p className="py-4 text-center text-[12px] text-[#8a94a0]">Немає даних</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Tab: Собівартість (settings + brand rules + manual editor) ─────────── */

type CostRule = { brand: string; pct: number };
type CostProduct = {
  id: string; name: string; brand: string; sku: string; price: number;
  regular_price: number; cost_price: number | null; cost_source: string;
  resolved_cost: number; profit: number; margin: number;
};

export function FinanceCostSettings({ onToast }: { onToast?: (m: string) => void }) {
  const [markupPct, setMarkupPct] = useState(100);
  const [basis, setBasis] = useState<"markup" | "base">("markup");
  const [rules, setRules] = useState<CostRule[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [newBrand, setNewBrand] = useState("");
  const [newPct, setNewPct] = useState("");

  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<CostProduct[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/admin/finance/settings").then((r) => r.json()).then((d) => {
      setMarkupPct(d.settings.markupPct); setBasis(d.settings.basis);
      setRules(d.rules ?? []); setLoaded(true);
    });
  }, []);

  async function saveSettings(next: { markupPct?: number; basis?: "markup" | "base" }) {
    const r = await fetch("/api/admin/finance/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
    });
    const d = await r.json();
    setRules(d.rules ?? []);
    onToast?.("Налаштування собівартості збережено ✓");
  }
  async function addRule() {
    if (!newBrand.trim()) return;
    const r = await fetch("/api/admin/finance/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: { brand: newBrand.trim(), pct: Number(newPct) || 0 } }),
    });
    const d = await r.json(); setRules(d.rules ?? []); setNewBrand(""); setNewPct("");
  }
  async function delRule(brand: string) {
    const r = await fetch("/api/admin/finance/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteBrand: brand }),
    });
    const d = await r.json(); setRules(d.rules ?? []);
  }

  const loadProducts = useCallback(() => {
    setSearching(true);
    fetch(`/api/admin/finance/cost?q=${encodeURIComponent(search)}`)
      .then((r) => r.json()).then((d) => setProducts(d.products ?? [])).finally(() => setSearching(false));
  }, [search]);
  useEffect(() => { const t = setTimeout(loadProducts, 300); return () => clearTimeout(t); }, [loadProducts]);

  async function setCost(id: string, cost: number | null) {
    await fetch("/api/admin/finance/cost", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, cost }),
    });
    loadProducts();
  }

  if (!loaded) return <Loading />;

  return (
    <div className="space-y-6">
      {/* Global model */}
      <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
        <h3 className="mb-1 text-[13px] font-medium text-[#2b2d42]">Як рахується собівартість</h3>
        <p className="mb-4 text-[12px] text-[#8a94a0]">
          У вигрузках MG/WP немає закупочної ціни, тож собівартість визначається так (за пріоритетом):
          <b> ручна ціна по товару</b> → <b>правило по бренду</b> → <b>загальна формула нижче</b>.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-1 rounded-[3px] border border-[#e6eaec] p-0.5">
            {([["markup", "Націнка від ціни продажу"], ["base", "% від «Ціни базової»"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => { setBasis(m); saveSettings({ basis: m }); }}
                className={`rounded-[2px] px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] transition-colors ${
                  basis === m ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"
                }`}>{label}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">
              {basis === "markup" ? "Націнка, %" : "Закупка = % від базової"}
            </span>
            <div className="flex items-center gap-2">
              <input type="number" value={markupPct}
                onChange={(e) => setMarkupPct(Number(e.target.value))}
                onBlur={() => saveSettings({ markupPct })}
                className={inp + " w-28"} />
              <button onClick={() => saveSettings({ markupPct })}
                className="h-9 rounded-[3px] border border-[#e6eaec] px-3 text-[11px] uppercase tracking-[0.1em] hover:border-[#2b2d42]">OK</button>
            </div>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-[#8a94a0]">
          {basis === "markup"
            ? `Приклад: товар продається за 1000 ₴, націнка ${markupPct}% → собівартість ${Math.round(1000 * 100 / (100 + markupPct))} ₴.`
            : `Приклад: «Ціна базова» 1000 ₴, коефіцієнт ${markupPct}% → собівартість ${Math.round(10 * markupPct)} ₴.`}
        </p>
      </div>

      {/* Brand rules */}
      <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
        <h3 className="mb-3 text-[13px] font-medium text-[#2b2d42]">Правила по брендах</h3>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Бренд (напр. MOSCHINO)" className={inp + " w-56"} />
          <input type="number" value={newPct} onChange={(e) => setNewPct(e.target.value)} placeholder={basis === "markup" ? "націнка %" : "% від базової"} className={inp + " w-36"} />
          <button onClick={addRule} disabled={!newBrand.trim()}
            className="h-9 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">Додати</button>
        </div>
        {rules.length === 0 ? (
          <p className="text-[12px] text-[#8a94a0]">Правил немає — для всіх брендів діє загальна формула.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {rules.map((r) => (
              <span key={r.brand} className="flex items-center gap-2 rounded-full border border-[#e6eaec] bg-[#f7f9fa] px-3 py-1 text-[12px]">
                <b className="text-[#2b2d42]">{r.brand}</b>
                <span className="text-[#8a94a0]">{r.pct}%</span>
                <button onClick={() => delRule(r.brand)} className="text-[#aab4bf] hover:text-red-600">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Manual per-product cost editor */}
      <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
        <h3 className="mb-3 text-[13px] font-medium text-[#2b2d42]">Ручна собівартість по товарах</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук: назва, бренд або артикул…" className={inp + " mb-3 w-full max-w-md"} />
        <div className="overflow-x-auto">
          {searching ? <Loading /> : products.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[#8a94a0]">Нічого не знайдено</p>
          ) : (
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                  <th className="px-3 py-2 text-left">Товар</th>
                  <th className="px-3 py-2 text-right">Ціна</th>
                  <th className="px-3 py-2 text-right">Собівартість</th>
                  <th className="px-3 py-2 text-right">Прибуток</th>
                  <th className="px-3 py-2 text-right">Маржа</th>
                  <th className="px-3 py-2 text-center">Джерело</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f7f9fa]">
                {products.map((p) => (
                  <CostRow key={p.id} p={p} onSet={setCost} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function CostRow({ p, onSet }: { p: CostProduct; onSet: (id: string, cost: number | null) => void }) {
  const [val, setVal] = useState(p.cost_price != null ? String(Math.round(p.cost_price)) : "");
  useEffect(() => { setVal(p.cost_price != null ? String(Math.round(p.cost_price)) : ""); }, [p.cost_price]);
  return (
    <tr className="hover:bg-[#fafbfc]">
      <td className="px-3 py-2">
        <p className="text-[#2b2d42]">{p.name}</p>
        <p className="text-[11px] text-[#8a94a0]">{p.brand} · {p.sku}</p>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{uah(p.price)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <input value={val} onChange={(e) => setVal(e.target.value)}
            onBlur={() => { const n = Number(val); if ((p.cost_price ?? null) !== (n || null)) onSet(p.id, n > 0 ? n : null); }}
            placeholder={String(Math.round(p.resolved_cost))}
            className="h-8 w-24 rounded-[3px] border border-[#e6eaec] px-2 text-right text-[12px] tabular-nums focus:border-[#2b2d42] focus:outline-none" />
          <span className="text-[11px] text-[#aab4bf]">₴</span>
        </div>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${p.profit >= 0 ? "text-green-700" : "text-red-600"}`}>{uah(p.profit)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-[#8a94a0]">{pct(p.margin)}</td>
      <td className="px-3 py-2 text-center">
        <span className={`text-[10px] uppercase tracking-wider ${
          p.cost_source === "manual" ? "text-[#2b2d42]" : p.cost_source === "import" ? "text-blue-600" : "text-[#aab4bf]"
        }`}>
          {p.cost_source === "manual" ? "вручну" : p.cost_source === "import" ? "імпорт" : "формула"}
        </span>
      </td>
    </tr>
  );
}
