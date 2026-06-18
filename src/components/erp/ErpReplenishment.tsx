"use client";

import { useCallback, useEffect, useState } from "react";

type ReplenishRow = {
  variant_id: number; product_id: number; name: string; brand: string; size: string;
  stock_qty: number; sold_30d: number; suggested: number; cost: number; retail: number;
};
type SupplierOpt = { id: number; name: string };

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
const inp = "h-9 rounded-[3px] border border-[#e2ddd5] bg-white px-3 text-[13px] focus:border-[#13a89e] focus:outline-none";

/**
 * Replenishment — variants low/out of stock with 30-day sales velocity and a
 * suggested reorder qty. Tick lines, set quantities, pick a supplier, and spin
 * up a draft purchase order in one click.
 */
export function ErpReplenishment({ onCreated }: { onCreated?: (poId: number) => void }) {
  const [rows, setRows] = useState<ReplenishRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState("");
  const [brand, setBrand] = useState("");
  const [sel, setSel] = useState<Map<number, number>>(new Map()); // variant_id → qty
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (threshold) qs.set("threshold", threshold);
    if (brand.trim()) qs.set("brand", brand.trim());
    fetch(`/api/erp/replenishment?${qs}`).then((r) => r.json()).then((d) => setRows(d.rows ?? [])).finally(() => setLoading(false));
  }, [threshold, brand]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { fetch("/api/erp/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? [])).catch(() => {}); }, []);

  function toggle(r: ReplenishRow) {
    setSel((prev) => {
      const next = new Map(prev);
      if (next.has(r.variant_id)) next.delete(r.variant_id);
      else next.set(r.variant_id, r.suggested);
      return next;
    });
  }
  function setQty(variantId: number, qty: number) {
    setSel((prev) => { const next = new Map(prev); next.set(variantId, Math.max(1, Math.round(qty) || 1)); return next; });
  }
  function selectAll() {
    if (sel.size === rows.length) setSel(new Map());
    else setSel(new Map(rows.map((r) => [r.variant_id, r.suggested])));
  }

  const selectedRows = rows.filter((r) => sel.has(r.variant_id));
  const planUnits = selectedRows.reduce((s, r) => s + (sel.get(r.variant_id) ?? 0), 0);
  const planValue = selectedRows.reduce((s, r) => s + (sel.get(r.variant_id) ?? 0) * r.cost, 0);

  async function createPo() {
    if (!sel.size) return;
    setBusy(true); setMsg("");
    try {
      const lines = [...sel.entries()].map(([variantId, qty]) => ({ variantId, qty }));
      const body: Record<string, unknown> = { lines };
      if (supplierId) body.supplier_id = Number(supplierId);
      const d = await fetch("/api/erp/replenishment", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => r.json());
      if (d.id) {
        setMsg(`Створено замовлення постачальнику #${d.id} (${lines.length} поз.)`);
        setSel(new Map());
        onCreated?.(d.id);
      } else setMsg(d.error ?? "Помилка");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Поповнення складу</h1>
        <p className="text-[12px] text-[#9c8f7d]">Розміри на межі або без залишку + швидкість продажів за 30 днів → рекомендована кількість до закупівлі.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[4px] border border-[#e2ddd5] bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Поріг залишку, ≤</span>
          <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="з налаштувань" className={inp + " w-36"} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Бренд</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="усі бренди" className={inp + " w-48"} />
        </label>
        <span className="self-center text-[12px] text-[#9c8f7d]">Знайдено позицій: <b className="text-[#17130f] tabular-nums">{rows.length}</b></span>
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#e2ddd5] bg-white">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
              <th className="px-3 py-3 text-center w-8">
                <input type="checkbox" checked={rows.length > 0 && sel.size === rows.length} onChange={selectAll} />
              </th>
              <th className="px-4 py-3 text-left">Товар</th>
              <th className="px-4 py-3 text-left">Бренд</th>
              <th className="px-4 py-3 text-center">Розмір</th>
              <th className="px-4 py-3 text-right">Залишок</th>
              <th className="px-4 py-3 text-right">Продано 30д</th>
              <th className="px-4 py-3 text-right">Рекоменд.</th>
              <th className="px-4 py-3 text-right">Закупка/од</th>
              <th className="px-4 py-3 text-right">До замовлення</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f7f4f0]">
            {loading && !rows.length && <tr><td colSpan={9} className="py-12 text-center text-[12px] text-[#9c8f7d]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-[12px] text-[#9c8f7d]">Немає позицій нижче порогу — склад у нормі 👍</td></tr>}
            {rows.map((r) => {
              const checked = sel.has(r.variant_id);
              return (
                <tr key={r.variant_id} className={`hover:bg-[#fafaf8] ${checked ? "bg-[#fbfaf6]" : ""}`}>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={checked} onChange={() => toggle(r)} />
                  </td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5 text-[#9c8f7d]">{r.brand}</td>
                  <td className="px-4 py-2.5 text-center">{r.size}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.stock_qty === 0 ? "font-medium text-red-600" : "text-amber-600"}`}>{r.stock_qty}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#9c8f7d]">{r.sold_30d || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.suggested}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#9c8f7d]">{r.cost ? uah(r.cost) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {checked ? (
                      <input type="number" value={sel.get(r.variant_id) ?? r.suggested}
                        onChange={(e) => setQty(r.variant_id, Number(e.target.value))}
                        className="h-8 w-20 rounded-[3px] border border-[#e2ddd5] bg-white px-2 text-right text-[13px] tabular-nums focus:border-[#13a89e] focus:outline-none" />
                    ) : <span className="text-[#d8d2c8]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* action bar */}
      {sel.size > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#17130f]/15 bg-white p-4 shadow-[0_-2px_12px_rgba(5,5,23,0.06)]">
          <div className="text-[13px]">
            <b className="tabular-nums">{sel.size}</b> поз · <b className="tabular-nums">{planUnits}</b> од
            <span className="ml-2 text-[#9c8f7d]">≈ {uah(planValue)} закупки</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Постачальник</span>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inp + " w-52 pr-7"}>
                <option value="">— оберу пізніше —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button onClick={createPo} disabled={busy}
              className="h-9 rounded-[3px] bg-[#13a89e] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-50">
              {busy ? "Створюємо…" : "Створити замовлення"}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-center text-[12px] text-green-700">{msg}</p>}
    </div>
  );
}
