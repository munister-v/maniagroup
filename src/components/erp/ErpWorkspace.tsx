"use client";

import { useCallback, useEffect, useState } from "react";
import { ErpOverview } from "./ErpOverview";
import { ErpReceiving } from "./ErpReceiving";
import { ErpStocktake } from "./ErpStocktake";
import { ErpSuppliers } from "./ErpSuppliers";
import { ErpChannels } from "./ErpChannels";

/* ── types ──────────────────────────────────────────────────────────────── */

type Overview = { skus: string; in_stock: string; out_stock: string; units: string; variants: string };
type ProductRow = {
  id: string; name: string; brand: string; sku: string; category: string;
  price: number; image_src: string; is_in_stock: boolean;
  stock_qty: number; variant_count: number; variant_units: number;
};
type Variant = {
  id: number; size: string; barcode: string; stock_qty: number;
  price: number | null; active: boolean; updated_at: string; updated_by: string;
};
type Movement = {
  id: number; size: string; type: string; delta: number; qty_after: number | null;
  note: string; author: string; created_at: string;
};
type Detail = {
  product: {
    id: string; name: string; brand: string; sku: string; category: string;
    price: string; regular_price: string; image_src: string; is_in_stock: boolean;
    stock_qty: string; color: string; composition: string;
  };
  variants: Variant[];
  movements: Movement[];
};

const MOVE_LABEL: Record<string, string> = {
  import: "Імпорт", receipt: "Прихід", sale: "Продаж",
  return: "Повернення", adjust: "Коригування", writeoff: "Списання",
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
const inp = "h-9 rounded-[3px] border border-[#e2ddd5] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none";

/* ── root ───────────────────────────────────────────────────────────────── */

type ErpSection = "overview" | "products" | "receiving" | "stocktake" | "suppliers" | "channels";

export function ErpWorkspace() {
  const [section, setSection] = useState<ErpSection>("overview");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <div className="border-b border-[#e2ddd5] bg-white px-5">
        <div className="mx-auto flex max-w-[1200px] gap-1">
          {([
            ["overview", "Огляд"],
            ["products", "Товари"],
            ["receiving", "Прихід"],
            ["stocktake", "Інвентаризація"],
            ["suppliers", "Постачальники"],
            ["channels", "Канали / Вигрузки"],
          ] as const).map(([id, label]) => (
            <button key={id}
              onClick={() => { setSection(id); setSelected(null); }}
              className={`-mb-px border-b-2 px-4 py-3 text-[12px] uppercase tracking-[0.12em] transition-colors ${
                section === id ? "border-[#17130f] text-[#17130f]" : "border-transparent text-[#9c8f7d] hover:text-[#17130f]"
              }`}>{label}</button>
          ))}
        </div>
      </div>
      {section === "overview" && <ErpOverview onGoto={setSection} />}
      {section === "products" && (selected ? <ProductCard id={selected} onBack={() => setSelected(null)} /> : <ProductList onOpen={setSelected} />)}
      {section === "receiving" && <ErpReceiving />}
      {section === "stocktake" && <ErpStocktake />}
      {section === "suppliers" && <ErpSuppliers />}
      {section === "channels" && <ErpChannels />}
    </div>
  );
}

/* ── product list ───────────────────────────────────────────────────────── */

