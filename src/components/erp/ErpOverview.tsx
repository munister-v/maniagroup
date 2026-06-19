"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  inventory: { positions: number; in_stock: number; out_stock: number; units: number; variants: number; unknown_qty: number };
  value: { cost: number; retail: number; margin: number; margin_pct: number };
  coverage: { from_receipt: number; from_manual: number; derived: number; total: number };
  purchases: { receipts_month: number; spent_month: number; units_month: number; spent_total: number };
  reconciliation: { drift: number };
  purchasing: { draft: number; sent: number; open_value: number };
  low_stock: { id: string; name: string; brand: string; size: string; qty: number }[];
  movements: { id: number; type: string; delta: number; qty_after: number | null; size: string; name: string; brand: string; created_at: string }[];
  top_suppliers: { id: number; name: string; total: number; units: number }[];
};

const MOVE_LABEL: Record<string, string> = {
  import: "Імпорт", receipt: "Прихід", sale: "Продаж",
  return: "Повернення", adjust: "Коригування", writeoff: "Списання",
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
function n(v: number) { return v.toLocaleString("uk-UA"); }

export function ErpOverview({ onGoto }: { onGoto?: (s: "products" | "receiving" | "suppliers" | "channels" | "purchasing" | "replenishment") => void }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/erp/overview").then((r) => r.json()).then(setD).finally(() => setLoading(false));
  }, []);

  if (loading && !d) return <div className="p-12 text-center text-[12px] text-[#9E9E9E]">Завантаження…</div>;
  if (!d) return <div className="p-12 text-center text-[12px] text-[#9E9E9E]">Не вдалося завантажити огляд</div>;

  const covPct = d.coverage.total > 0 ? Math.round(((d.coverage.from_receipt + d.coverage.from_manual) / d.coverage.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Огляд складу та фінансів</h1>
        <p className="text-[12px] text-[#9E9E9E]">Звірка й актуалізація обліку: вартість залишку, собівартість, закупівлі, рух товару.</p>
      </div>

      {/* Value cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Вартість залишку (собівартість)" value={uah(d.value.cost)} accent="#212121" hint={`${n(d.inventory.units)} од на складі`} />
        <Stat label="Вартість залишку (роздріб)" value={uah(d.value.retail)} accent="#3f7d52" />
        <Stat label="Потенційний прибуток" value={uah(d.value.margin)} accent="#1f6e43" hint={`маржа ${d.value.margin_pct}%`} />
        <Stat label="Закупівлі за місяць" value={uah(d.purchases.spent_month)} accent="#5b8def" hint={`${d.purchases.receipts_month} приходів · ${n(d.purchases.units_month)} од`} />
      </div>

      {/* Inventory row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { l: "Позицій", v: n(d.inventory.positions) },
          { l: "В наявності", v: n(d.inventory.in_stock), cls: "text-green-700" },
          { l: "Немає", v: n(d.inventory.out_stock), cls: "text-red-600" },
          { l: "Розмірів заведено", v: n(d.inventory.variants) },
          { l: "Без к-сті (потребує обліку)", v: n(d.inventory.unknown_qty), cls: d.inventory.unknown_qty > 0 ? "text-amber-600" : "" },
        ].map((k) => (
          <div key={k.l} className="rounded-[4px] border border-[#E0E0E0] bg-white p-3">
            <p className={`text-[18px] font-light tabular-nums ${k.cls ?? "text-[#212121]"}`}>{k.v}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#9E9E9E]">{k.l}</p>
          </div>
        ))}
      </div>

      {/* Purchasing strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={() => onGoto?.("replenishment")}
          className="flex items-center justify-between rounded-[4px] border border-[#E0E0E0] bg-white p-4 text-left transition-colors hover:border-[#007B6E]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#9E9E9E]">Поповнення</p>
            <p className="mt-0.5 text-[13px] text-[#212121]">Що докупити →</p>
          </div>
          <span className="text-[20px]">📈</span>
        </button>
        <button onClick={() => onGoto?.("purchasing")}
          className="flex items-center justify-between rounded-[4px] border border-[#E0E0E0] bg-white p-4 text-left transition-colors hover:border-[#007B6E]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#9E9E9E]">Відкриті замовлення</p>
            <p className="mt-0.5 text-[18px] font-light tabular-nums text-[#212121]">{n(d.purchasing.draft + d.purchasing.sent)}</p>
            <p className="text-[11px] text-[#9E9E9E]">{d.purchasing.draft} чернеток · {d.purchasing.sent} відправлено</p>
          </div>
          <span className="text-[20px]">🧾</span>
        </button>
        <div className="flex items-center justify-between rounded-[4px] border border-[#E0E0E0] bg-white p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#9E9E9E]">У замовленнях (закупка)</p>
            <p className="mt-0.5 text-[18px] font-light tabular-nums text-[#212121]">{uah(d.purchasing.open_value)}</p>
            <p className="text-[11px] text-[#9E9E9E]">очікує отримання</p>
          </div>
          <span className="text-[20px]">💳</span>
        </div>
      </div>

      {/* Alerts: reconciliation + cost coverage */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Cost coverage */}
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9E9E9E]">Покриття собівартості</h2>
            <span className="text-[12px] tabular-nums text-[#212121]">{covPct}% реальна</span>
          </div>
          <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-[#EEEEEE]">
            <div className="bg-green-600" style={{ width: `${pct(d.coverage.from_receipt, d.coverage.total)}%` }} title="З приходів" />
            <div className="bg-[#5b8def]" style={{ width: `${pct(d.coverage.from_manual, d.coverage.total)}%` }} title="Вручну" />
            <div className="bg-amber-400" style={{ width: `${pct(d.coverage.derived, d.coverage.total)}%` }} title="Розрахункова (формула)" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <Legend color="bg-green-600" label="З приходів" v={n(d.coverage.from_receipt)} />
            <Legend color="bg-[#5b8def]" label="Вручну" v={n(d.coverage.from_manual)} />
            <Legend color="bg-amber-400" label="Формула" v={n(d.coverage.derived)} />
          </div>
          <p className="mt-2 text-[11px] text-[#9E9E9E]">Проводьте приходи із закупкою — собівартість стає реальною, а не розрахунковою.</p>
        </div>

        {/* Reconciliation + suppliers */}
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4">
          <h2 className="mb-3 text-[11px] uppercase tracking-[0.12em] text-[#9E9E9E]">Звірка та постачальники</h2>
          {d.reconciliation.drift > 0 ? (
            <button onClick={() => onGoto?.("products")} className="mb-3 flex w-full items-center gap-2 rounded-[3px] border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[12px] text-amber-800 hover:border-amber-300">
              <span className="text-[14px]">⚠</span>
              <span><b>{n(d.reconciliation.drift)}</b> товарів: залишок-дзеркало не сходиться із сумою розмірів — потребує звірки</span>
            </button>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-[3px] border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-800">
              <span>✓</span> Залишки узгоджені — розбіжностей немає
            </div>
          )}
          {d.top_suppliers.length > 0 ? (
            <ul className="space-y-1.5">
              {d.top_suppliers.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-[12px]">
                  <span className="truncate text-[#212121]">{s.name}</span>
                  <span className="shrink-0 tabular-nums text-[#9E9E9E]">{n(s.units)} од · {uah(s.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-[#9E9E9E]">Закупівель ще не проводилось. Усього за весь час: {uah(d.purchases.spent_total)}.</p>
          )}
        </div>
      </div>

      {/* Low stock + movements */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white">
          <div className="flex items-center justify-between border-b border-[#EEEEEE] px-4 py-2.5">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9E9E9E]">Закінчується</h2>
            <button onClick={() => onGoto?.("replenishment")} className="text-[11px] text-[#5b8def] hover:underline">Поповнити →</button>
          </div>
          {d.low_stock.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[#9E9E9E]">Немає позицій із малим залишком</p>
          ) : (
            <ul className="max-h-72 divide-y divide-[#FAFAFA] overflow-y-auto">
              {d.low_stock.map((r, i) => (
                <li key={i} onClick={() => onGoto?.("products")} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-[12px] hover:bg-[#FAFAFA]">
                  <span className="min-w-0 flex-1 truncate text-[#212121]">{r.name}</span>
                  <span className="shrink-0 text-[#9E9E9E]">{r.brand}</span>
                  <span className="w-10 shrink-0 text-center text-[11px] text-[#9E9E9E]">{r.size}</span>
                  <span className={`w-7 shrink-0 rounded-full text-center text-[11px] tabular-nums ${r.qty <= 1 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{r.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[4px] border border-[#E0E0E0] bg-white">
          <div className="border-b border-[#EEEEEE] px-4 py-2.5">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9E9E9E]">Останній рух товару</h2>
          </div>
          {d.movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-[#9E9E9E]">Рухів ще не було</p>
          ) : (
            <ul className="max-h-72 divide-y divide-[#FAFAFA] overflow-y-auto">
              {d.movements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                  <span className="w-16 shrink-0 text-[#9E9E9E]">{new Date(m.created_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}</span>
                  <span className="w-20 shrink-0 uppercase tracking-wider text-[#212121]">{MOVE_LABEL[m.type] ?? m.type}</span>
                  <span className="min-w-0 flex-1 truncate text-[#9E9E9E]">{m.name}</span>
                  <span className={`w-10 shrink-0 text-right tabular-nums ${m.delta >= 0 ? "text-green-700" : "text-red-600"}`}>{m.delta >= 0 ? "+" : ""}{m.delta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function pct(part: number, total: number) { return total > 0 ? (part / total) * 100 : 0; }

function Stat({ label, value, accent, hint }: { label: string; value: string; accent: string; hint?: string }) {
  return (
    <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4">
      <div className="mb-1 h-1 w-8 rounded-full" style={{ background: accent }} />
      <p className="text-[22px] font-light tabular-nums text-[#212121]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#9E9E9E]">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[#BDBDBD]">{hint}</p>}
    </div>
  );
}

function Legend({ color, label, v }: { color: string; label: string; v: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[#9E9E9E]">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label} <b className="tabular-nums text-[#212121]">{v}</b>
    </span>
  );
}
