"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/* ── types (mirrors server types, no server imports) ─────────────────────── */
type PreviewItem = {
  name: string; sku?: string; size?: string;
  oldQty: number | null; newQty: number | null;
  oldPrice: number | null; newPrice: number | null; discountPrice: number | null;
  isNew: boolean;
  moderationNote?: "pending" | "draft";
};
type UnmatchedItem = {
  key: string; size?: string;
  factory_article?: string; external_id?: string; barcode?: string;
  quantity?: number | null; base_price?: number; discount_price?: number;
};
type ImportPreview = {
  kind: "offers" | "unknown";
  filename: string; totalRows: number;
  matchedRows: number; unmatchedRows: number;
  affectedProducts: number; newProducts: number; newVariants: number; stockChanges: number; priceChanges: number;
  items: PreviewItem[];
  unmatched: UnmatchedItem[];
  aiUsed?: boolean;
};
type ApplyResult = {
  kind: string; matchedRows: number; unmatchedRows: number;
  productsCreated: number; productsUpdated: number; variantsUpserted: number; stockMovements: number;
};
type HistoryEntry = {
  filename: string; kind: "offers" | "unknown"; at: string;
  productsCreated: number; productsUpdated: number; variantsUpserted: number;
  stockMovements: number; matchedRows: number; unmatchedRows: number;
};
type FileStatus = "idle" | "previewing" | "ready" | "error" | "applying" | "done";
type FileItem = {
  id: string; file: File; status: FileStatus; templateId: string;
  preview: ImportPreview | null; result: ApplyResult | null; error: string;
};

/* ── constants ────────────────────────────────────────────────────────────── */
const KIND_LABEL: Record<string, string> = {
  offers: "Таблиця ОСТАТКИ (.csv)",
  unknown: "Невідомий",
};
const KIND_COLOR: Record<string, string> = {
  offers: "bg-blue-50 text-blue-700 border-blue-200",
  unknown: "bg-red-50 text-red-600 border-red-200",
};

/* ── helpers ──────────────────────────────────────────────────────────────── */
function uah(n: number) { return Math.round(n).toLocaleString("uk-UA") + " ₴"; }
function dmy(s: string) {
  return new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв тому`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

/** fetch with a hard timeout — a hung server response must never leave the UI
 *  stuck showing "застосування…" forever with no way out. */
async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Client-side CSV export of the full unmatched list (server sends up to 5000,
 *  well beyond the ~30 shown inline) — for tracking down real supplier-code
 *  mismatches in a spreadsheet rather than scrolling a truncated on-screen list. */
function downloadUnmatchedCsv(preview: ImportPreview) {
  const esc = (s: string) => /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = ["код;розмір", ...preview.unmatched.map((u) => `${esc(u.key)};${esc(u.size ?? "")}`)];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `не_знайдено_${preview.filename.replace(/\.[^.]+$/, "")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── StatChip ─────────────────────────────────────────────────────────────── */
function StatChip({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-[4px] border border-[#E0E0E0] bg-white px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-[#9E9E9E]">{label}</p>
      <p className={`mt-0.5 text-[16px] tabular-nums font-medium ${accent ?? "text-[#1f2733]"}`}>
        {typeof value === "number" ? value.toLocaleString("uk-UA") : value}
      </p>
    </div>
  );
}

/* ── QuickCreateRow ───────────────────────────────────────────────────────── */
const fieldCls = "h-8 w-full rounded-[3px] border border-[#E0E0E0] bg-white px-2 text-[12px] text-[#1f2733] outline-none focus:border-[#2f9488]";

/**
 * Turns one unmatched OFFERS row into a real product on the spot — the whole
 * point being that a supplier's ОСТАТКИ file can introduce a genuinely new
 * item without the admin ever having to build a separate table just to cover
 * one or two rows. Prefills everything the row already carries
 * (code, size, qty, price); the admin only has to type the name (brand/
 * category default server-side if left blank, same as "Каталог → Новий товар").
 */
function QuickCreateRow({ item, onCreated }: { item: UnmatchedItem; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState(item.base_price ? String(Math.round(item.base_price)) : "");
  const [salePrice, setSalePrice] = useState(item.discount_price ? String(Math.round(item.discount_price)) : "");
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity) : "0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (!name.trim() || !price) return;
    setSaving(true); setError("");
    try {
      const r = await fetchWithTimeout("/api/admin/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), brand: brand.trim() || undefined,
          regular_price: Number(price) || 0,
          sale_price: salePrice ? Number(salePrice) || null : null,
          factory_article: item.factory_article || item.key || undefined,
          sku: item.external_id || undefined,
          sizes: item.size ? [{ size: item.size, qty: Number(qty) || 0 }] : [],
        }),
      }, 20_000);
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error ?? "Помилка створення"); setSaving(false); return; }
      setDone(true);
      onCreated();
    } catch {
      setError("Помилка мережі — спробуйте ще раз"); setSaving(false);
    }
  }

  if (done) {
    return (
      <li className="flex items-center gap-2 rounded-[3px] bg-green-50 px-2 py-1.5 text-green-700">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Товар «{name}» створено — оновлюємо превʼю…</span>
      </li>
    );
  }

  return (
    <li className="rounded-[3px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-medium">{item.key}</span>
        {item.size && <span className="text-amber-500">· {item.size}</span>}
        {item.quantity != null && <span className="text-amber-500">· {item.quantity} од</span>}
        {!!item.base_price && <span className="text-amber-500">· {Math.round(item.base_price)}₴</span>}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.08em] text-amber-700 hover:underline">
          {open ? "Скасувати" : "+ Створити товар"}
        </button>
      </div>
      {open && (
        <div className="mt-1.5 grid gap-1.5 rounded-[4px] border border-amber-200 bg-white p-2.5 sm:grid-cols-4">
          <input className={`${fieldCls} sm:col-span-2`} placeholder="Назва товару*" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className={fieldCls} placeholder="Бренд" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <input className={fieldCls} placeholder="Ціна*" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input className={fieldCls} placeholder="Акційна" type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          <input className={fieldCls} placeholder="Кількість" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          {item.size && <span className="flex items-center text-[11px] text-[#9E9E9E]">Розмір: <b className="ml-1 text-[#5a6472]">{item.size}</b></span>}
          {error && <p className="text-[11px] text-red-600 sm:col-span-4">{error}</p>}
          <button onClick={submit} disabled={saving || !name.trim() || !price}
            className="h-8 rounded-[3px] border border-[#2f9488] px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40 sm:col-span-4">
            {saving ? "Створення…" : "Створити й перевірити знову"}
          </button>
        </div>
      )}
    </li>
  );
}