function ProductList({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [stock, setStock] = useState<"" | "in" | "out">("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const perPage = 50;

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page) });
    if (q.trim()) sp.set("q", q.trim());
    if (stock) sp.set("stock", stock);
    fetch(`/api/erp/products?${sp}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.products ?? []); setTotal(d.total ?? 0); setOverview(d.overview ?? null); })
      .finally(() => setLoading(false));
  }, [q, stock, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Склад · Товари</h1>
        <p className="text-[12px] text-[#9c8f7d]">Наявність визначається розмірами: є розмір з залишком — товар у продажу.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { l: "Позицій", v: Number(overview.skus).toLocaleString("uk-UA") },
            { l: "В наявності", v: Number(overview.in_stock).toLocaleString("uk-UA"), ok: true },
            { l: "Немає", v: Number(overview.out_stock).toLocaleString("uk-UA"), bad: true },
            { l: "Одиниць на складі", v: Number(overview.units).toLocaleString("uk-UA") },
            { l: "Розмірів заведено", v: Number(overview.variants).toLocaleString("uk-UA") },
          ].map((k) => (
            <div key={k.l} className="rounded-[4px] border border-[#e2ddd5] bg-white p-3">
              <p className={`text-[20px] font-light tabular-nums ${k.ok ? "text-green-700" : k.bad ? "text-red-600" : "text-[#17130f]"}`}>{k.v}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#9c8f7d]">{k.l}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Пошук: назва, бренд, артикул…" className={inp + " w-72"} />
        <div className="flex items-center gap-0.5 rounded-[3px] border border-[#e2ddd5] p-0.5">
          {([["", "Всі"], ["in", "В наявності"], ["out", "Немає"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => { setStock(v); setPage(1); }}
              className={`rounded-[2px] px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] transition-colors ${stock === v ? "bg-[#17130f] text-white" : "text-[#9c8f7d] hover:text-[#17130f]"}`}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-[#9c8f7d]">{total.toLocaleString("uk-UA")} товарів</span>
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#e2ddd5] bg-white">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
              <th className="px-3 py-3 text-left">Товар</th>
              <th className="px-3 py-3 text-left">Бренд</th>
              <th className="px-3 py-3 text-right">Ціна</th>
              <th className="px-3 py-3 text-center">Розміри</th>
              <th className="px-3 py-3 text-right">Залишок</th>
              <th className="px-3 py-3 text-center">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f7f4f0]">
            {loading && !rows.length && <tr><td colSpan={6} className="py-12 text-center text-[12px] text-[#9c8f7d]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-[12px] text-[#9c8f7d]">Нічого не знайдено</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-[#fafaf8]">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.image_src
                      ? <img src={r.image_src} alt="" className="h-9 w-9 shrink-0 rounded-[3px] object-cover" />
                      : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-[#f0ece6] text-[9px] text-[#b9ae9b]">—</span>}
                    <div className="min-w-0">
                      <p className="truncate text-[#17130f]">{r.name}</p>
                      <p className="text-[10px] text-[#9c8f7d]">{r.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-[12px] text-[#9c8f7d]">{r.brand}</td>
                <td className="px-3 py-2 text-right tabular-nums">{uah(r.price)}</td>
                <td className="px-3 py-2 text-center tabular-nums text-[#9c8f7d]">{r.variant_count || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.stock_qty}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${r.is_in_stock ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                    {r.is_in_stock ? "В наявності" : "Немає"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[#9c8f7d]">стор. {page} з {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e2ddd5] disabled:opacity-30">‹</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e2ddd5] disabled:opacity-30">›</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── product card (size matrix + ledger) ────────────────────────────────── */

function ProductCard({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSize, setNewSize] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/erp/product/${id}`).then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function variantPut(body: Record<string, unknown>) {
    setBusy(true);
    await fetch("/api/erp/variants", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    load();
  }
  async function addSize() {
    if (!newSize.trim()) return;
    setBusy(true);
    await fetch("/api/erp/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: Number(id), size: newSize.trim() }) });
    setNewSize(""); setBusy(false); load();
  }
  async function delSize(vid: number) {
    if (!confirm("Видалити розмір?")) return;
    await fetch(`/api/erp/variants?id=${vid}`, { method: "DELETE" });
    load();
  }

  if (loading && !data) return <div className="p-8 text-center text-[12px] text-[#9c8f7d]">Завантаження…</div>;
  if (!data) return <div className="p-8 text-center text-[12px] text-[#9c8f7d]">Товар не знайдено</div>;

  const { product, variants, movements } = data;
  const totalUnits = variants.reduce((s, v) => s + v.stock_qty, 0);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <button onClick={onBack} className="text-[12px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">‹ До списку</button>

      {/* header */}
      <div className="flex items-start gap-4 rounded-[4px] border border-[#e2ddd5] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.image_src
          ? <img src={product.image_src} alt="" className="h-20 w-20 shrink-0 rounded-[3px] object-cover" />
          : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[3px] bg-[#f0ece6] text-[10px] text-[#b9ae9b]">нема фото</span>}
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] text-[#17130f]">{product.name}</h1>
          <p className="text-[12px] text-[#9c8f7d]">{product.brand} · артикул {product.sku} · {product.category}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <span className="text-[#9c8f7d]">Ціна: <b className="text-[#17130f] tabular-nums">{uah(Number(product.price))}</b></span>
            <span className="text-[#9c8f7d]">Залишок (сума розмірів): <b className="text-[#17130f] tabular-nums">{totalUnits}</b></span>
            <span className={`uppercase tracking-wider ${product.is_in_stock ? "text-green-700" : "text-red-600"}`}>{product.is_in_stock ? "В наявності" : "Немає"}</span>
          </div>
        </div>
      </div>

      {/* size matrix */}
      <div className="rounded-[4px] border border-[#e2ddd5] bg-white">
        <div className="flex items-center justify-between border-b border-[#f0ece6] px-4 py-2.5">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Розміри / залишки</h2>
          {busy && <span className="text-[10px] text-[#9c8f7d]">збереження…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                <th className="px-4 py-2 text-left">Розмір</th>
                <th className="px-4 py-2 text-left">Штрихкод</th>
                <th className="px-4 py-2 text-right">Ціна</th>
                <th className="px-4 py-2 text-center">Залишок</th>
                <th className="px-4 py-2 text-center w-32">Швидко</th>
                <th className="px-4 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {variants.map((v) => (
                <VariantRow key={v.id} v={v} onPut={variantPut} onDelete={() => delSize(v.id)} />
              ))}
              {variants.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[12px] text-[#9c8f7d]">Розмірів ще немає</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-[#f0ece6] px-4 py-2.5">
          <input value={newSize} onChange={(e) => setNewSize(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSize()}
            placeholder="Новий розмір (напр. L)" className={inp + " w-44"} />
          <button onClick={addSize} disabled={!newSize.trim()} className="h-9 rounded-[3px] bg-[#17130f] px-4 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">Додати розмір</button>
        </div>
      </div>

      {/* movements ledger */}
      <div className="rounded-[4px] border border-[#e2ddd5] bg-white">
        <div className="border-b border-[#f0ece6] px-4 py-2.5">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Рух залишків</h2>
        </div>
        {movements.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-[#9c8f7d]">Рухів ще не було</p>
        ) : (
          <ul className="max-h-72 divide-y divide-[#f7f4f0] overflow-y-auto">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                <span className="w-24 shrink-0 text-[#9c8f7d]">{new Date(m.created_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                <span className="w-24 shrink-0 uppercase tracking-wider text-[#17130f]">{MOVE_LABEL[m.type] ?? m.type}</span>
                <span className="w-12 shrink-0 text-[#9c8f7d]">{m.size}</span>
                <span className={`w-12 shrink-0 text-right tabular-nums ${m.delta >= 0 ? "text-green-700" : "text-red-600"}`}>{m.delta >= 0 ? "+" : ""}{m.delta}</span>
                <span className="w-16 shrink-0 text-right tabular-nums text-[#9c8f7d]">→ {m.qty_after}</span>
                <span className="min-w-0 flex-1 truncate text-[#9c8f7d]">{m.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VariantRow({ v, onPut, onDelete }: {
  v: Variant; onPut: (b: Record<string, unknown>) => void; onDelete: () => void;
}) {
  const [qty, setQty] = useState(String(v.stock_qty));
  const [barcode, setBarcode] = useState(v.barcode);
  const [price, setPrice] = useState(v.price != null ? String(v.price) : "");
  useEffect(() => { setQty(String(v.stock_qty)); setBarcode(v.barcode); setPrice(v.price != null ? String(v.price) : ""); }, [v]);

  return (
    <tr className={`hover:bg-[#fafaf8] ${!v.active ? "opacity-50" : ""}`}>
      <td className="px-4 py-2 font-medium text-[#17130f]">{v.size}</td>
      <td className="px-4 py-2">
        <input value={barcode} onChange={(e) => setBarcode(e.target.value)}
          onBlur={() => barcode !== v.barcode && onPut({ variantId: v.id, barcode })}
          placeholder="—" className="h-8 w-32 rounded-[3px] border border-[#e2ddd5] px-2 text-[12px] focus:border-[#17130f] focus:outline-none" />
      </td>
      <td className="px-4 py-2 text-right">
        <input value={price} onChange={(e) => setPrice(e.target.value)}
          onBlur={() => { const n = price === "" ? null : Number(price); if (n !== v.price) onPut({ variantId: v.id, price: n }); }}
          placeholder="за товаром" className="h-8 w-24 rounded-[3px] border border-[#e2ddd5] px-2 text-right text-[12px] tabular-nums focus:border-[#17130f] focus:outline-none" />
      </td>
      <td className="px-4 py-2 text-center">
        <input value={qty} onChange={(e) => setQty(e.target.value)}
          onBlur={() => { const n = Number(qty); if (n !== v.stock_qty) onPut({ variantId: v.id, setQty: n, type: "adjust", note: "Ручне коригування" }); }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-8 w-16 rounded-[3px] border border-[#e2ddd5] px-2 text-center text-[13px] tabular-nums focus:border-[#17130f] focus:outline-none" />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => onPut({ variantId: v.id, delta: 1, type: "receipt", note: "Прихід +1" })} title="Прихід +1"
            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] text-green-700 hover:border-green-600">＋</button>
          <button onClick={() => onPut({ variantId: v.id, delta: -1, type: "writeoff", note: "Списання −1" })} title="Списання −1"
            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] text-red-600 hover:border-red-500">－</button>
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <button onClick={onDelete} className="text-[#b9ae9b] hover:text-red-600" title="Видалити розмір">✕</button>
      </td>
    </tr>
  );
}
