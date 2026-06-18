"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── types (mirrors server types, no server imports) ─────────────────────── */
type PreviewItem = {
  name: string; sku?: string; size?: string;
  oldQty: number | null; newQty: number | null;
  oldPrice: number | null; newPrice: number | null; discountPrice: number | null;
  isNew: boolean;
};
type UnmatchedItem = { key: string; size?: string };
type ImportPreview = {
  kind: "offers" | "master" | "unknown";
  filename: string; totalRows: number;
  matchedRows: number; unmatchedRows: number;
  affectedProducts: number; newVariants: number; stockChanges: number; priceChanges: number;
  items: PreviewItem[];
  unmatched: UnmatchedItem[];
  aiUsed?: boolean;
};
type ApplyResult = {
  kind: string; matchedRows: number; unmatchedRows: number;
  productsUpdated: number; variantsUpserted: number; stockMovements: number;
};
type HistoryEntry = { filename: string; movements: string; started_at: string };
type FileStatus = "idle" | "previewing" | "ready" | "error" | "applying" | "done";
type FileItem = {
  id: string; file: File; status: FileStatus;
  preview: ImportPreview | null; result: ApplyResult | null; error: string;
};

/* ── constants ────────────────────────────────────────────────────────────── */
const KIND_LABEL: Record<string, string> = {
  offers: "Прайс / залишки (Intertop CSV)",
  master: "База MG (.xls)",
  unknown: "Невідомий",
};
const KIND_COLOR: Record<string, string> = {
  offers: "bg-blue-50 text-blue-700 border-blue-200",
  master: "bg-amber-50 text-amber-700 border-amber-200",
  unknown: "bg-red-50 text-red-600 border-red-200",
};