/* ── DiffTable ────────────────────────────────────────────────────────────── */
type DiffFilter = "all" | "changed" | "new" | "same";

function DiffTable({ preview, onProductCreated }: { preview: ImportPreview; onProductCreated: () => void }) {
  const [filter, setFilter] = useState<DiffFilter>("all");
  const [showUnmatched, setShowUnmatched] = useState(false);
  const isOffers = preview.kind === "offers";

  const newCount     = preview.items.filter((i) => i.isNew).length;
  const changedCount = preview.items.filter((i) => !i.isNew && (
    (i.newQty != null && i.newQty !== i.oldQty) ||
    (i.newPrice != null && Math.abs((i.newPrice || 0) - (i.oldPrice || 0)) > 1)
  )).length;
  const sameCount    = preview.items.length - newCount - changedCount;

  const items = preview.items.filter((it) => {
    const qtyChanged   = it.newQty != null && it.newQty !== it.oldQty;
    const priceChanged = it.newPrice != null && Math.abs((it.newPrice || 0) - (it.oldPrice || 0)) > 1;
    if (filter === "new")     return it.isNew;
    if (filter === "changed") return !it.isNew && (qtyChanged || priceChanged);
    if (filter === "same")    return !it.isNew && !qtyChanged && !priceChanged;
    return true;
  });

  const FILTERS: { v: DiffFilter; l: string; n: number }[] = [
    { v: "all",     l: "Всі",        n: preview.items.length },
    { v: "changed", l: "Зміни",      n: changedCount },
    { v: "new",     l: "Нові",       n: newCount },
    { v: "same",    l: "Без змін",   n: sameCount },
  ];

  return (
    <div className="space-y-3">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`rounded-[3px] px-3 py-1.5 text-[11px] transition-colors ${
              filter === f.v
                ? "bg-[#2f9488] text-white"
                : "border border-[#E0E0E0] bg-white text-[#3a4250] hover:border-[#2f9488]"
            }`}>
            {f.l} <span className={`${filter === f.v ? "opacity-70" : "text-[#BDBDBD]"}`}>{f.n}</span>
          </button>
        ))}
        {preview.items.length >= 120 && (
          <span className="ml-auto text-[11px] text-[#9E9E9E]">Показано перші 120 з {preview.matchedRows}</span>
        )}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0]">
        <table className="w-full min-w-[600px] text-[12px]">
          <thead>
            <tr className="border-b border-[#F5F5F5] bg-[#FAFAFA] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-3 py-2 text-left">Товар</th>
              {isOffers && <th className="w-16 px-3 py-2 text-center">Розмір</th>}
              <th className="w-28 px-3 py-2 text-center">Залишок</th>
              <th className="w-36 px-3 py-2 text-center">Ціна</th>
              {isOffers && <th className="w-28 px-3 py-2 text-center">Акційна</th>}
              <th className="w-24 px-3 py-2 text-center">Стан</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {items.slice(0, 150).map((it, i) => {
              const qtyChanged   = it.newQty   != null && it.newQty   !== it.oldQty;
              const priceChanged = it.newPrice != null && Math.abs((it.newPrice || 0) - (it.oldPrice || 0)) > 1;
              return (
                <tr key={i} className={`${it.isNew ? "bg-green-50/50" : (qtyChanged || priceChanged) ? "bg-amber-50/30" : ""} hover:bg-[#FAFAFA]`}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-[#1f2733]">{it.name}</span>
                    {it.sku && <span className="ml-2 text-[10px] text-[#BDBDBD]">#{it.sku}</span>}
                  </td>
                  {isOffers && <td className="px-3 py-2 text-center font-medium text-[#3a4250]">{it.size || "—"}</td>}

                  {/* qty */}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {it.newQty == null ? (
                      <span className="text-[#BDBDBD]">—</span>
                    ) : it.isNew ? (
                      <span className="font-medium text-green-700">→ {it.newQty}</span>
                    ) : qtyChanged ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[#BDBDBD] line-through">{it.oldQty ?? 0}</span>
                        <span className="text-[#2f9488]">→</span>
                        <span className={`font-medium ${(it.newQty ?? 0) > (it.oldQty ?? 0) ? "text-green-700" : "text-red-600"}`}>{it.newQty}</span>
                      </span>
                    ) : (
                      <span className="text-[#3a4250]">{it.newQty}</span>
                    )}
                  </td>

                  {/* price */}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {it.newPrice == null ? (
                      <span className="text-[#BDBDBD]">{it.oldPrice ? uah(it.oldPrice) : "—"}</span>
                    ) : priceChanged ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[10px] text-[#BDBDBD] line-through">{it.oldPrice ? uah(it.oldPrice) : "—"}</span>
                        <span className="text-[#2f9488]">→</span>
                        <span className="font-medium text-[#1f2733]">{uah(it.newPrice)}</span>
                      </span>
                    ) : (
                      <span className="text-[#3a4250]">{uah(it.newPrice)}</span>
                    )}
                  </td>

                  {isOffers && (
                    <td className="px-3 py-2 text-center tabular-nums text-[#9E9E9E]">
                      {it.discountPrice ? uah(it.discountPrice) : "—"}
                    </td>
                  )}

                  {/* badge */}
                  <td className="px-3 py-2 text-center">
                    {it.isNew ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="rounded-[3px] bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">новий</span>
                        {it.moderationNote === "pending" && (
                          <span className="rounded-[3px] bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">На модерації</span>
                        )}
                        {it.moderationNote === "draft" && (
                          <span className="rounded-[3px] bg-[#F0F0F0] px-1.5 py-0.5 text-[10px] text-[#757575]">Чернетка</span>
                        )}
                      </span>
                    ) : qtyChanged && priceChanged ? (
                      <span className="rounded-[3px] bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">зал+ціна</span>
                    ) : qtyChanged ? (
                      <span className="rounded-[3px] bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">залишок</span>
                    ) : priceChanged ? (
                      <span className="rounded-[3px] bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">ціна</span>
                    ) : (
                      <span className="text-[10px] text-[#BDBDBD]">без змін</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-[12px] text-[#9E9E9E]">Немає рядків для цього фільтра</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* unmatched */}
      {preview.unmatched.length > 0 && (
        <div className="rounded-[4px] border border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between px-4 py-2.5">
            <button onClick={() => setShowUnmatched((v) => !v)} className="flex-1 text-left text-[12px] text-amber-800">
              ⚠ Не знайдено в каталозі: <b>{preview.unmatchedRows}</b>
              <span className="ml-2 text-[11px]">{showUnmatched ? "▲" : "▼ показати"}</span>
            </button>
            <button onClick={() => downloadUnmatchedCsv(preview)}
              className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-amber-700 hover:underline">
              ↓ CSV
            </button>
          </div>
          {showUnmatched && (
            <ul className="space-y-1.5 border-t border-amber-200 px-4 py-2.5 text-[11px] text-amber-700">
              {isOffers && (
                <li className="pb-0.5 text-amber-600">Товару справді ще немає в каталозі? Натисніть «+ Створити товар» на потрібному рядку — без окремого файлу.</li>
              )}
              {preview.unmatched.slice(0, 30).map((u, i) => (
                <QuickCreateRow key={i} item={u} onCreated={onProductCreated} />
              ))}
              {preview.unmatchedRows > 30 && (
                <li className="text-amber-400">…і ще {preview.unmatchedRows - 30} (повний список — у CSV)</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ── FileCard ─────────────────────────────────────────────────────────────── */
/**
 * Design goal: the admin never has to click "expand" to find the one button
 * that matters. Every meaningful state (ready to apply, done, error) is fully
 * visible in the collapsed header row. Expanding is strictly optional — only
 * for the row-by-row diff table.
 */
function FileCard({
  item, expanded, onExpand, onRemove, onApply, onRetry, onProductCreated,
}: {
  item: FileItem; expanded: boolean;
  onExpand: () => void; onRemove: () => void; onApply: () => void; onRetry: () => void; onProductCreated: () => void;
}) {
  const kind = item.preview?.kind ?? "unknown";
  const showPreview = item.preview && (item.status === "ready" || item.status === "done" || item.status === "applying");
  const canApply = item.status === "ready" && (item.preview?.matchedRows ?? 0) > 0;

  return (
    <div className={`rounded-[5px] border-2 bg-white transition-colors ${
      item.status === "error" ? "border-red-300" :
      item.status === "done" ? "border-green-300" :
      canApply ? "border-[#2f9488]" :
      "border-[#E0E0E0]"
    }`}>
      {/* header row — always shows the full verdict, no expand needed */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          item.status === "done"       ? "bg-green-500" :
          item.status === "error"      ? "bg-red-500" :
          canApply                     ? "bg-[#2f9488]" :
          item.status === "previewing" || item.status === "applying" ? "bg-blue-400 animate-pulse" :
          "bg-[#ddd]"
        }`} />

        <button onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 truncate text-[13px] font-medium text-[#1f2733]">{item.file.name}</span>
          {item.preview && (
            <span className={`shrink-0 rounded-[3px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] ${KIND_COLOR[kind]}`}>
              {KIND_LABEL[kind]}
            </span>
          )}
        </button>

        {/* one-line verdict — this replaces having to expand to know what's going on */}
        {item.status === "previewing" && <span className="shrink-0 text-[12px] text-[#9E9E9E] animate-pulse">Читаємо файл…</span>}
        {item.status === "applying" && <span className="shrink-0 text-[12px] text-blue-600 animate-pulse">Записуємо в базу…</span>}
        {item.status === "done" && item.result && (
          <span className="shrink-0 text-[12px] font-medium text-green-700">
            ✓ {item.result.productsCreated > 0 && `+${item.result.productsCreated} нових · `}
            {item.result.productsUpdated > 0 && `${item.result.productsUpdated} оновлено · `}
            {item.result.stockMovements} рухів
          </span>
        )}
        {item.status === "ready" && item.preview && (
          <span className="shrink-0 text-[12px] text-[#5a6472]">
            {item.preview.newProducts > 0 ? `${item.preview.newProducts} нових товарів` : `${item.preview.matchedRows.toLocaleString("uk-UA")} знайдено`}
          </span>
        )}

        {/* THE button — always right here, never hidden behind expand */}
        {canApply && (
          <button onClick={(e) => { e.stopPropagation(); onApply(); }}
            className="h-9 shrink-0 rounded-[4px] border border-[#2f9488] px-5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white">
            Застосувати
          </button>
        )}
        {item.status === "error" && (
          <button onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="h-9 shrink-0 rounded-[4px] border border-red-300 bg-white px-4 text-[11px] font-medium uppercase tracking-[0.1em] text-red-700 hover:bg-red-50">
            Спробувати ще раз
          </button>
        )}

        <button onClick={(e) => { e.stopPropagation(); onExpand(); }} title={expanded ? "Згорнути деталі" : "Показати деталі"}
          className="shrink-0 text-[#9E9E9E] hover:text-[#2f9488]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 text-[#BDBDBD] hover:text-red-500" title="Видалити файл">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* error message — shown right below the header, not gated behind expand */}
      {item.status === "error" && item.error && (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[12px] text-red-700">{item.error}</p>
      )}
      {/* expanded body — optional detail, never required to apply */}
      {expanded && (
        <div className="border-t border-[#F5F5F5] px-4 py-4 space-y-4">
          {showPreview && item.preview && (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <StatChip label="Знайдено"     value={item.preview.matchedRows}   accent="text-green-700" />
                {item.preview.newProducts > 0
                  ? <StatChip label="Нові товари" value={item.preview.newProducts} accent="text-green-700" />
                  : <StatChip label="Не знайдено"  value={item.preview.unmatchedRows} accent={item.preview.unmatchedRows ? "text-red-600" : undefined} />}
                <StatChip label="Товарів"      value={item.preview.affectedProducts + item.preview.newProducts} />
                <StatChip label="Нові розміри" value={item.preview.newVariants} />
                <StatChip label="Зміни залишку" value={item.preview.stockChanges} />
                <StatChip label="Зміни ціни"   value={item.preview.priceChanges} />
              </div>

              {item.preview.matchedRows === 0 && item.preview.newProducts === 0 && (
                <p className="rounded-[4px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  Жоден рядок не зіставлено з каталогом і немає даних для авто-створення. Перевірте «Заводський артикул» у файлі — рядки без нього
                  або без назви товару потрапляють у «Не знайдено» нижче, де їх можна створити вручну кнопкою «+ Створити товар».
                </p>
              )}

              {item.status !== "done" && <DiffTable preview={item.preview} onProductCreated={onProductCreated} />}
            </>
          )}

          {item.result && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StatChip label="Оброблено"        value={item.result.matchedRows}     accent="text-green-700" />
              <StatChip label="Товарів створено" value={item.result.productsCreated} accent={item.result.productsCreated ? "text-green-700" : undefined} />
              <StatChip label="Товарів оновлено" value={item.result.productsUpdated} />
              <StatChip label="Розмірів"         value={item.result.variantsUpserted} />
              <StatChip label="Рухів складу"     value={item.result.stockMovements} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── StartGuide — "з чого почати" (shown until first file is added) ────────── */
/** A small scrollable preview of the exact columns + one sample data row. */
function ExampleTable({ header, row, accent }: { header: string[]; row: string[]; accent: string }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[4px] border border-[#E0E0E0]">
      <table className="w-full border-collapse text-[11px] tabular-nums">
        <thead>
          <tr>
            {header.map((h) => (
              <th key={h} className={`whitespace-nowrap border-b border-r border-[#E0E0E0] px-2 py-1.5 text-left font-medium ${accent}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {row.map((c, i) => (
              <td key={i} className="whitespace-nowrap border-r border-[#F0F0F0] px-2 py-1.5 text-[#5a6472]">{c}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** One step of the numbered, connected "how verification works" timeline. */
function GuideStep({ n, color, title, last, children }: { n: number; color: string; title: string; last?: boolean; children: ReactNode }) {
  return (
    <div className="relative pl-10 pb-4 last:pb-0">
      {!last && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-[#E0E0E0]" />}
      <span className={`absolute left-0 top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-semibold text-white ${color}`}>{n}</span>
      <p className="pt-0.5 text-[13px] font-semibold text-[#1f2733]">{title}</p>
      <div className="mt-1 space-y-1.5 text-[12px] leading-relaxed text-[#5a6472]">{children}</div>
    </div>
  );
}

/** A supplementary (non-numbered) info card — icon badge + title + body, same visual family as GuideStep. */
function GuideInfoCard({ icon, iconBg, title, children }: { icon: ReactNode; iconBg: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[5px] border border-[#E0E0E0] bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg}`}>{icon}</span>
        <p className="text-[13px] font-semibold text-[#1f2733]">{title}</p>
      </div>
      <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-[#5a6472]">{children}</div>
    </div>
  );
}

function DownloadExample({ label }: { label: string }) {
  return (
    <a href="/api/erp/import/template?kind=offers" download
      className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-[#BDBDBD] bg-white px-3 py-1.5 text-[11px] font-medium text-[#3a4250] transition-colors hover:border-[#2f9488] hover:text-[#2f9488]">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {label}
    </a>
  );
}

/** Static "з чого почати" panel — shown until the first file is added.
 *  Only one supported format (Intertop ОСТАТКИ), so there's nothing to pick. */
function StartGuide() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div className="mb-4 rounded-[6px] border border-[#E0E0E0] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11A8 8 0 006 5.3L3 8m0 0V3m0 5h5m-5 5a8 8 0 0014 5.7l3-2.7m0 0v5m0-5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9E9E9E]">Формат</p>
            <h2 className="mt-0.5 text-[15px] font-medium text-[#1f2733]">Таблиця ОСТАТКИ <span className="text-[#9E9E9E] font-normal">(.csv)</span></h2>
          </div>
        </div>
        <button onClick={() => setDetailsOpen((v) => !v)}
          className="shrink-0 rounded-[3px] border border-[#E0E0E0] px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488]">
          {detailsOpen ? "Згорнути деталі" : "Як саме працює перевірка? →"}
        </button>
      </div>

      <div className="mt-4 relative rounded-[5px] border border-blue-200 bg-blue-50/40 p-4">
        <p className="text-[12px] leading-relaxed text-[#5a6472]">
          Що <b>реально є зараз</b> + актуальні ціни. <b>Оновлює наявність і ціни</b> у вже створених товарах, зіставляючи по <b>factory_article + розмір</b>
          (а рядок без збігу, якщо несе назву товару, <b>сам створює нову картку</b> — окремий MG-файл для цього більше не потрібен). Роздільник — <b>крапка з комою</b>.
        </p>
        <ExampleTable
          header={["external_Id", "factory_article", "barcode", "size", "quantity", "base_price", "discount_price"]}
          row={["ART-10001", "ART-10001", "48200000...", "S", "2", "4200.00", "3360.00"]}
          accent="bg-blue-50 text-blue-900"
        />
        <DownloadExample label="Завантажити приклад ОСТАТКИ.csv" />
      </div>

      <div className="mt-4 grid gap-2 rounded-[5px] bg-[#FAFAFA] p-3 text-[11px] text-[#5a6472] sm:grid-cols-2">
        <span className="flex items-start gap-1.5"><span className="mt-0.5 text-[#2f9488]">✓</span> Спершу <b>превʼю</b> — нічого не змінюється, поки не натиснете «Застосувати»</span>
        <span className="flex items-start gap-1.5"><span className="mt-0.5 text-[#2f9488]">✓</span> Рядок без свого товару, але з назвою — <b>сам стане новою карткою</b> при застосуванні</span>
        <span className="flex items-start gap-1.5"><span className="mt-0.5 text-[#2f9488]">✓</span> Рядок зовсім без даних для створення потрапить у <b>«не знайдено»</b> — створіть товар прямо звідти, одним кліком</span>
        <span className="flex items-start gap-1.5"><span className="mt-0.5 text-[#2f9488]">✓</span> Незнайомий формат колонок <b>розпізнає ШІ</b> автоматично</span>
      </div>

      {detailsOpen && (
        <div className="mt-4 rounded-[5px] border border-[#E0E0E0] bg-[#FAFAFA] p-4">
          {/* numbered, connected timeline — mirrors the actual preview→apply sequence */}
          <div>
            <GuideStep n={1} color="bg-blue-500" title="Розпізнавання файлу">
              <p>
                Щойно файл кинуто в зону завантаження, він одразу йде на «превʼю» (нічого ще не пишеться в базу).
                Сервер дивиться на назви колонок — потрібні <span className="font-mono text-[11px]">size</span> і хоча б одне з
                <span className="font-mono text-[11px]"> quantity</span> / <span className="font-mono text-[11px]">base_price</span>.
              </p>
              <p>
                Якщо колонки не збігаються з відомим шаблоном — файл автоматично надсилається на розпізнавання ШІ, який сам визначає, яка колонка за що відповідає.
                Якщо навіть ШІ не може впевнено визначити формат — картка файлу підсвічується червоним і показує помилку замість статистики.
              </p>
            </GuideStep>

            <GuideStep n={2} color="bg-[#2f9488]" title="Превʼю — як саме зіставляються рядки з товарами">
              <p>Для кожного рядка система шукає відповідний товар у каталозі за ланцюжком пріоритету (перший збіг перемагає):</p>
              <ol className="ml-4 list-decimal space-y-0.5">
                <li><b>offer_code</b> — точний код пропозиції з розмірної сітки товару, якщо він вже був заповнений раніше;</li>
                <li><b>barcode</b> — штрихкод конкретного розміру;</li>
                <li><b>factory_article</b> — заводський артикул постачальника (заповнюється при попередньому імпорті або вручну в картці товару);</li>
                <li><b>external_id / sku</b> — резервний варіант, коли жоден із перших трьох не збігся.</li>
              </ol>
              <p>
                Якщо жоден із чотирьох варіантів не знайшов товар, але рядок несе назву товару (типово для одезда-шаблону) — така група рядків
                (усі розміри одного товару) при застосуванні <b>сама створить нову картку</b>. Якщо ж даних для створення теж немає — рядок потрапляє
                у список <b>«Не знайдено»</b>, де кожен запис має кнопку <b>«+ Створити товар»</b> — коротка форма (назва + ціна), вже заповнена
                кодом, розміром і кількістю з файлу.
              </p>
              <p>
                На цьому етапі порівнюються поточні значення в базі (<i>було</i>) з тими, що прийшли у файлі (<i>стане</i>) — саме це і показує таблиця
                нижче з фільтрами «Зміни / Нові / Без змін». <b>У базі ще нічого не змінено</b> — це чисте порівняння для перевірки перед застосуванням.
              </p>
            </GuideStep>

            <GuideStep n={3} color="bg-emerald-600" title="«Застосувати» — що саме записується в базу" last>
              <p>
                Для кожного зіставленого рядка оновлюється кількість і ціна конкретного розміру у <span className="font-mono text-[11px]">product_variants</span>,
                і кожна зміна кількості пишеться окремим рядком в <span className="font-mono text-[11px]">stock_movements</span> (звідки береться цифра «рухів» у результаті).
                Після цього <b>сумарний залишок і статус «в наявності» перераховуються автоматично</b> як сума по всіх розмірах — вручну чіпати не потрібно.
              </p>
            </GuideStep>
          </div>

          {/* supplementary info — not steps in the sequence, referenced from it */}
          <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
            <GuideInfoCard
              iconBg="bg-violet-100 text-violet-700"
              title="Що означають цифри у превʼю"
              icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 19V10m6 9V5m6 14v-7" strokeLinecap="round" /></svg>}
            >
              <ul className="ml-4 list-disc space-y-0.5">
                <li><b>Знайдено</b> — рядків файлу з товаром у каталозі (буде застосовано).</li>
                <li><b>Нові товари</b> — груп рядків без збігу, які самі створять картку товару.</li>
                <li><b>Товарів</b> — унікальних карток, які зачепить файл (створення + оновлення).</li>
                <li><b>Нові розміри</b> — записів у product_variants, що з'являться вперше.</li>
                <li><b>Зміни залишку / ціни</b> — рядків, що реально відрізняються від бази зараз.</li>
              </ul>
            </GuideInfoCard>

            <GuideInfoCard
              iconBg="bg-[#f7f9fa] text-[#5a6472]"
              title="Історія імпортів"
              icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            >
              <p>
                Кожне застосування зберігається окремим записом (файл, час, скільки створено/оновлено товарів, розмірів, рухів складу, скільки не знайдено) —
                видно нижче й у <b>Моніторинг → журнал активності</b>. Клік по запису розкриває повну статистику саме цього імпорту.
              </p>
            </GuideInfoCard>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */

export function ErpImport({ onBack, onImported, onGoToCatalog }: {
  onBack?: () => void;
  onImported?: (msg: string) => void;
  onGoToCatalog?: () => void;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"" | "offers">("");
  const [historyOpenIdx, setHistoryOpenIdx] = useState<number | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; format: string; column_count?: number }[]>([]);
  const [templateId, setTemplateId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Mirrors `files` for code that needs the LIVE list mid-loop (applyAll) —
  // the `files` closure captured at loop-start goes stale once sibling
  // previews start updating state asynchronously.
  const filesRef = useRef<FileItem[]>([]);
  useEffect(() => { filesRef.current = files; }, [files]);

  // Live catalog state — shown as a strip at the top and refreshed after every
  // apply so the admin literally watches the numbers move (the "real-time
  // check" part of import → apply → verify).
  const [catalog, setCatalog] = useState<{ total: number; inStock: number; outStock: number; noPhoto: number } | null>(null);
  const loadCatalog = useCallback(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => setCatalog({ total: d.products_total ?? 0, inStock: d.in_stock ?? 0, outStock: d.out_of_stock ?? 0, noPhoto: d.no_photo_live ?? 0 }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/erp/import")
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
    fetch("/api/admin/import-templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
    loadCatalog();
  }, [loadCatalog]);

  const runPreview = useCallback(async (id: string, file: File, tplId: string): Promise<ImportPreview | null> => {
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "previewing" } : f));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "preview");
    if (tplId) fd.append("templateId", tplId);
    try {
      const r = await fetchWithTimeout("/api/erp/import", { method: "POST", body: fd }, 60_000);
      const d = await r.json();
      if (d.preview) {
        const preview = d.preview as ImportPreview;
        setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "ready", preview } : f));
        setExpandedId(id);
        return preview;
      }
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: d.error ?? "Помилка читання" } : f));
      return null;
    } catch (e) {
      const msg = e instanceof DOMException && e.name === "AbortError"
        ? "Час очікування вичерпано (60с) — спробуйте ще раз"
        : "Помилка мережі — перевірте зʼєднання й спробуйте ще раз";
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: msg } : f));
      return null;
    }
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const toAdd: FileItem[] = Array.from(fileList).map((file) => ({
      id: uid(), file, status: "idle" as FileStatus, templateId,
      preview: null, result: null, error: "",
    }));
    setFiles((prev) => [...prev, ...toAdd]);
    for (const item of toAdd) runPreview(item.id, item.file, item.templateId);
  }, [runPreview, templateId]);

  const applyFile = useCallback(async (id: string): Promise<void> => {
    // Read the file from filesRef (always current — mirrored via effect),
    // not from inside the setFiles updater: the updater callback is NOT
    // guaranteed to run synchronously before the next line executes, so a
    // "capture via closure inside setState, read right after" pattern here
    // silently reads a stale `null` and returns early — the exact bug behind
    // "Застосувати" appearing to do nothing (state flips to a visual
    // "applying" flash from React's own re-render, then nothing follows).
    const item = filesRef.current.find((f) => f.id === id) ?? null;
    const file = item?.file ?? null;
    if (!file) return;
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "applying" } : f));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "apply");
    if (item?.templateId) fd.append("templateId", item.templateId);
    try {
      // Longer budget than preview — a full-catalog apply writes many rows in
      // one transaction. Still bounded: never leaves "застосування…" hanging
      // forever with no way for the admin to know something went wrong.
      const r = await fetchWithTimeout("/api/erp/import", { method: "POST", body: fd }, 100_000);
      const d = await r.json();
      if (r.ok && d.result) {
        const res = d.result as ApplyResult;
        setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "done", result: res } : f));
        fetch("/api/erp/import").then((r) => r.json()).then((d) => setHistory(d.history ?? [])).catch(() => {});
        loadCatalog();
        const parts: string[] = [];
        if (res.productsCreated) parts.push(`+${res.productsCreated} нових`);
        if (res.productsUpdated) parts.push(`${res.productsUpdated} оновлено`);
        if (res.stockMovements) parts.push(`${res.stockMovements} рухів залишків`);
        onImported?.(`Імпорт застосовано: ${parts.join(" · ") || "без змін"}`);

        // This apply may have auto-created products (odezda-style rows) or
        // changed factory_article — any sibling file still waiting (dropped in
        // the same batch) was matched against the OLD, pre-apply DB state at
        // drop-time. Its preview counts are now stale unless we re-run preview
        // for it against the fresh DB. Awaited so callers (applyAll) see
        // up-to-date filesRef state right after this resolves.
        const siblings = filesRef.current.filter((f) => f.id !== id && (f.status === "ready" || f.status === "error"));
        await Promise.all(siblings.map((s) => runPreview(s.id, s.file, s.templateId)));
      } else {
        setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: d.error ?? "Помилка застосування" } : f));
      }
    } catch (e) {
      const msg = e instanceof DOMException && e.name === "AbortError"
        ? "Час очікування вичерпано (100с) — перевірте «Каталог зараз» вгорі: можливо, частина вже застосувалась, спробуйте ще раз"
        : "Помилка мережі — спробуйте ще раз";
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: msg } : f));
    }
  }, [runPreview, loadCatalog]);

  // Applies every ready file. Re-checks the LIVE file list after each apply
  // (via filesRef) instead of a list frozen at call-time — an apply re-previews
  // sibling files in-flight (see applyFile), which can turn a file that looked
  // unmatched at drop-time into a real match. Without this re-check, that file
  // would never get applied in the same batch.
  const applyAll = useCallback(async () => {
    setApplyingAll(true);
    const appliedIds = new Set<string>();
    for (let guard = 0; guard < 50; guard++) {
      const candidates = filesRef.current.filter((f) =>
        !appliedIds.has(f.id) && f.status === "ready" && (f.preview?.matchedRows ?? 0) > 0
      );
      if (candidates.length === 0) break;
      const next = candidates[0];
      appliedIds.add(next.id);
      await applyFile(next.id);
    }
    setApplyingAll(false);
  }, [applyFile]);

  const readyCount = files.filter((f) => f.status === "ready" && (f.preview?.matchedRows ?? 0) > 0).length;
  const hasFiles   = files.length > 0;
  const allDone    = hasFiles && files.every((f) => f.status === "done" || f.status === "error");
  const doneResults = files.filter((f) => f.status === "done" && f.result).map((f) => f.result!);
  const applied = doneResults.reduce((a, r) => ({
    created: a.created + r.productsCreated,
    updated: a.updated + r.productsUpdated,
    movements: a.movements + r.stockMovements,
  }), { created: 0, updated: 0, movements: 0 });
  function startNewBatch() {
    setFiles([]); setExpandedId(null);
  }

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      {/* header — sticky so the apply action is never scrolled out of view */}
      <div className="sticky -top-6 z-20 -mx-6 mb-5 border-b border-[#E0E0E0] bg-white px-6 pb-4 pt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          {onBack && (
            <button onClick={onBack}
              className="mb-1.5 text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-[#2f9488]">
              ‹ До товарів
            </button>
          )}
          <h1 className="text-[22px] font-light tracking-tight">Завантажити товари</h1>
          <p className="mt-0.5 text-[12px] text-[#9E9E9E]">
            Оновлення залишків і цін — таблиця ОСТАТКИ (.csv); рядок без товару в каталозі сам створить нову картку.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {readyCount > 1 && (
            <button onClick={applyAll} disabled={applyingAll}
              className="h-9 rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] shadow-sm hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
              {applyingAll ? "Застосування…" : `Застосувати всі (${readyCount})`}
            </button>
          )}
          {hasFiles && (
            <button onClick={startNewBatch}
              className="h-9 rounded-[3px] border border-[#E0E0E0] px-3 text-[11px] text-[#3a4250] hover:border-[#2f9488]">
              {allDone ? "Нові файли" : "Очистити"}
            </button>
          )}
        </div>
      </div>

      {/* Live catalog state — updates right after each apply so the effect of
          an import is visible in real time */}
      {catalog && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[5px] border border-[#E0E0E0] bg-[#FAFAFA] px-5 py-3">
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#9E9E9E]">Каталог зараз</span>
          <span className="flex items-baseline gap-1.5 text-[13px] text-[#1f2733]">
            <b className="text-[18px] font-medium tabular-nums">{catalog.total.toLocaleString("uk-UA")}</b> товарів
          </span>
          <span className="flex items-baseline gap-1.5 text-[13px] text-[#1f2733]">
            <b className="text-[18px] font-medium tabular-nums text-green-600">{catalog.inStock.toLocaleString("uk-UA")}</b> в наявності
          </span>
          <span className="flex items-baseline gap-1.5 text-[13px] text-[#9E9E9E]">
            <b className="text-[18px] font-medium tabular-nums">{catalog.outStock.toLocaleString("uk-UA")}</b> немає
          </span>
          {catalog.noPhoto > 0 && (
            <span className="flex items-baseline gap-1.5 text-[13px] text-amber-700" title="Є залишок, але вітрина ховає їх без фото — див. Налаштування → Магазин">
              <b className="text-[18px] font-medium tabular-nums">{catalog.noPhoto.toLocaleString("uk-UA")}</b> без фото (не на сайті)
            </span>
          )}
          {onGoToCatalog && (
            <button onClick={onGoToCatalog} className="ml-auto text-[11px] uppercase tracking-[0.1em] text-[#2f9488] hover:underline">
              Відкрити каталог →
            </button>
          )}
        </div>
      )}

      {/* success banner — after all files applied. Honest about the next
          real blocker (no photo → storefront hides it) instead of just
          saying "done" and leaving the admin to discover that on their own. */}
      {allDone && doneResults.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-[4px] border border-green-200 bg-green-50">
          <div className="flex flex-wrap items-center gap-4 px-4 py-3">
            <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-green-800">Імпорт застосовано в базу</p>
              <p className="mt-0.5 text-[12px] text-green-700">
                {applied.created > 0 && <><b>+{applied.created}</b> нових товарів · </>}
                <b>{applied.updated}</b> оновлено · <b>{applied.movements.toLocaleString("uk-UA")}</b> рухів залишків
              </p>
            </div>
            {onGoToCatalog && (
              <button onClick={onGoToCatalog}
                className="h-9 shrink-0 rounded-[3px] bg-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-white shadow-sm hover:opacity-90">
                Перейти до каталогу →
              </button>
            )}
          </div>
          {!!catalog?.noPhoto && applied.created > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" strokeLinecap="round" /></svg>
              <span>
                Але на сайті вони можуть ще не з'явитись: у каталозі зараз <b>{catalog.noPhoto}</b> товарів без фото —
                вітрина за замовчуванням їх ховає.
              </span>
              {onGoToCatalog && (
                <button onClick={onGoToCatalog} className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.1em] text-amber-900 hover:underline">
                  Додати фото масово →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* onboarding — only before the first file is added */}
      {!hasFiles && <StartGuide />}

      {/* template selector — explicit column mapping instead of auto-detect;
          set BEFORE dropping files, each file remembers the template it was
          added with (see FileItem.templateId) so a later selector change
          doesn't retroactively affect already-queued files. */}
      {!allDone && templates.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-[11px] uppercase tracking-[0.1em] text-[#9E9E9E]">Шаблон мапінгу</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            className="h-8 rounded-[3px] border border-[#E0E0E0] bg-white px-2 text-[12px] text-[#1f2733] outline-none focus:border-[#2f9488]">
            <option value="">Автовизначення (за замовчуванням)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.format.toUpperCase()}{t.column_count ? ` · ${t.column_count} кол.` : ""}</option>
            ))}
          </select>
        </div>
      )}

      {/* drop zone */}
      {!allDone && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-[4px] border-2 border-dashed text-center transition-colors ${
            drag
              ? "border-[#2f9488] bg-[#FAFAFA]"
              : hasFiles
                ? "border-[#E0E0E0] px-4 py-3 hover:border-[#BDBDBD]"
                : "border-[#E0E0E0] px-4 py-12 hover:border-[#BDBDBD]"
          }`}>
          {!hasFiles ? (
            <>
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10 text-[#BDBDBD]" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-3 text-[14px] text-[#3a4250]">Перетягніть файл або натисніть для вибору</p>
              <p className="mt-1 text-[12px] text-[#9E9E9E]">.csv · .xls · .xlsx — можна кинути кілька файлів одразу</p>
            </>
          ) : (
            <p className="text-[12px] text-[#9E9E9E]">+ Додати ще файли</p>
          )}
          <input ref={fileRef} type="file"
            accept=".csv,.xls,.xlsx"
            multiple className="sr-only"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); }} />
        </div>
      )}

      {/* file list */}
      {hasFiles && (
        <div className="mt-4 space-y-2">
          {files.map((item) => (
            <FileCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onExpand={() => setExpandedId((v) => v === item.id ? null : item.id)}
              onRemove={() => {
                setFiles((prev) => prev.filter((f) => f.id !== item.id));
                if (expandedId === item.id) setExpandedId(null);
              }}
              onApply={() => applyFile(item.id)}
              onRetry={() => (item.preview ? applyFile(item.id) : runPreview(item.id, item.file, item.templateId))}
              onProductCreated={() => { runPreview(item.id, item.file, item.templateId); loadCatalog(); }}
            />
          ))}
        </div>
      )}

      {/* history */}
      <div className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9E9E9E]">Історія імпортів</h2>
          {history.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: "", l: "Всі" },
                { v: "offers", l: "ОСТАТКИ" },
              ] as const).map((f) => (
                <button key={f.v} onClick={() => { setHistoryFilter(f.v); setHistoryOpenIdx(null); }}
                  className={`rounded-[3px] px-2.5 py-1 text-[11px] transition-colors ${
                    historyFilter === f.v ? "bg-[#2f9488] text-white" : "border border-[#E0E0E0] bg-white text-[#5a6472] hover:border-[#2f9488]"
                  }`}>{f.l}</button>
              ))}
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <p className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-6 text-center text-[12px] text-[#BDBDBD]">Ще не було жодного імпорту</p>
        ) : (() => {
          const rows = historyFilter ? history.filter((h) => h.kind === historyFilter) : history;
          if (rows.length === 0) return <p className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-6 text-center text-[12px] text-[#BDBDBD]">Немає записів для цього фільтра.</p>;

          // Summary strip — totals across the currently visible (filtered) history window.
          const totals = rows.reduce((a, h) => ({
            created: a.created + h.productsCreated, updated: a.updated + h.productsUpdated,
            movements: a.movements + h.stockMovements, unmatched: a.unmatched + h.unmatchedRows,
          }), { created: 0, updated: 0, movements: 0, unmatched: 0 });

          return (
            <>
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip label="Імпортів" value={rows.length} />
                <StatChip label="Товарів створено" value={totals.created} accent={totals.created ? "text-green-700" : undefined} />
                <StatChip label="Товарів оновлено" value={totals.updated} />
                <StatChip label="Рухів складу" value={totals.movements} />
              </div>

              <div className="divide-y divide-[#F5F5F5] rounded-[4px] border border-[#E0E0E0] bg-white">
                {rows.map((h, i) => {
                  const open = historyOpenIdx === i;
                  return (
                    <div key={i}>
                      <button onClick={() => setHistoryOpenIdx(open ? null : i)}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[12px] hover:bg-[#FAFAFA]">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${h.unmatchedRows > 0 && h.matchedRows === 0 ? "bg-red-400" : "bg-green-400"}`} />
                        <span className={`shrink-0 rounded-[3px] border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] ${KIND_COLOR[h.kind]}`}>{KIND_LABEL[h.kind]}</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-[#1f2733]">{h.filename}</span>
                        <span className="shrink-0 tabular-nums text-[#9E9E9E]">
                          {h.productsCreated > 0 && <>+{h.productsCreated} нових · </>}
                          {h.productsUpdated > 0 && <>{h.productsUpdated} оновлено · </>}
                          {h.stockMovements} рухів
                          {h.unmatchedRows > 0 && <span className="text-red-500"> · {h.unmatchedRows} не знайдено</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#BDBDBD]" title={dmy(h.at)}>{ago(h.at)}</span>
                        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-[#BDBDBD] transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.7">
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {open && (
                        <div className="border-t border-[#F5F5F5] bg-[#FAFAFA] px-4 py-3">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                            <StatChip label="Оброблено"     value={h.matchedRows}     accent="text-green-700" />
                            <StatChip label="Створено"      value={h.productsCreated} accent={h.productsCreated ? "text-green-700" : undefined} />
                            <StatChip label="Оновлено"      value={h.productsUpdated} />
                            <StatChip label="Розмірів"      value={h.variantsUpserted} />
                            <StatChip label="Рухів складу"  value={h.stockMovements} />
                            <StatChip label="Не знайдено"   value={h.unmatchedRows}   accent={h.unmatchedRows ? "text-red-600" : undefined} />
                          </div>
                          <p className="mt-2 text-[11px] text-[#9E9E9E]">{dmy(h.at)} · {h.filename}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
        <p className="mt-2 text-[11px] text-[#BDBDBD]">Зберігаються останні 20 імпортів. Повний журнал — у Моніторинг → журнал активності.</p>
      </div>
    </div>
  );
}
