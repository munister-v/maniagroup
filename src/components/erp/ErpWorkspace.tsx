"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

const ICONS: Record<ErpSection, string> = {
  overview:  "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
  products:  "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  stocktake: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l1.5 1.5L15 11",
  receiving: "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3l-2 3H9l-2-3H4",
  suppliers: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8z",
  channels:  "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 6l-4-4-4 4M12 2v13",
};

const NAV: { title?: string; items: { id: ErpSection; label: string }[] }[] = [
  { items: [{ id: "overview", label: "Огляд" }] },
  { title: "Каталог",   items: [{ id: "products", label: "Товари" }, { id: "stocktake", label: "Інвентаризація" }] },
  { title: "Закупівлі", items: [{ id: "receiving", label: "Прихід" }, { id: "suppliers", label: "Постачальники" }] },
  { title: "Продажі",   items: [{ id: "channels", label: "Канали / Вигрузки" }] },
];

export function ErpWorkspace() {
  const [section, setSection] = useState<ErpSection>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const go = (s: ErpSection) => { setSection(s); setSelected(null); };

  return (
    <div className="flex h-full">
      {/* ── Sidebar (WooCommerce/WP-style, Mania neutral) ── */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-black/40 bg-[#1b1611] text-white">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-5">
          <span className="text-[13px] font-medium tracking-[0.18em]">MANIA</span>
          <span className="rounded-[3px] bg-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-white/90">ERP</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-1.5">
              {group.title && (
                <p className="px-5 pb-1 pt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-white/35">{group.title}</p>
              )}
              {group.items.map((it) => {
                const active = section === it.id;
                return (
                  <button key={it.id} onClick={() => go(it.id)}
                    className={`flex w-full items-center gap-3 border-l-2 px-5 py-2 text-[13px] transition-colors ${
                      active ? "border-[#c2a878] bg-white/[0.07] text-white" : "border-transparent text-white/60 hover:bg-white/[0.04] hover:text-white"
                    }`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0">
                      <path d={ICONS[it.id]} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {it.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3 text-[11px]">
          <Link href="/admin" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M10 19l-7-7 7-7M3 12h18" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Адмінка
          </Link>
          <Link href="/" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            На сайт
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {section === "overview" && <ErpOverview onGoto={go} />}
        {section === "products" && (selected ? <ProductCard id={selected} onBack={() => setSelected(null)} /> : <ProductList onOpen={setSelected} />)}
        {section === "receiving" && <ErpReceiving />}
        {section === "stocktake" && <ErpStocktake />}
        {section === "suppliers" && <ErpSuppliers />}
        {section === "channels" && <ErpChannels />}
      </main>
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

  const filters: { v: "" | "in" | "out"; l: string; n?: number }[] = [
    { v: "", l: "Всі", n: overview ? Number(overview.skus) : undefined },
    { v: "in", l: "В наявності", n: overview ? Number(overview.in_stock) : undefined },
    { v: "out", l: "Немає", n: overview ? Number(overview.out_stock) : undefined },
  ];

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      {/* Page header — WooCommerce "Add New" pattern */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-[22px] font-light tracking-tight">Товари</h1>
        <Link href="/admin" className="flex h-7 items-center gap-1 rounded-[3px] border border-[#17130f] px-2.5 text-[11px] uppercase tracking-[0.1em] text-[#17130f] transition-colors hover:bg-[#17130f] hover:text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          Додати товар
        </Link>
      </div>

      {/* Status filter links (WC subsubsub) + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-[12px]">
          {filters.map((f, i) => (
            <span key={f.v} className="flex items-center">
              {i > 0 && <span className="mx-1 text-[#d8d2c8]">|</span>}
              <button onClick={() => { setStock(f.v); setPage(1); }}
                className={`transition-colors ${stock === f.v ? "font-medium text-[#17130f]" : "text-[#7c6f5e] hover:text-[#17130f]"}`}>
                {f.l} {f.n != null && <span className="text-[#b9ae9b]">({f.n.toLocaleString("uk-UA")})</span>}
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#b9ae9b]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Пошук товарів…"
            className="h-9 w-64 rounded-[3px] border border-[#e2ddd5] bg-white pl-8 pr-3 text-[13px] focus:border-[#17130f] focus:outline-none" />
        </div>
      </div>

      {/* WooCommerce-style product table */}
      <div className="overflow-x-auto rounded-[4px] border border-[#e2ddd5] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-[#e8e4de] bg-[#f7f5f2] text-[11px] font-medium text-[#5c5347]">
              <th className="w-12 px-3 py-2.5 text-center"><span className="text-[#cbc3b6]">☐</span></th>
              <th className="px-3 py-2.5 text-left">Товар</th>
              <th className="px-3 py-2.5 text-left">Артикул</th>
              <th className="px-3 py-2.5 text-left">Бренд</th>
              <th className="px-3 py-2.5 text-left">Категорія</th>
              <th className="px-3 py-2.5 text-center">Склад</th>
              <th className="px-3 py-2.5 text-right">Ціна</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1ede7]">
            {loading && !rows.length && <tr><td colSpan={7} className="py-14 text-center text-[12px] text-[#9c8f7d]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-14 text-center text-[12px] text-[#9c8f7d]">Нічого не знайдено</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="group cursor-pointer hover:bg-[#faf8f5]">
                <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-[#17130f]" />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.image_src
                      ? <img src={r.image_src} alt="" className="h-10 w-10 shrink-0 rounded-[3px] border border-[#eee7db] object-cover" />
                      : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] border border-[#eee7db] bg-[#f7f5f2] text-[#cbc3b6]">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16v12H4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>}
                    <span className="min-w-0 max-w-[280px] truncate font-medium text-[#1a4d8f] group-hover:underline">{r.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#9c8f7d]">{r.sku}</td>
                <td className="px-3 py-2.5 text-[12px] text-[#5c5347]">{r.brand}</td>
                <td className="px-3 py-2.5 text-[12px] text-[#5c5347]">{r.category}</td>
                <td className="px-3 py-2.5 text-center">
                  {r.is_in_stock
                    ? <span className="inline-flex items-center gap-1.5 text-[12px] text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />В наявності{r.stock_qty > 0 && <span className="text-[#9c8f7d]">({r.stock_qty})</span>}</span>
                    : <span className="inline-flex items-center gap-1.5 text-[12px] text-red-600"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />Немає</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#17130f]">{uah(r.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: count + pagination */}
      <div className="mt-3 flex items-center justify-between text-[12px] text-[#9c8f7d]">
        <span>{total.toLocaleString("uk-UA")} товарів</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span>стор. {page} з {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] bg-white disabled:opacity-30">‹</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] bg-white disabled:opacity-30">›</button>
            </div>
          </div>
        )}
      </div>
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
