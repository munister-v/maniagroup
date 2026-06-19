"use client";

import { useEffect, useState } from "react";

type SalesData = {
  byDay: { d: string; revenue: string; orders: string }[];
  byBrand: { brand: string; revenue: string; units: string }[];
  byCategory: { category: string; revenue: string; units: string }[];
  totals: { revenue: string; orders: string; units: string; avg_order: string };
};
type MarginData = {
  byBrand: { brand: string; revenue: string; cost: string; margin_pct: string }[];
};
type StockData = {
  byBrand: { brand: string; units: string; retail_value: string; cost_value: string }[];
  lowStock: { id: string; name: string; brand: string; stock_qty: string }[];
};
type TurnoverData = {
  byType: { type: string; count: string; total_delta: string }[];
  topMoved: { product_id: string; name: string; brand: string; units_sold: string }[];
};

const MOVE_LABEL: Record<string, string> = {
  import: "Імпорт", receipt: "Прихід", sale: "Продаж",
  return: "Повернення", adjust: "Коригування", writeoff: "Списання",
};

function uah(n: number) { return Math.round(n).toLocaleString("uk-UA") + " ₴"; }
function pct(n: number) { return n.toFixed(1) + "%"; }

/* ── Tiny SVG bar chart ── */
function BarChart({ data, valueKey, labelKey, color = "#007B6E" }: {
  data: Record<string, string>[];
  valueKey: string;
  labelKey: string;
  color?: string;
}) {
  if (!data.length) return <p className="py-4 text-center text-[12px] text-[#9E9E9E]">Немає даних</p>;
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const H = 80, BAR_H = 56;

  return (
    <svg viewBox={`0 0 ${data.length * 24} ${H}`} className="w-full" preserveAspectRatio="none">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        const h = Math.max((v / max) * BAR_H, v > 0 ? 2 : 0);
        return (
          <g key={i}>
            <rect x={i * 24 + 2} y={BAR_H - h} width={20} height={h} fill={color} opacity="0.85" rx="2" />
            <text x={i * 24 + 12} y={H - 2} textAnchor="middle" fontSize="7" fill="#9E9E9E">
              {String(d[labelKey]).slice(-5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Horizontal rank list ── */
function RankList({ items, valueFormatter }: {
  items: { label: string; value: number; sub?: string }[];
  valueFormatter?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2">
      {items.slice(0, 10).map((item, i) => (
        <li key={i}>
          <div className="flex items-center justify-between text-[12px] mb-0.5">
            <span className="truncate max-w-[55%] text-[#212121]">{item.label}</span>
            <span className="text-[#9E9E9E] tabular-nums">{valueFormatter ? valueFormatter(item.value) : item.value}</span>
          </div>
          <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
            <div className="h-full bg-[#007B6E] rounded-full" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          {item.sub && <div className="text-[10px] text-[#BDBDBD] mt-0.5">{item.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

const card = "border border-[#E0E0E0] bg-white p-4";
const cardTitle = "mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9E9E9E]";
const statNum = "text-[26px] font-light text-[#212121] tabular-nums";
const statSub = "text-[11px] text-[#9E9E9E] mt-0.5";

export function ErpReports() {
  const [period, setPeriod] = useState("month");
  const [type, setType] = useState("sales");
  const [data, setData] = useState<SalesData | MarginData | StockData | TurnoverData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setData(null);
    fetch(`/api/erp/reports?period=${period}&type=${type}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [period, type]);

  const tabBtn = (t: string, label: string) => (
    <button onClick={() => setType(t)}
      className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
        type === t ? "border-[#007B6E] bg-[#007B6E] text-white" : "border-[#E0E0E0] bg-white text-[#616161] hover:border-[#007B6E]"
      }`}>{label}</button>
  );
  const periBtn = (p: string, label: string) => (
    <button onClick={() => setPeriod(p)}
      className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
        period === p ? "text-[#007B6E] font-semibold" : "text-[#9E9E9E] hover:text-[#007B6E]"
      }`}>{label}</button>
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-normal text-[#212121]">Звіти</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">{periBtn("month", "30 днів")}{periBtn("quarter", "90 днів")}{periBtn("year", "Рік")}</div>
          <div className="h-5 w-px bg-[#E0E0E0]" />
          <div className="flex gap-1.5">
            {tabBtn("sales", "Продажі")}
            {tabBtn("margin", "Маржа")}
            {tabBtn("stock", "Залишки")}
            {tabBtn("turnover", "Оборот")}
          </div>
        </div>
      </div>

      {loading && <div className="py-16 text-center text-[#9E9E9E]">Завантаження…</div>}

      {!loading && type === "sales" && data && (
        <SalesReport data={data as SalesData} />
      )}
      {!loading && type === "margin" && data && (
        <MarginReport data={data as MarginData} />
      )}
      {!loading && type === "stock" && data && (
        <StockReport data={data as StockData} />
      )}
      {!loading && type === "turnover" && data && (
        <TurnoverReport data={data as TurnoverData} />
      )}
    </div>
  );
}

function SalesReport({ data }: { data: SalesData }) {
  const t = data.totals ?? {};
  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Виручка", value: uah(Number(t.revenue ?? 0)) },
          { label: "Замовлень", value: Number(t.orders ?? 0).toLocaleString("uk-UA") },
          { label: "Одиниць продано", value: Number(t.units ?? 0).toLocaleString("uk-UA") },
          { label: "Серед. замовлення", value: uah(Number(t.avg_order ?? 0)) },
        ].map((k) => (
          <div key={k.label} className="border border-[#E0E0E0] bg-white p-4">
            <p className={statSub}>{k.label}</p>
            <p className={statNum}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={card}>
          <p className={cardTitle}>Виручка по днях</p>
          <BarChart data={data.byDay} valueKey="revenue" labelKey="d" />
        </div>
        <div className={card}>
          <p className={cardTitle}>Замовлення по днях</p>
          <BarChart data={data.byDay} valueKey="orders" labelKey="d" color="#F57C00" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={card}>
          <p className={cardTitle}>Топ бренди (виручка)</p>
          <RankList items={data.byBrand.map((b) => ({ label: b.brand, value: Number(b.revenue), sub: `${b.units} од.` }))} valueFormatter={uah} />
        </div>
        <div className={card}>
          <p className={cardTitle}>Топ категорії (виручка)</p>
          <RankList items={data.byCategory.map((c) => ({ label: c.category, value: Number(c.revenue), sub: `${c.units} од.` }))} valueFormatter={uah} />
        </div>
      </div>
    </div>
  );
}

function MarginReport({ data }: { data: MarginData }) {
  return (
    <div className={card}>
      <p className={cardTitle}>Маржа по брендах</p>
      <table className="w-full text-[13px]">
        <thead><tr className="text-[11px] text-[#9E9E9E] border-b border-[#F5F5F5]">
          <th className="py-2 text-left font-normal">Бренд</th>
          <th className="py-2 text-right font-normal">Виручка</th>
          <th className="py-2 text-right font-normal">Собівартість</th>
          <th className="py-2 text-right font-normal">Маржа</th>
        </tr></thead>
        <tbody className="divide-y divide-[#F5F5F5]">
          {data.byBrand.map((b) => {
            const m = Number(b.margin_pct);
            return (
              <tr key={b.brand}>
                <td className="py-2 text-[#212121]">{b.brand}</td>
                <td className="py-2 text-right tabular-nums">{uah(Number(b.revenue))}</td>
                <td className="py-2 text-right tabular-nums text-[#9E9E9E]">{uah(Number(b.cost))}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${m >= 30 ? "text-green-700" : m >= 15 ? "text-amber-600" : "text-red-600"}`}>{pct(m)}</td>
              </tr>
            );
          })}
          {!data.byBrand.length && <tr><td colSpan={4} className="py-6 text-center text-[#9E9E9E]">Немає даних</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StockReport({ data }: { data: StockData }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className={card}>
        <p className={cardTitle}>Залишки по брендах</p>
        <table className="w-full text-[13px]">
          <thead><tr className="text-[11px] text-[#9E9E9E] border-b border-[#F5F5F5]">
            <th className="py-2 text-left font-normal">Бренд</th>
            <th className="py-2 text-right font-normal">Одиниць</th>
            <th className="py-2 text-right font-normal">Роздрібна вартість</th>
          </tr></thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {data.byBrand.map((b) => (
              <tr key={b.brand}>
                <td className="py-2">{b.brand}</td>
                <td className="py-2 text-right tabular-nums">{Number(b.units).toLocaleString("uk-UA")}</td>
                <td className="py-2 text-right tabular-nums">{uah(Number(b.retail_value))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={card}>
        <p className={cardTitle}>Критично низькі залишки</p>
        <ul className="divide-y divide-[#F5F5F5] text-[13px]">
          {data.lowStock.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <div>
                <span className="text-[#212121]">{p.name}</span>
                <span className="ml-2 text-[#9E9E9E] text-[11px]">{p.brand}</span>
              </div>
              <span className={`font-semibold tabular-nums ${Number(p.stock_qty) === 0 ? "text-red-600" : "text-amber-600"}`}>
                {p.stock_qty} од.
              </span>
            </li>
          ))}
          {!data.lowStock.length && <li className="py-4 text-center text-[#9E9E9E]">Критичних залишків немає</li>}
        </ul>
      </div>
    </div>
  );
}

function TurnoverReport({ data }: { data: TurnoverData }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className={card}>
        <p className={cardTitle}>Рухи по типах</p>
        <ul className="divide-y divide-[#F5F5F5] text-[13px]">
          {data.byType.map((t) => (
            <li key={t.type} className="flex items-center justify-between py-2">
              <span className="text-[#212121]">{MOVE_LABEL[t.type] ?? t.type}</span>
              <span className="text-[#9E9E9E]">{Number(t.count).toLocaleString("uk-UA")} записів · {Number(t.total_delta).toLocaleString("uk-UA")} од</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={card}>
        <p className={cardTitle}>Топ продавані товари</p>
        <RankList
          items={data.topMoved.map((p) => ({ label: `${p.brand} ${p.name}`, value: Number(p.units_sold) }))}
          valueFormatter={(n) => n + " од."}
        />
      </div>
    </div>
  );
}
