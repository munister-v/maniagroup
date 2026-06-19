"use client";

import { useCallback, useEffect, useState } from "react";

type Stocktake = { id: number; note: string; scope: string; status: "draft" | "posted"; created_at: string; posted_at: string | null };
type ListRow = Stocktake & { items: number; counted: number; variance: number };
type Item = { id: number; product_id: number; variant_id: number; name: string; brand: string; size: string; expected: number; counted: number | null };
type ProdHit = { id: string; name: string; brand: string; sku: string };

const inp = "h-9 rounded-[3px] border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";

export function ErpStocktake() {
  const [openId, setOpenId] = useState<number | null>(null);
  return openId ? <StocktakeCard id={openId} onBack={() => setOpenId(null)} /> : <StocktakeList onOpen={setOpenId} />;
}

function StocktakeList({ onOpen }: { onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/erp/stocktakes").then((r) => r.json()).then((d) => setRows(d.stocktakes ?? [])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const r = await fetch("/api/erp/stocktakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    const d = await r.json();
    if (d.id) onOpen(d.id);
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Інвентаризація</h1>
        <p className="text-[12px] text-[#9E9E9E]">Фактичний перерахунок: вводиш реальні кількості → система рахує розбіжність і коригує залишки.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">Примітка (необов'язково)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр. Повна інвентаризація склад №1" className={inp + " w-full"} />
        </label>
        <button onClick={create} className="h-9 rounded-[3px] bg-[#007B6E] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85">Нова інвентаризація</button>
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-4 py-3 text-left">№</th>
              <th className="px-4 py-3 text-left">Створено</th>
              <th className="px-4 py-3 text-left">Примітка</th>
              <th className="px-4 py-3 text-right">Позицій</th>
              <th className="px-4 py-3 text-right">Пораховано</th>
              <th className="px-4 py-3 text-right">Розбіжність</th>
              <th className="px-4 py-3 text-center">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAFAFA]">
            {loading && !rows.length && <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[#9E9E9E]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[#9E9E9E]">Інвентаризацій ще немає</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-[#FAFAFA]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#9E9E9E]">#{r.id}</td>
                <td className="px-4 py-2.5">{new Date(r.created_at).toLocaleDateString("uk-UA")}</td>
                <td className="px-4 py-2.5 text-[#9E9E9E]">{r.note || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.items}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.counted}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${r.variance > 0 ? "text-green-700" : r.variance < 0 ? "text-red-600" : "text-[#9E9E9E]"}`}>{r.variance > 0 ? "+" : ""}{r.variance}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${r.status === "posted" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                    {r.status === "posted" ? "Проведено" : "Чернетка"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StocktakeCard({ id, onBack }: { id: number; onBack: () => void }) {
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ProdHit[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/erp/stocktakes/${id}`).then((r) => r.json()).then((d) => { setStocktake(d.stocktake); setItems(d.items ?? []); }).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/erp/products?q=${encodeURIComponent(search)}`).then((r) => r.json()).then((d) => setHits((d.products ?? []).slice(0, 8)));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function act(body: Record<string, unknown>) {
    setErr(""); setBusy(true);
    const r = await fetch(`/api/erp/stocktakes/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Помилка"); return null; }
    if (d.stocktake) { setStocktake(d.stocktake); setItems(d.items ?? []); }
    return d;
  }

  async function addProduct(p: ProdHit) {
    setSearch(""); setHits([]);
    await act({ action: "addItems", productId: Number(p.id) });
  }

  if (loading && !stocktake) return <div className="p-8 text-center text-[12px] text-[#9E9E9E]">Завантаження…</div>;
  if (!stocktake) return <div className="p-8 text-center text-[12px] text-[#9E9E9E]">Не знайдено</div>;

  const posted = stocktake.status === "posted";
  const countedItems = items.filter((i) => i.counted != null);
  const surplus = countedItems.reduce((s, i) => s + Math.max(0, (i.counted ?? 0) - i.expected), 0);
  const shortage = countedItems.reduce((s, i) => s + Math.max(0, i.expected - (i.counted ?? 0)), 0);

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 p-5">
      <button onClick={onBack} className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-[#007B6E]">‹ До списку</button>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <div>
          <h1 className="text-[17px]">Інвентаризація #{stocktake.id}
            <span className={`ml-3 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${posted ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
              {posted ? "Проведено" : "Чернетка"}
            </span>
          </h1>
          <p className="mt-1 text-[12px] text-[#9E9E9E]">{stocktake.note || "Без примітки"} · {new Date(stocktake.created_at).toLocaleDateString("uk-UA")}</p>
        </div>
        <div className="flex gap-4 text-right text-[12px]">
          <div><p className="text-[18px] font-light tabular-nums text-green-700">+{surplus}</p><p className="text-[9px] uppercase tracking-wider text-[#9E9E9E]">надлишок</p></div>
          <div><p className="text-[18px] font-light tabular-nums text-red-600">−{shortage}</p><p className="text-[9px] uppercase tracking-wider text-[#9E9E9E]">нестача</p></div>
          <div><p className="text-[18px] font-light tabular-nums">{countedItems.length}/{items.length}</p><p className="text-[9px] uppercase tracking-wider text-[#9E9E9E]">пораховано</p></div>
        </div>
      </div>

      {err && <div className="rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</div>}

      {/* add items (draft only) */}
      {!posted && (
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4">
          <h3 className="mb-3 text-[10px] uppercase tracking-wider text-[#9E9E9E]">Додати позиції до перерахунку</h3>
          <div className="relative mb-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук товару: назва, бренд, артикул…" className={inp + " w-full max-w-md"} />
            {hits.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full max-w-md overflow-y-auto rounded-[3px] border border-[#E0E0E0] bg-white shadow-lg">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => addProduct(h)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-[#F5F5F5]">
                      <span className="min-w-0 truncate">{h.name}</span>
                      <span className="shrink-0 text-[#9E9E9E]">{h.brand} · {h.sku}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#9E9E9E]">Масово:</span>
            <button onClick={() => act({ action: "addItems", allInStock: true })} disabled={busy}
              className="h-8 rounded-[3px] border border-[#E0E0E0] px-3 text-[11px] text-[#212121] hover:border-[#007B6E] disabled:opacity-40">Усі з залишком &gt; 0</button>
            <input placeholder="бренд…" className={inp + " h-8 w-40"}
              onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { act({ action: "addItems", brand: v }); (e.target as HTMLInputElement).value = ""; } } }} />
            <span className="text-[11px] text-[#BDBDBD]">бренд → Enter</span>
          </div>
        </div>
      )}

      {/* lines */}
      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-4 py-3 text-left">Товар</th>
              <th className="px-4 py-3 text-center">Розмір</th>
              <th className="px-4 py-3 text-right">Очікується</th>
              <th className="px-4 py-3 text-center w-28">Факт</th>
              <th className="px-4 py-3 text-right">Розбіжність</th>
              {!posted && <th className="px-4 py-3 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAFAFA]">
            {items.length === 0 && <tr><td colSpan={posted ? 5 : 6} className="py-8 text-center text-[12px] text-[#9E9E9E]">Додайте позиції для перерахунку</td></tr>}
            {items.map((it) => (
              <StocktakeRow key={it.id} it={it} posted={posted} onBack={load} stId={id} />
            ))}
          </tbody>
        </table>
      </div>

      {/* actions */}
      {!posted && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={async () => { if (confirm("Видалити чернетку інвентаризації?")) { await fetch(`/api/erp/stocktakes/${id}`, { method: "DELETE" }); onBack(); } }}
            className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-red-600">Видалити чернетку</button>
          <button onClick={async () => { if (countedItems.length && confirm("Провести інвентаризацію? Залишки скоригуються за фактом.")) { await act({ action: "post" }); } }}
            disabled={countedItems.length === 0 || busy}
            className="h-10 rounded-[3px] bg-[#007B6E] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
            Провести інвентаризацію
          </button>
        </div>
      )}
      {posted && (
        <p className="text-center text-[12px] text-green-700">
          Проведено {stocktake.posted_at ? new Date(stocktake.posted_at).toLocaleString("uk-UA") : ""} · залишки скориговано
        </p>
      )}
    </div>
  );
}

function StocktakeRow({ it, posted, onBack, stId }: { it: Item; posted: boolean; onBack: () => void; stId: number }) {
  const [val, setVal] = useState(it.counted != null ? String(it.counted) : "");
  useEffect(() => { setVal(it.counted != null ? String(it.counted) : ""); }, [it]);

  const variance = it.counted != null ? it.counted - it.expected : null;

  async function save(v: string) {
    const counted = v === "" ? null : Number(v);
    await fetch(`/api/erp/stocktakes/${stId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setCount", itemId: it.id, counted }) });
  }
  async function del() {
    await fetch(`/api/erp/stocktakes/${stId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteItem", itemId: it.id }) });
    onBack();
  }

  return (
    <tr className="hover:bg-[#FAFAFA]">
      <td className="px-4 py-2">
        <p className="truncate text-[#212121]">{it.name}</p>
        <p className="text-[10px] text-[#9E9E9E]">{it.brand}</p>
      </td>
      <td className="px-4 py-2 text-center">{it.size}</td>
      <td className="px-4 py-2 text-right tabular-nums text-[#9E9E9E]">{it.expected}</td>
      <td className="px-4 py-2 text-center">
        {posted ? (
          <span className="tabular-nums">{it.counted ?? "—"}</span>
        ) : (
          <input value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => save(val)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            inputMode="numeric" placeholder="—"
            className="h-8 w-20 rounded-[3px] border border-[#E0E0E0] px-2 text-center text-[13px] tabular-nums focus:border-[#007B6E] focus:outline-none" />
        )}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums ${variance == null ? "text-[#E0E0E0]" : variance > 0 ? "text-green-700" : variance < 0 ? "text-red-600" : "text-[#9E9E9E]"}`}>
        {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
      </td>
      {!posted && (
        <td className="px-4 py-2 text-right">
          <button onClick={del} className="text-[#BDBDBD] hover:text-red-600">✕</button>
        </td>
      )}
    </tr>
  );
}
