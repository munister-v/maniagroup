"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErpOverview } from "./ErpOverview";
import { ErpReceiving } from "./ErpReceiving";
import { ErpStocktake } from "./ErpStocktake";
import { ErpSuppliers } from "./ErpSuppliers";
import { ErpChannels } from "./ErpChannels";
import { ErpPurchasing } from "./ErpPurchasing";
import { ErpReplenishment } from "./ErpReplenishment";
import { ErpProductCreate } from "./ErpProductCreate";
import { ErpImport } from "./ErpImport";
import { ErpGrid } from "./ErpGrid";
import { aiAutofill, aiDescription } from "./aiAssist";

/* ── types ──────────────────────────────────────────────────────────────── */

type Overview = { skus: string; in_stock: string; out_stock: string; units: string; variants: string };
type ProductRow = {
  id: string; name: string; brand: string; sku: string; factory_article: string;
  category: string; color: string; season: string;
  status: string; price: number; image_src: string; is_in_stock: boolean;
  stock_qty: number; variant_count: number; variant_units: number;
  created_at: string; updated_at: string;
};
type Variant = {
  id: number; size: string; barcode: string; offer_code: string; stock_qty: number;
  price: number | null; sale_price: number | null; active: boolean; updated_at: string; updated_by: string;
};
type Movement = {
  id: number; size: string; type: string; delta: number; qty_after: number | null;
  note: string; author: string; created_at: string;
};
type ProductDetail = {
  id: string; name: string; brand: string; sku: string; factory_article: string;
  category: string; gender: string; status: string;
  price: string; regular_price: string; sale_price: string | null; cost_price: string | null;
  image_src: string; images: { src?: string }[] | string; is_in_stock: boolean; stock_qty: string;
  color: string; composition: string; season: string; country: string;
  collection: string; description: string; created_at: string; updated_at: string;
};
type Detail = {
  product: ProductDetail;
  variants: Variant[];
  movements: Movement[];
};
type Facets = { brands: string[]; categories: { name: string }[]; colors: string[]; seasons: string[] };