/* ── helpers ──────────────────────────────────────────────────────────────── */
function uah(n: number) { return Math.round(n).toLocaleString("uk-UA") + " ₴"; }
function dmy(s: string) {
  return new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function uid() { return Math.random().toString(36).slice(2, 10); }

/** Master files should be applied before offers files. */
function sortedByPriority(items: FileItem[]): FileItem[] {
  return [...items].sort((a, b) => {
    const pa = a.preview?.kind === "master" ? 0 : 1;
    const pb = b.preview?.kind === "master" ? 0 : 1;
    return pa - pb;
  });
}

/* ── StatChip ─────────────────────────────────────────────────────────────── */
function StatChip({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-[4px] border border-[#e2ddd5] bg-white px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-[#9c8f7d]">{label}</p>
      <p className={`mt-0.5 text-[16px] tabular-nums font-medium ${accent ?? "text-[#17130f]"}`}>
        {typeof value === "number" ? value.toLocaleString("uk-UA") : value}
      </p>
    </div>
  );
}

/* ── DiffTable ────────────────────────────────────────────────────────────── */
type DiffFilter = "all" | "changed" | "new" | "same";

function DiffTable({ preview }: { preview: ImportPreview }) {
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
                ? "bg-[#17130f] text-white"
                : "border border-[#e2ddd5] bg-white text-[#5c5347] hover:border-[#17130f]"
            }`}>
            {f.l} <span className={`${filter === f.v ? "opacity-70" : "text-[#b9ae9b]"}`}>{f.n}</span>
          </button>
        ))}
        {preview.items.length >= 120 && (
          <span className="ml-auto text-[11px] text-[#9c8f7d]">Показано перші 120 з {preview.matchedRows}</span>
        )}
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-[4px] border border-[#e2ddd5]">
        <table className="w-full min-w-[600px] text-[12px]">
          <thead>
            <tr className="border-b border-[#f0ece6] bg-[#faf8f5] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
              <th className="px-3 py-2 text-left">Товар</th>
              {isOffers && <th className="w-16 px-3 py-2 text-center">Розмір</th>}
              <th className="w-28 px-3 py-2 text-center">Залишок</th>
              <th className="w-36 px-3 py-2 text-center">Ціна</th>
              {isOffers && <th className="w-28 px-3 py-2 text-center">Акційна</th>}
              <th className="w-24 px-3 py-2 text-center">Стан</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f7f4f0]">
            {items.slice(0, 150).map((it, i) => {
              const qtyChanged   = it.newQty   != null && it.newQty   !== it.oldQty;
              const priceChanged = it.newPrice != null && Math.abs((it.newPrice || 0) - (it.oldPrice || 0)) > 1;
              return (
                <tr key={i} className={`${it.isNew ? "bg-green-50/50" : (qtyChanged || priceChanged) ? "bg-amber-50/30" : ""} hover:bg-[#fafaf8]`}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-[#17130f]">{it.name}</span>
                    {it.sku && <span className="ml-2 text-[10px] text-[#c8c0b4]">#{it.sku}</span>}
                  </td>
                  {isOffers && <td className="px-3 py-2 text-center font-medium text-[#5c5347]">{it.size || "—"}</td>}

                  {/* qty */}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {it.newQty == null ? (
                      <span className="text-[#b9ae9b]">—</span>
                    ) : it.isNew ? (
                      <span className="font-medium text-green-700">→ {it.newQty}</span>
                    ) : qtyChanged ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[#b9ae9b] line-through">{it.oldQty ?? 0}</span>
                        <span className="text-[#c2a878]">→</span>
                        <span className={`font-medium ${(it.newQty ?? 0) > (it.oldQty ?? 0) ? "text-green-700" : "text-red-600"}`}>{it.newQty}</span>
                      </span>
                    ) : (
                      <span className="text-[#5c5347]">{it.newQty}</span>
                    )}
                  </td>

                  {/* price */}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {it.newPrice == null ? (
                      <span className="text-[#b9ae9b]">{it.oldPrice ? uah(it.oldPrice) : "—"}</span>
                    ) : priceChanged ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-[10px] text-[#b9ae9b] line-through">{it.oldPrice ? uah(it.oldPrice) : "—"}</span>
                        <span className="text-[#c2a878]">→</span>
                        <span className="font-medium text-[#17130f]">{uah(it.newPrice)}</span>
                      </span>
                    ) : (
                      <span className="text-[#5c5347]">{uah(it.newPrice)}</span>
                    )}
                  </td>

                  {isOffers && (
                    <td className="px-3 py-2 text-center tabular-nums text-[#9c8f7d]">
                      {it.discountPrice ? uah(it.discountPrice) : "—"}
                    </td>
                  )}

                  {/* badge */}
                  <td className="px-3 py-2 text-center">
                    {it.isNew ? (
                      <span className="rounded-[3px] bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">новий</span>
                    ) : qtyChanged && priceChanged ? (
                      <span className="rounded-[3px] bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">зал+ціна</span>
                    ) : qtyChanged ? (
                      <span className="rounded-[3px] bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">залишок</span>
                    ) : priceChanged ? (
                      <span className="rounded-[3px] bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">ціна</span>
                    ) : (
                      <span className="text-[10px] text-[#c8c0b4]">без змін</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-[12px] text-[#9c8f7d]">Немає рядків для цього фільтра</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* unmatched */}
      {preview.unmatched.length > 0 && (
        <div className="rounded-[4px] border border-amber-200 bg-amber-50">
          <button onClick={() => setShowUnmatched((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-[12px] text-amber-800">
            <span>⚠ Не знайдено в каталозі: <b>{preview.unmatchedRows}</b></span>
            <span className="text-[11px]">{showUnmatched ? "▲" : "▼ показати"}</span>
          </button>
          {showUnmatched && (
            <ul className="space-y-0.5 border-t border-amber-200 px-4 py-2 text-[11px] text-amber-700">
              {preview.unmatched.map((u, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-mono font-medium">{u.key}</span>
                  {u.size && <span className="text-amber-500">· {u.size}</span>}
                </li>
              ))}
              {preview.unmatchedRows > preview.unmatched.length && (
                <li className="text-amber-400">…і ще {preview.unmatchedRows - preview.unmatched.length}</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ── FileCard ─────────────────────────────────────────────────────────────── */
function FileCard({
  item, expanded, onExpand, onRemove, onApply,
}: {
  item: FileItem; expanded: boolean;
  onExpand: () => void; onRemove: () => void; onApply: () => void;
}) {
  const kind = item.preview?.kind ?? "unknown";
  const showPreview = item.preview && (item.status === "ready" || item.status === "done" || item.status === "applying");

  return (
    <div className={`rounded-[4px] border bg-white transition-shadow ${expanded ? "border-[#17130f] shadow-sm" : "border-[#e2ddd5]"}`}>
      {/* header row */}
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3 select-none" onClick={onExpand}>
        {/* status dot */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${
          item.status === "done"       ? "bg-green-500" :
          item.status === "error"      ? "bg-red-500" :
          item.status === "ready"      ? "bg-amber-400" :
          item.status === "previewing" || item.status === "applying" ? "bg-blue-400 animate-pulse" :
          "bg-[#ddd]"
        }`} />

        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#17130f]">{item.file.name}</span>

        {item.preview && (
          <span className={`shrink-0 rounded-[3px] border px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] ${KIND_COLOR[kind]}`}>
            {KIND_LABEL[kind]}
          </span>
        )}
        {item.preview?.aiUsed && (
          <span className="shrink-0 rounded-[3px] border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">🤖 ШІ</span>
        )}
        {item.status === "ready" && item.preview && (
          <span className="shrink-0 text-[11px] text-[#9c8f7d]">
            {item.preview.matchedRows.toLocaleString("uk-UA")} зн. · {item.preview.stockChanges} зм.
          </span>
        )}
        {item.status === "done" && (
          <span className="shrink-0 text-[11px] text-green-700">✓ застосовано</span>
        )}
        {item.status === "error" && (
          <span className="shrink-0 text-[11px] text-red-600">помилка</span>
        )}
        {item.status === "previewing" && (
          <span className="shrink-0 text-[11px] text-[#9c8f7d] animate-pulse">аналіз…</span>
        )}
        {item.status === "applying" && (
          <span className="shrink-0 text-[11px] text-blue-600 animate-pulse">застосування…</span>
        )}

        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          className={`h-4 w-4 shrink-0 text-[#9c8f7d] transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 text-[#c8c0b4] hover:text-red-500" title="Видалити файл">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* expanded body */}
      {expanded && (
        <div className="border-t border-[#f0ece6] px-4 py-4 space-y-4">
          {item.status === "error" && (
            <p className="rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{item.error}</p>
          )}

          {showPreview && item.preview && (
            <>
              {/* stats */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <StatChip label="Знайдено"     value={item.preview.matchedRows}   accent="text-green-700" />
                <StatChip label="Не знайдено"  value={item.preview.unmatchedRows} accent={item.preview.unmatchedRows ? "text-red-600" : undefined} />
                <StatChip label="Товарів"      value={item.preview.affectedProducts} />
                <StatChip label="Нові розміри" value={item.preview.newVariants} />
                <StatChip label="Зміни залишку" value={item.preview.stockChanges} />
                <StatChip label="Зміни ціни"   value={item.preview.priceChanges} />
              </div>

              {item.preview.matchedRows === 0 && (
                <p className="rounded-[4px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  Жоден рядок не зіставлено з каталогом. Для прайсу Intertop спершу завантажте базу MG (вона заповнює «Заводський артикул»).
                </p>
              )}

              {item.status !== "done" && <DiffTable preview={item.preview} />}

              {item.status === "ready" && (
                <div className="flex justify-end border-t border-[#e2ddd5] pt-3">
                  <button onClick={onApply} disabled={item.preview.matchedRows === 0}
                    className="h-9 rounded-[3px] bg-[#17130f] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
                    Застосувати ({item.preview.matchedRows.toLocaleString("uk-UA")})
                  </button>
                </div>
              )}
            </>
          )}

          {item.result && (
            <div className="space-y-3">
              <p className="rounded-[4px] border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] text-green-800">✓ Імпорт застосовано успішно</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip label="Оброблено"        value={item.result.matchedRows}     accent="text-green-700" />
                <StatChip label="Товарів оновлено" value={item.result.productsUpdated} />
                <StatChip label="Розмірів"         value={item.result.variantsUpserted} />
                <StatChip label="Рухів складу"     value={item.result.stockMovements} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */

export function ErpImport({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [applyingAll, setApplyingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/erp/import")
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  }, []);

  const runPreview = useCallback((id: string, file: File) => {
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "previewing" } : f));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "preview");
    fetch("/api/erp/import", { method: "POST", body: fd })
      .then((r) => r.json())
      .then((d) => {
        if (d.preview) {
          setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "ready", preview: d.preview as ImportPreview } : f));
          setExpandedId(id);
        } else {
          setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: d.error ?? "Помилка читання" } : f));
        }
      })
      .catch(() => {
        setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: "Помилка мережі" } : f));
      });
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const toAdd: FileItem[] = Array.from(fileList).map((file) => ({
      id: uid(), file, status: "idle" as FileStatus,
      preview: null, result: null, error: "",
    }));
    setFiles((prev) => [...prev, ...toAdd]);
    for (const item of toAdd) runPreview(item.id, item.file);
  }, [runPreview]);

  const applyFile = useCallback(async (id: string): Promise<void> => {
    let file: File | null = null;
    setFiles((prev) => {
      const it = prev.find((f) => f.id === id);
      file = it?.file ?? null;
      return prev.map((f) => f.id === id ? { ...f, status: "applying" } : f);
    });
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "apply");
    try {
      const r = await fetch("/api/erp/import", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok && d.result) {
        setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "done", result: d.result as ApplyResult } : f));
        fetch("/api/erp/import").then((r) => r.json()).then((d) => setHistory(d.history ?? [])).catch(() => {});
      } else {
        setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: d.error ?? "Помилка застосування" } : f));
      }
    } catch {
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, status: "error", error: "Помилка мережі" } : f));
    }
  }, []);

  const applyAll = useCallback(async () => {
    setApplyingAll(true);
    const sorted = sortedByPriority(
      files.filter((f) => f.status === "ready" && (f.preview?.matchedRows ?? 0) > 0)
    );
    for (const item of sorted) await applyFile(item.id);
    setApplyingAll(false);
  }, [files, applyFile]);

  const readyCount = files.filter((f) => f.status === "ready" && (f.preview?.matchedRows ?? 0) > 0).length;
  const hasFiles   = files.length > 0;
  const allDone    = hasFiles && files.every((f) => f.status === "done" || f.status === "error");
  const kinds      = files.filter((f) => f.preview).map((f) => f.preview!.kind);
  const hasBoth    = kinds.includes("master") && kinds.includes("offers");

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button onClick={onBack}
            className="mb-1.5 text-[12px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">
            ‹ До товарів
          </button>
          <h1 className="text-[22px] font-light tracking-tight">Завантажити товари</h1>
          <p className="mt-0.5 text-[12px] text-[#9c8f7d]">
            База MG (.xls) та/або прайс Intertop (.csv) — перетягніть один або кілька файлів одразу.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasBoth && (
            <span className="rounded-[3px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
              ⟳ МG спочатку, потім прайс
            </span>
          )}
          {readyCount > 1 && (
            <button onClick={applyAll} disabled={applyingAll}
              className="h-9 rounded-[3px] bg-[#17130f] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-50">
              {applyingAll ? "Застосування…" : `Застосувати всі (${readyCount})`}
            </button>
          )}
          {hasFiles && (
            <button onClick={() => { setFiles([]); setExpandedId(null); }}
              className="h-9 rounded-[3px] border border-[#e2ddd5] px-3 text-[11px] text-[#5c5347] hover:border-[#17130f]">
              {allDone ? "Нові файли" : "Очистити"}
            </button>
          )}
        </div>
      </div>

      {/* drop zone */}
      {!allDone && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-[4px] border-2 border-dashed text-center transition-colors ${
            drag
              ? "border-[#17130f] bg-[#faf8f5]"
              : hasFiles
                ? "border-[#e0dacf] px-4 py-3 hover:border-[#b9ae9b]"
                : "border-[#e0dacf] px-4 py-12 hover:border-[#b9ae9b]"
          }`}>
          {!hasFiles ? (
            <>
              <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10 text-[#c8c0b4]" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="mt-3 text-[14px] text-[#5c5347]">Перетягніть файли або натисніть для вибору</p>
              <p className="mt-1 text-[12px] text-[#9c8f7d]">.csv · .xls · .xlsx — можна кинути кілька файлів одразу</p>
              <div className="mt-3 flex items-center justify-center gap-3 text-[11px]">
                <span className="rounded-[3px] border border-amber-200 bg-amber-50 px-2 py-1 text-amber-600">База MG (.xls)</span>
                <span className="text-[#c8c0b4]">+</span>
                <span className="rounded-[3px] border border-blue-200 bg-blue-50 px-2 py-1 text-blue-600">Прайс Intertop (.csv)</span>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-[#9c8f7d]">+ Додати ще файли</p>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" multiple className="sr-only"
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
            />
          ))}
        </div>
      )}

      {/* history */}
      <div className="mt-8">
        <h2 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Останні завантаження</h2>
        {history.length === 0 ? (
          <p className="text-[12px] text-[#b9ae9b]">Ще не було жодного імпорту</p>
        ) : (
          <div className="divide-y divide-[#f7f4f0] rounded-[4px] border border-[#e2ddd5] bg-white">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-[12px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                <span className="min-w-0 flex-1 truncate font-medium text-[#17130f]">{h.filename}</span>
                <span className="shrink-0 tabular-nums text-[#9c8f7d]">{Number(h.movements).toLocaleString("uk-UA")} рухів</span>
                <span className="shrink-0 text-[11px] text-[#b9ae9b]">{dmy(h.started_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