const MOVE_LABEL: Record<string, string> = {
  import: "Імпорт", receipt: "Прихід", sale: "Продаж",
  return: "Повернення", adjust: "Коригування", writeoff: "Списання",
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
function dmy(s: string) { return s ? new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"; }
const inp = "h-9 rounded-[3px] border border-[#e2ddd5] bg-white px-3 text-[13px] focus:border-[#13a89e] focus:outline-none";

/** Compact numbered pagination: 1 … p-1 p p+1 … N (Intertop footer style). */
function pageList(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, page - 1), hi = Math.min(total - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

/* ── product lifecycle (Intertop-style, Mania terms) ─────────────────────── */
type ErpStatus = "draft" | "moderation" | "publish" | "inactive";
const STATUS_LABEL: Record<ErpStatus, string> = {
  draft: "Чернетка", moderation: "На модерації", publish: "Активний", inactive: "Деактивований",
};
const STATUS_BADGE: Record<ErpStatus, string> = {
  draft:      "bg-[#f0ece6] text-[#7c6f5e]",
  moderation: "bg-amber-100 text-amber-800",
  publish:    "bg-green-100 text-green-800",
  inactive:   "bg-red-100 text-red-700",
};
function StatusBadge({ status }: { status: string }) {
  const s = (status in STATUS_LABEL ? status : "publish") as ErpStatus;
  return <span className={`inline-block rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] ${STATUS_BADGE[s]}`}>{STATUS_LABEL[s]}</span>;
}
// Bulk actions exposed in the list action bar (mirror Intertop's bulk buttons).
const BULK_ACTIONS: { status: ErpStatus; label: string }[] = [
  { status: "publish", label: "Активувати" },
  { status: "moderation", label: "На модерацію" },
  { status: "draft", label: "В чернетку" },
  { status: "inactive", label: "Деактивувати" },
];

/* ── root ───────────────────────────────────────────────────────────────── */

type ErpSection = "overview" | "products" | "grid" | "import" | "receiving" | "stocktake" | "suppliers" | "channels" | "purchasing" | "replenishment";

const ICONS: Record<ErpSection, string> = {
  overview:     "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
  products:     "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  grid:         "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  import:       "M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2",
  stocktake:    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l1.5 1.5L15 11",
  receiving:    "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3l-2 3H9l-2-3H4",
  suppliers:    "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8z",
  channels:     "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 6l-4-4-4 4M12 2v13",
  purchasing:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  replenishment: "M3 3v18h18M7 14l4-4 3 3 5-6",
};

const NAV: { title?: string; items: { id: ErpSection; label: string }[] }[] = [
  { items: [{ id: "overview", label: "Огляд" }] },
  { title: "Каталог",    items: [{ id: "products", label: "Товари" }, { id: "grid", label: "Таблиця" }, { id: "import", label: "Завантажити файл" }, { id: "stocktake", label: "Інвентаризація" }] },
  { title: "Закупівлі", items: [{ id: "replenishment", label: "Поповнення" }, { id: "purchasing", label: "Замовлення" }, { id: "receiving", label: "Прихід" }, { id: "suppliers", label: "Постачальники" }] },
  { title: "Продажі",   items: [{ id: "channels", label: "Канали / Вигрузки" }] },
];

export function ErpWorkspace() {
  const [section, setSection] = useState<ErpSection>(() => {
    if (typeof window !== "undefined") {
      const s = new URLSearchParams(window.location.search).get("section") as ErpSection | null;
      const valid: ErpSection[] = ["overview", "products", "grid", "import", "receiving", "stocktake", "suppliers", "channels", "purchasing", "replenishment"];
      if (s && valid.includes(s)) return s;
    }
    return "overview";
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const go = (s: ErpSection) => { setSection(s); setSelected(null); setCreating(false); setImporting(false); };

  return (
    <div className="flex h-full">
      {/* ── Sidebar (Intertop-style: light, teal accent) ── */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#e2ddd5] bg-white">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#eee9e2] px-5">
          <span className="text-[14px] font-semibold tracking-[0.16em] text-[#17130f]">MANIA</span>
          <span className="rounded-[3px] bg-[#13a89e] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.15em] text-white">ERP</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-1.5">
              {group.title && (
                <p className="px-5 pb-1 pt-3 text-[9px] font-medium uppercase tracking-[0.16em] text-[#b9ae9b]">{group.title}</p>
              )}
              {group.items.map((it) => {
                const active = section === it.id;
                return (
                  <button key={it.id} onClick={() => go(it.id)}
                    className={`flex w-full items-center gap-3 border-l-[3px] px-5 py-2 text-[13px] transition-colors ${
                      active ? "border-[#13a89e] bg-[#13a89e]/[0.08] font-medium text-[#0e7f77]" : "border-transparent text-[#5c5347] hover:bg-[#faf8f5] hover:text-[#13a89e]"
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

        <div className="shrink-0 border-t border-[#eee9e2] p-3 text-[11px]">
          <Link href="/admin" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-[#7c6f5e] transition-colors hover:bg-[#faf8f5] hover:text-[#13a89e]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M10 19l-7-7 7-7M3 12h18" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Адмінка
          </Link>
          <Link href="/" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-[#7c6f5e] transition-colors hover:bg-[#faf8f5] hover:text-[#13a89e]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            На сайт
          </Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={`min-w-0 flex-1 ${section === "grid" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
        {section === "overview" && <ErpOverview onGoto={go} />}
        {section === "grid" && <ErpGrid />}
        {section === "import" && <ErpImport onBack={() => go("products")} />}
        {section === "products" && (
          creating
            ? <ErpProductCreate onDone={(id) => { setCreating(false); if (id) setSelected(id); }} onCancel={() => setCreating(false)} />
            : importing
              ? <ErpImport onBack={() => setImporting(false)} />
              : selected
                ? <ProductCard id={selected} onBack={() => setSelected(null)} />
                : <ProductList onOpen={setSelected} onAddNew={() => setCreating(true)} onUpload={() => go("import")} />
        )}
        {section === "replenishment" && <ErpReplenishment onCreated={() => go("purchasing")} />}
        {section === "purchasing" && <ErpPurchasing />}
        {section === "receiving" && <ErpReceiving />}
        {section === "stocktake" && <ErpStocktake />}
        {section === "suppliers" && <ErpSuppliers />}
        {section === "channels" && <ErpChannels />}
      </main>
    </div>
  );
}

/* ── product list ───────────────────────────────────────────────────────── */

function ProductList({ onOpen, onAddNew, onUpload }: { onOpen: (id: string) => void; onAddNew: () => void; onUpload: () => void }) {
  const [q, setQ] = useState("");
  const [stock, setStock] = useState<"" | "in" | "out">("");
  const [status, setStatus] = useState<"" | ErpStatus>("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [perPage, setPerPage] = useState(100);
  const [showFilters, setShowFilters] = useState(false); // ▼ filter toggle (Intertop)
  const [showExtra, setShowExtra] = useState(false);      // ⚙ extra columns (Склад/Ціна)

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (q.trim()) sp.set("q", q.trim());
    if (stock) sp.set("stock", stock);
    if (status) sp.set("status", status);
    fetch(`/api/erp/products?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.products ?? []); setTotal(d.total ?? 0);
        setOverview(d.overview ?? null); setStatusCounts(d.statusCounts ?? {});
      })
      .finally(() => setLoading(false));
  }, [q, stock, status, page, perPage]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  // Clear selection whenever the visible set changes.
  useEffect(() => { setSel(new Set()); }, [rows]);

  const totalPages = Math.ceil(total / perPage);

  const filters: { v: "" | "in" | "out"; l: string; n?: number }[] = [
    { v: "", l: "Всі", n: overview ? Number(overview.skus) : undefined },
    { v: "in", l: "В наявності", n: overview ? Number(overview.in_stock) : undefined },
    { v: "out", l: "Немає", n: overview ? Number(overview.out_stock) : undefined },
  ];
  const statusTabs: { v: "" | ErpStatus; l: string }[] = [
    { v: "", l: "Усі статуси" },
    ...(["publish", "moderation", "draft", "inactive"] as ErpStatus[]).map((s) => ({ v: s, l: STATUS_LABEL[s] })),
  ];

  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  function toggleAll() { setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id))); }
  function toggleOne(id: string) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function bulk(target: ErpStatus) {
    if (!sel.size || bulkBusy) return;
    setBulkBusy(true);
    await fetch("/api/erp/products", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...sel], status: target }),
    });
    setBulkBusy(false); setSel(new Set()); load();
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      {/* Page header — Intertop "Список товарів" pattern */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-light tracking-tight">Список товарів</h1>
          <p className="mt-0.5 text-[12px] text-[#9c8f7d]">Вибрано продуктів {total.toLocaleString("uk-UA")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={onAddNew} className="flex h-8 items-center gap-1.5 rounded-[3px] bg-[#13a89e] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            Створити товар
          </button>
          <button onClick={onUpload} className="flex h-8 items-center gap-1.5 rounded-[3px] bg-[#13a89e] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Завантажити товари
          </button>
          {/* Bulk status actions (act on selected rows) — Intertop toolbar */}
          {([
            { label: "Деактивувати", status: "inactive" as ErpStatus, icon: "M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10" },
            { label: "На модерацію", status: "moderation" as ErpStatus, icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zM16 11V7a4 4 0 00-8 0v4" },
            { label: "В чернетку", status: "draft" as ErpStatus, icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.83 14.83l-4 1 1-4 8.756-8.244z" },
          ]).map((b) => (
            <button key={b.status} disabled={!sel.size || bulkBusy} onClick={() => bulk(b.status)}
              className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#d8d2c8] bg-white px-3 text-[11px] uppercase tracking-[0.06em] text-[#5c5347] transition-colors hover:border-[#13a89e] hover:text-[#13a89e] disabled:opacity-35 disabled:hover:border-[#d8d2c8] disabled:hover:text-[#5c5347]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d={b.icon} strokeLinecap="round" strokeLinejoin="round" /></svg>
              {b.label}
            </button>
          ))}
          {/* Icon buttons */}
          <span className="mx-0.5 h-5 w-px bg-[#e2ddd5]" />
          <button onClick={() => setShowExtra((v) => !v)} title="Колонки: склад і ціна"
            className={`flex h-8 w-8 items-center justify-center rounded-[3px] border transition-colors ${showExtra ? "border-[#13a89e] text-[#13a89e]" : "border-[#d8d2c8] text-[#9c8f7d] hover:border-[#13a89e] hover:text-[#13a89e]"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button onClick={() => setShowFilters((v) => !v)} title="Фільтри"
            className={`flex h-8 w-8 items-center justify-center rounded-[3px] border transition-colors ${showFilters ? "border-[#13a89e] text-[#13a89e]" : "border-[#d8d2c8] text-[#9c8f7d] hover:border-[#13a89e] hover:text-[#13a89e]"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M3 4h18M6 8h12M10 12h4M11 16h2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {/* Status lifecycle tabs (Intertop workflow) */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {statusTabs.map((t) => {
          const active = status === t.v;
          const n = t.v === "" ? undefined : statusCounts[t.v];
          return (
            <button key={t.v || "all"} onClick={() => { setStatus(t.v); setPage(1); }}
              className={`rounded-[3px] border px-2.5 py-1 text-[11px] uppercase tracking-[0.06em] transition-colors ${
                active ? "border-[#13a89e] bg-[#13a89e] text-white" : "border-[#e2ddd5] bg-white text-[#7c6f5e] hover:border-[#13a89e] hover:text-[#13a89e]"
              }`}>
              {t.l}{n != null && <span className={active ? "ml-1 text-white/70" : "ml-1 text-[#b9ae9b]"}>({n.toLocaleString("uk-UA")})</span>}
            </button>
          );
        })}
      </div>

      {/* Search (always) + stock filter links (toggled by the ▼ button) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-[12px]">
          {showFilters && filters.map((f, i) => (
            <span key={f.v} className="flex items-center">
              {i > 0 && <span className="mx-1 text-[#d8d2c8]">|</span>}
              <button onClick={() => { setStock(f.v); setPage(1); }}
                className={`transition-colors ${stock === f.v ? "font-medium text-[#13a89e]" : "text-[#7c6f5e] hover:text-[#13a89e]"}`}>
                {f.l} {f.n != null && <span className="text-[#b9ae9b]">({f.n.toLocaleString("uk-UA")})</span>}
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#b9ae9b]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Пошук товарів…"
            className="h-9 w-64 rounded-[3px] border border-[#e2ddd5] bg-white pl-8 pr-3 text-[13px] focus:border-[#13a89e] focus:outline-none" />
        </div>
      </div>

      {/* Selection indicator (bulk actions live in the toolbar) */}
      {sel.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-[4px] border border-[#13a89e]/25 bg-[#13a89e]/[0.06] px-3 py-1.5 text-[12px]">
          <span className="font-medium text-[#0e7f77]">Вибрано: {sel.size}</span>
          <span className="text-[#7c6f5e]">— застосуйте дію з панелі вгорі</span>
          <button onClick={() => setSel(new Set())} className="ml-auto text-[11px] uppercase tracking-[0.06em] text-[#9c8f7d] hover:text-[#13a89e]">Зняти виділення</button>
        </div>
      )}

      {/* Intertop-style dense product table */}
      <div className="overflow-x-auto rounded-[4px] border border-[#e2ddd5] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[1500px] text-[13px]">
          <thead>
            <tr className="border-b border-[#e8e4de] bg-[#f7f5f2] text-[10px] font-medium uppercase tracking-[0.04em] text-[#5c5347]">
              <th className="w-10 px-3 py-2.5 text-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#13a89e]" />
              </th>
              <th className="px-3 py-2.5 text-left">ID товару</th>
              <th className="px-3 py-2.5 text-left">Назва (рос.)</th>
              <th className="px-3 py-2.5 text-left">Зображення</th>
              <th className="px-3 py-2.5 text-left">Категорія</th>
              <th className="px-3 py-2.5 text-left">Код товару</th>
              <th className="px-3 py-2.5 text-left">Заводський артикул</th>
              <th className="px-3 py-2.5 text-left">Артикул</th>
              <th className="px-3 py-2.5 text-left">Статус</th>
              <th className="px-3 py-2.5 text-center">Публікувався</th>
              <th className="px-3 py-2.5 text-left">Востаннє змінений</th>
              <th className="px-3 py-2.5 text-left">Створений</th>
              <th className="px-3 py-2.5 text-left">Колір</th>
              <th className="px-3 py-2.5 text-left">Бренд</th>
              <th className="px-3 py-2.5 text-left">Сезон</th>
              {showExtra && <th className="px-3 py-2.5 text-center">Склад</th>}
              {showExtra && <th className="px-3 py-2.5 text-right">Ціна</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1ede7]">
            {loading && !rows.length && <tr><td colSpan={showExtra ? 17 : 15} className="py-14 text-center text-[12px] text-[#9c8f7d]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={showExtra ? 17 : 15} className="py-14 text-center text-[12px] text-[#9c8f7d]">Нічого не знайдено</td></tr>}
            {rows.map((r) => {
              const checked = sel.has(r.id);
              const published = r.status === "publish";
              return (
              <tr key={r.id} onClick={() => onOpen(r.id)} className={`group cursor-pointer hover:bg-[#faf8f5] ${checked ? "bg-[#eafaf8]" : ""}`}>
                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => toggleOne(r.id)} className="h-3.5 w-3.5 accent-[#13a89e]" />
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-[#9c8f7d]">{r.id}</td>
                <td className="px-3 py-2"><span className="block max-w-[260px] truncate font-medium text-[#13a89e] group-hover:underline">{r.name}</span></td>
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.image_src
                    ? <img src={r.image_src} alt="" className="h-9 w-9 shrink-0 rounded-[3px] border border-[#eee7db] object-cover" />
                    : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-[#eee7db] bg-[#f7f5f2] text-[#cbc3b6]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16v12H4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>}
                </td>
                <td className="px-3 py-2 text-[12px] text-[#5c5347]">{r.category || "—"}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-[#9c8f7d]">mp{r.id}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-[#9c8f7d]">{r.factory_article || "—"}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-[#9c8f7d]">{r.sku || "—"}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-center">
                  {published
                    ? <span className="text-[12px] font-medium text-green-700">Так</span>
                    : <span className="text-[12px] text-[#b9ae9b]">Ні</span>}
                </td>
                <td className="px-3 py-2 text-[12px] text-[#9c8f7d] tabular-nums">{dmy(r.updated_at)}</td>
                <td className="px-3 py-2 text-[12px] text-[#9c8f7d] tabular-nums">{dmy(r.created_at)}</td>
                <td className="px-3 py-2 text-[12px] text-[#5c5347]">{r.color || "—"}</td>
                <td className="px-3 py-2 text-[12px] text-[#5c5347]">{r.brand}</td>
                <td className="px-3 py-2 text-[12px] text-[#5c5347]">{r.season || "—"}</td>
                {showExtra && (
                  <td className="px-3 py-2 text-center">
                    {r.is_in_stock
                      ? <span className="inline-flex items-center gap-1.5 text-[12px] text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />{r.stock_qty > 0 ? r.stock_qty : "є"}</span>
                      : <span className="inline-flex items-center gap-1.5 text-[12px] text-red-600"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />0</span>}
                  </td>
                )}
                {showExtra && <td className="px-3 py-2 text-right tabular-nums text-[#17130f]">{uah(r.price)}</td>}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: per-page + range + numbered pagination (Intertop style) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#9c8f7d]">
        <div className="flex items-center gap-2">
          <span>Показувати на сторінці</span>
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-7 rounded-[3px] border border-[#e2ddd5] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#13a89e] focus:outline-none">
            {[50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="ml-1">
            {total === 0 ? "0" : `${((page - 1) * perPage + 1).toLocaleString("uk-UA")}–${Math.min(page * perPage, total).toLocaleString("uk-UA")}`} / {total.toLocaleString("uk-UA")}
          </span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] bg-white disabled:opacity-30">‹</button>
            {pageList(page, totalPages).map((p, i) =>
              p === "…"
                ? <span key={`e${i}`} className="px-1 text-[#b9ae9b]">…</span>
                : <button key={p} onClick={() => setPage(p)}
                    className={`flex h-7 min-w-7 items-center justify-center rounded-[3px] border px-1.5 tabular-nums ${
                      p === page ? "border-[#13a89e] bg-[#13a89e] text-white" : "border-[#e2ddd5] bg-white text-[#5c5347] hover:border-[#13a89e]"
                    }`}>{p}</button>
            )}
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] bg-white disabled:opacity-30">›</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── product card — tabbed editor (Товар / Торгові пропозиції) ───────────── */

const fieldLbl = "mb-1 block text-[10px] uppercase tracking-wider text-[#9c8f7d]";
const fieldInp = "h-9 w-full rounded-[3px] border border-[#e2ddd5] bg-white px-3 text-[13px] focus:border-[#13a89e] focus:outline-none";
const cardCls = "rounded-[4px] border border-[#e2ddd5] bg-white p-4";
const cardTitleCls = "mb-3 text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]";

// Editable string/number fields of the Товар tab (key → label).
const TEXT_FIELDS: { k: keyof ProductForm; label: string; list?: string; placeholder?: string }[] = [
  { k: "brand", label: "Бренд", list: "erp-brands" },
  { k: "category", label: "Категорія", list: "erp-cats" },
  { k: "color", label: "Колір", list: "erp-colors" },
  { k: "season", label: "Сезон", list: "erp-seasons" },
  { k: "country", label: "Країна" },
  { k: "collection", label: "Колекція" },
  { k: "composition", label: "Склад тканини", placeholder: "напр. Бавовна 95%, Еластан 5%" },
  { k: "sku", label: "Код товару (SKU)" },
  { k: "factory_article", label: "Заводський артикул" },
];

type ProductForm = {
  name: string; description: string; brand: string; category: string; gender: string;
  color: string; composition: string; season: string; country: string; collection: string;
  sku: string; factory_article: string;
  regular_price: string; sale_price: string; cost_price: string;
};

function formFromProduct(p: ProductDetail): ProductForm {
  return {
    name: p.name ?? "", description: p.description ?? "", brand: p.brand ?? "",
    category: p.category ?? "", gender: p.gender ?? "", color: p.color ?? "",
    composition: p.composition ?? "", season: p.season ?? "", country: p.country ?? "",
    collection: p.collection ?? "", sku: p.sku ?? "", factory_article: p.factory_article ?? "",
    regular_price: p.regular_price ?? "", sale_price: p.sale_price ?? "", cost_price: p.cost_price ?? "",
  };
}

function ProductCard({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"product" | "offers">("product");
  const [newSize, setNewSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [facets, setFacets] = useState<Facets>({ brands: [], categories: [], colors: [], seasons: [] });

  // Editable copy of the product fields + dirty tracking.
  const [form, setForm] = useState<ProductForm | null>(null);
  const [orig, setOrig] = useState<ProductForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [ai, setAi] = useState<"" | "fill" | "desc">("");
  const [aiErr, setAiErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/erp/product/${id}`).then((r) => r.json()).then((d: Detail) => {
      setData(d);
      if (d.product) { const f = formFromProduct(d.product); setForm(f); setOrig(f); }
    }).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/products/facets").then((r) => r.json())
      .then((d) => setFacets({ brands: d.brands ?? [], categories: d.categories ?? [], colors: d.colors ?? [], seasons: d.seasons ?? [] }))
      .catch(() => {});
  }, []);

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

  // Patch the product status immediately (header control).
  async function setStatus(status: ErpStatus) {
    if (!data) return;
    setData({ ...data, product: { ...data.product, status } });
    await fetch(`/api/erp/product/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }

  // Diff the form against the loaded original → PATCH only changed fields.
  function buildPatch(): Record<string, unknown> | null {
    if (!form || !orig) return null;
    const patch: Record<string, unknown> = {};
    (["name", "description", "brand", "category", "gender", "color", "composition", "season", "country", "collection", "sku", "factory_article"] as (keyof ProductForm)[])
      .forEach((k) => { if (form[k].trim() !== orig[k].trim()) patch[k] = form[k].trim(); });
    const numChanged = (k: keyof ProductForm) => Number(form[k] || 0) !== Number(orig[k] || 0);
    if (numChanged("regular_price")) patch.regular_price = Number(form.regular_price) || 0;
    if (numChanged("sale_price")) patch.sale_price = Number(form.sale_price) > 0 ? Number(form.sale_price) : null;
    if (numChanged("cost_price")) patch.cost_price = Number(form.cost_price) > 0 ? Number(form.cost_price) : null;
    return Object.keys(patch).length ? patch : null;
  }
  const dirty = !!buildPatch();
  async function saveProduct() {
    const patch = buildPatch();
    if (!patch || !form) return;
    if (!form.name.trim()) { setErr("Вкажіть назву"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch(`/api/erp/product/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await r.json();
      if (r.ok) { setOrig(form); setSaved(true); setTimeout(() => setSaved(false), 1800); load(); }
      else setErr(d.error ?? "Помилка збереження");
    } catch { setErr("Помилка мережі"); }
    setSaving(false);
  }

  // ── AI assist (fills only empty fields; user reviews then saves) ──
  async function magicFill() {
    if (!form?.name.trim()) { setAiErr("Назва порожня"); return; }
    setAi("fill"); setAiErr("");
    try {
      const f = await aiAutofill({ name: form.name, brand: form.brand, category: form.category, color: form.color, season: form.season, composition: form.composition, gender: form.gender });
      setForm((cur) => {
        if (!cur) return cur;
        const next = { ...cur };
        (["category", "gender", "color", "season", "composition", "brand"] as (keyof ProductForm)[])
          .forEach((k) => { if (f[k] && !cur[k].trim()) next[k] = f[k]; });
        if (f.description && !cur.description.trim()) next.description = f.description;
        return next;
      });
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Помилка ШІ"); }
    setAi("");
  }
  async function genDesc() {
    if (!form?.name.trim()) { setAiErr("Назва порожня"); return; }
    setAi("desc"); setAiErr("");
    try {
      const t = await aiDescription({ name: form.name, brand: form.brand, category: form.category, color: form.color, season: form.season, composition: form.composition });
      if (t) setForm((cur) => (cur ? { ...cur, description: t } : cur));
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Помилка ШІ"); }
    setAi("");
  }

  if (loading && !data) return <div className="p-8 text-center text-[12px] text-[#9c8f7d]">Завантаження…</div>;
  if (!data || !form) return <div className="p-8 text-center text-[12px] text-[#9c8f7d]">Товар не знайдено</div>;

  const { product, variants, movements } = data;
  const totalUnits = variants.reduce((s, v) => s + v.stock_qty, 0);
  const activeOffers = variants.filter((v) => v.active).length;
  const status = (product.status in STATUS_LABEL ? product.status : "publish") as ErpStatus;
  const published = status === "publish";
  const images: string[] = Array.isArray(product.images)
    ? product.images.map((x) => (typeof x === "string" ? x : x?.src ?? "")).filter(Boolean)
    : [];
  const effPrice = Number(form.sale_price) > 0 ? Number(form.sale_price) : Number(form.regular_price);
  const margin = effPrice > 0 && Number(form.cost_price) > 0 ? Math.round(((effPrice - Number(form.cost_price)) / effPrice) * 100) : null;
  const set = (k: keyof ProductForm, v: string) => setForm((f) => f ? { ...f, [k]: v } : f);

  return (
    <div className="mx-auto max-w-[1200px] p-5">
      <button onClick={onBack} className="mb-3 text-[12px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#13a89e]">‹ До списку</button>

      {/* header */}
      <div className="flex flex-wrap items-start gap-4 rounded-[4px] border border-[#e2ddd5] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.image_src
          ? <img src={product.image_src} alt="" className="h-16 w-16 shrink-0 rounded-[3px] border border-[#eee7db] object-cover" />
          : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[3px] bg-[#f0ece6] text-[10px] text-[#b9ae9b]">нема фото</span>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] text-[#17130f]">{product.name}</h1>
          <p className="text-[12px] text-[#9c8f7d]">ID {product.id} · {product.brand || "—"} · {product.category || "—"}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <span className="text-[#9c8f7d]">Ціна <b className="text-[#17130f] tabular-nums">{uah(Number(product.price))}</b></span>
            <span className="text-[#9c8f7d]">Залишок <b className="text-[#17130f] tabular-nums">{totalUnits}</b></span>
            <span className="text-[#9c8f7d]">Розмірів <b className="text-[#17130f] tabular-nums">{variants.length}</b></span>
          </div>
        </div>
        {/* status control */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#9c8f7d]">Публікувався: {published ? <b className="text-green-700">Так</b> : <span className="text-[#b9ae9b]">Ні</span>}</span>
            <StatusBadge status={status} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as ErpStatus)}
            className="h-8 rounded-[3px] border border-[#e2ddd5] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#13a89e] focus:outline-none">
            {(["publish", "moderation", "draft", "inactive"] as ErpStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {/* tabs */}
      <div className="mt-4 flex items-center gap-1 border-b border-[#e2ddd5]">
        {([["product", "Товар"], ["offers", `Торгові пропозиції (${variants.length})`]] as const).map(([t, lab]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] transition-colors ${
              tab === t ? "border-[#13a89e] font-medium text-[#17130f]" : "border-transparent text-[#9c8f7d] hover:text-[#13a89e]"
            }`}>{lab}</button>
        ))}
      </div>

      {/* ── TAB: Товар ── */}
      {tab === "product" && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className={cardCls}>
                <label className="block">
                  <span className={fieldLbl}>Назва товару *</span>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldInp + " h-10 text-[15px]"} />
                </label>
                <label className="mt-3 block">
                  <span className={fieldLbl}>Опис</span>
                  <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4}
                    className="w-full resize-none rounded-[3px] border border-[#e2ddd5] bg-white px-3 py-2 text-[13px] focus:border-[#13a89e] focus:outline-none" />
                </label>
              </div>

              {images.length > 0 && (
                <div className={cardCls}>
                  <p className={cardTitleCls}>Фото товару</p>
                  <div className="flex flex-wrap gap-2">
                    {images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" className="h-16 w-16 rounded-[3px] border border-[#e2ddd5] object-cover" />
                    ))}
                  </div>
                </div>
              )}

              <div className={cardCls}>
                <p className={cardTitleCls}>Організація</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TEXT_FIELDS.map((f) => (
                    <label key={f.k} className="block">
                      <span className={fieldLbl}>{f.label}</span>
                      <input value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} list={f.list} placeholder={f.placeholder} className={fieldInp} />
                    </label>
                  ))}
                  <label className="block">
                    <span className={fieldLbl}>Стать</span>
                    <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={fieldInp + " pr-7"}>
                      <option value="">—</option><option value="women">Жіноче</option><option value="men">Чоловіче</option>
                    </select>
                  </label>
                </div>
                <datalist id="erp-brands">{facets.brands.map((b) => <option key={b} value={b} />)}</datalist>
                <datalist id="erp-cats">{facets.categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                <datalist id="erp-colors">{facets.colors.map((c) => <option key={c} value={c} />)}</datalist>
                <datalist id="erp-seasons">{facets.seasons.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            {/* pricing column */}
            <div className="space-y-4">
              <div className={cardCls}>
                <p className={cardTitleCls}>Ціни</p>
                <label className="block"><span className={fieldLbl}>Базова ціна, ₴ *</span>
                  <input value={form.regular_price} onChange={(e) => set("regular_price", e.target.value)} inputMode="numeric" className={fieldInp} /></label>
                <label className="mt-3 block"><span className={fieldLbl}>Акційна ціна, ₴</span>
                  <input value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} inputMode="numeric" className={fieldInp} /></label>
                <label className="mt-3 block"><span className={fieldLbl}>Закупка (собівартість), ₴</span>
                  <input value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} inputMode="numeric" className={fieldInp} /></label>
                {margin != null && (
                  <p className={`mt-2 text-[12px] ${margin < 0 ? "text-red-600" : "text-green-700"}`}>Маржа: <b>{margin}%</b></p>
                )}
                <p className="mt-2 text-[11px] text-[#9c8f7d]">Створено {dmy(product.created_at)} · змінено {dmy(product.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* save bar */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-[#e2ddd5] bg-[#faf8f5] px-4 py-3">
            {err && <span className="text-[12px] text-red-600">{err}</span>}
            {saved && <span className="text-[12px] text-green-700">✓ Збережено</span>}
            {dirty && !saved && <span className="text-[11px] text-[#9c8f7d]">Є незбережені зміни</span>}
            <button onClick={saveProduct} disabled={!dirty || saving}
              className="h-9 rounded-[3px] bg-[#13a89e] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
              {saving ? "Збереження…" : "Зберегти зміни"}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: Торгові пропозиції ── */}
      {tab === "offers" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-[4px] border border-[#e2ddd5] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0ece6] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Торгові пропозиції · активних {activeOffers}/{variants.length} · {totalUnits} од</h2>
              {busy && <span className="text-[10px] text-[#9c8f7d]">збереження…</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                    <th className="px-3 py-2 text-center">Активн.</th>
                    <th className="px-3 py-2 text-left">Розмір</th>
                    <th className="px-3 py-2 text-left">Штрихкод</th>
                    <th className="px-3 py-2 text-left">Код оффера (mp)</th>
                    <th className="px-3 py-2 text-right">Базова ціна</th>
                    <th className="px-3 py-2 text-right">Акційна ціна</th>
                    <th className="px-3 py-2 text-center">Наявність</th>
                    <th className="px-3 py-2 text-left hidden xl:table-cell">Оновлено</th>
                    <th className="px-3 py-2 text-center w-24">Швидко</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f7f4f0]">
                  {variants.map((v) => (
                    <VariantRow key={v.id} v={v} onPut={variantPut} onDelete={() => delSize(v.id)} />
                  ))}
                  {variants.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-[12px] text-[#9c8f7d]">Пропозицій ще немає</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 border-t border-[#f0ece6] px-4 py-2.5">
              <input value={newSize} onChange={(e) => setNewSize(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSize()}
                placeholder="Новий розмір (напр. L)" className={inp + " w-44"} />
              <button onClick={addSize} disabled={!newSize.trim()} className="h-9 rounded-[3px] bg-[#13a89e] px-4 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">Додати пропозицію</button>
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
                    <span className="w-24 shrink-0 text-[#9c8f7d]">{dmy(m.created_at)}</span>
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
      )}
    </div>
  );
}

function VariantRow({ v, onPut, onDelete }: {
  v: Variant; onPut: (b: Record<string, unknown>) => void; onDelete: () => void;
}) {
  const [qty, setQty] = useState(String(v.stock_qty));
  const [barcode, setBarcode] = useState(v.barcode);
  const [offer, setOffer] = useState(v.offer_code);
  const [price, setPrice] = useState(v.price != null ? String(v.price) : "");
  const [sale, setSale] = useState(v.sale_price != null ? String(v.sale_price) : "");
  useEffect(() => {
    setQty(String(v.stock_qty)); setBarcode(v.barcode); setOffer(v.offer_code);
    setPrice(v.price != null ? String(v.price) : ""); setSale(v.sale_price != null ? String(v.sale_price) : "");
  }, [v]);
  const cell = "h-8 rounded-[3px] border border-[#e2ddd5] px-2 text-[12px] focus:border-[#13a89e] focus:outline-none";

  return (
    <tr className={`hover:bg-[#fafaf8] ${!v.active ? "opacity-50" : ""}`}>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={v.active} onChange={() => onPut({ variantId: v.id, active: !v.active })}
          className="h-3.5 w-3.5 accent-[#13a89e]" title={v.active ? "Активна" : "Вимкнена"} />
      </td>
      <td className="px-3 py-2 font-medium text-[#17130f]">{v.size}</td>
      <td className="px-3 py-2">
        <input value={barcode} onChange={(e) => setBarcode(e.target.value)}
          onBlur={() => barcode !== v.barcode && onPut({ variantId: v.id, barcode })}
          placeholder="—" className={cell + " w-32"} />
      </td>
      <td className="px-3 py-2">
        <input value={offer} onChange={(e) => setOffer(e.target.value)}
          onBlur={() => offer !== v.offer_code && onPut({ variantId: v.id, offer_code: offer })}
          placeholder="mp…" className={cell + " w-28 font-mono"} />
      </td>
      <td className="px-3 py-2 text-right">
        <input value={price} onChange={(e) => setPrice(e.target.value)}
          onBlur={() => { const n = price === "" ? null : Number(price); if (n !== v.price) onPut({ variantId: v.id, price: n }); }}
          placeholder="за товаром" className={cell + " w-24 text-right tabular-nums"} />
      </td>
      <td className="px-3 py-2 text-right">
        <input value={sale} onChange={(e) => setSale(e.target.value)}
          onBlur={() => { const n = sale === "" ? null : Number(sale); if (n !== v.sale_price) onPut({ variantId: v.id, sale_price: n }); }}
          placeholder="—" className={cell + " w-24 text-right tabular-nums"} />
      </td>
      <td className="px-3 py-2 text-center">
        <input value={qty} onChange={(e) => setQty(e.target.value)}
          onBlur={() => { const n = Number(qty); if (n !== v.stock_qty) onPut({ variantId: v.id, setQty: n, type: "adjust", note: "Ручне коригування" }); }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cell + " w-16 text-center text-[13px] tabular-nums"} />
      </td>
      <td className="px-3 py-2 hidden xl:table-cell">
        <span className="text-[11px] text-[#9c8f7d]" title={v.updated_by || ""}>
          {v.updated_at ? new Date(v.updated_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }) : "—"}
          {v.updated_by && v.updated_by !== "import" ? <span className="ml-1 text-[#c8c0b4]">· {v.updated_by}</span> : null}
          {v.updated_by === "import" ? <span className="ml-1 text-[#c2a878]">· імпорт</span> : null}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => onPut({ variantId: v.id, delta: 1, type: "receipt", note: "Прихід +1" })} title="Прихід +1"
            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] text-green-700 hover:border-green-600">＋</button>
          <button onClick={() => onPut({ variantId: v.id, delta: -1, type: "writeoff", note: "Списання −1" })} title="Списання −1"
            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e2ddd5] text-red-600 hover:border-red-500">－</button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={onDelete} className="text-[#b9ae9b] hover:text-red-600" title="Видалити пропозицію">✕</button>
      </td>
    </tr>
  );
}
