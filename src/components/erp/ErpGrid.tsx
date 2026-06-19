"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evalFormula, type NamedTables } from "@/lib/formulaEngine";

/* ── types ─────────────────────────────────────────────────────────────── */
type GVariant = { id: number; size: string; qty: number; active: boolean };
type GProduct = {
  id: number; name: string; brand: string; sku: string;
  price: number; cost_price: number | null; status: string;
  variants: GVariant[];
};
type GData = { products: GProduct[]; sizes: string[]; brands: string[]; total: number };
type Snapshot = { id: number; label: string; created_at: string; item_count: number };

/* ── helpers ─────────────────────────────────────────────────────────────── */
function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
function cellKey(productId: number, size: string, variantId: number | null) {
  return variantId ? `v${variantId}` : `p${productId}|${size}`;
}

const PER_PAGE = 100;
const STICKY_COL_W = [80, 220, 72, 72]; // brand, name, price, cost
const STICKY_LEFT = STICKY_COL_W.reduce<number[]>((acc, w, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + STICKY_COL_W[i - 1]);
  return acc;
}, []);
const STICKY_TOTAL = STICKY_COL_W.reduce((a, b) => a + b, 0);

const STATUS_DOT: Record<string, string> = {
  publish: "bg-green-500", draft: "bg-[#ccc]",
  moderation: "bg-amber-400", inactive: "bg-red-400",
};

/* ═══════════════════════════════════════════════════════════════════════════
   ErpGrid — the main component
═══════════════════════════════════════════════════════════════════════════ */
export function ErpGrid() {
  const [data, setData] = useState<GData | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");

  // localQty: cellKey → modified qty (only cells that differ from DB)
  const [localQty, setLocalQty] = useState<Map<string, number>>(new Map());
  // undo: one entry per completed cell edit (committed on blur, not per-keystroke)
  const [undoStack, setUndoStack] = useState<
    { key: string; from: number; to: number; original: number }[]
  >([]);
  // value at focus-start, so blur can compute "what changed in this edit session"
  const preFocusVal = useRef<Map<string, number>>(new Map());

  // formula: key → formula string (cells with "=" prefix)
  const [formulaMap, setFormulaMap] = useState<Map<string, string>>(new Map());
  // which cell is actively being formula-edited (shows raw formula in input)
  const [formulaEditKey, setFormulaEditKey] = useState<string | null>(null);
  // named tables for VLOOKUP cross-table references
  const [namedTables, setNamedTables] = useState<NamedTables>({});
  // active cell info for formula bar display
  const [activeCell, setActiveCell] = useState<{ key: string; label: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  // For keyboard navigation: track (rowIdx, colIdx) of focused cell
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  /* ── load named tables once ── */
  useEffect(() => {
    fetch("/api/erp/grid/tables").then((r) => r.json()).then(setNamedTables).catch(() => {});
  }, []);

  /* ── load grid data ── */
  const load = useCallback(async (pg: number) => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(pg), perPage: String(PER_PAGE) });
    if (search) sp.set("q", search);
    if (brand) sp.set("brand", brand);
    if (status) sp.set("status", status);
    try {
      const r = await fetch(`/api/erp/grid?${sp}`);
      const d: GData = await r.json();
      setData(d);
      setLocalQty(new Map());
      setFormulaMap(new Map());
      setUndoStack([]);
      cellRefs.current.clear();
    } finally {
      setLoading(false);
    }
  }, [search, brand, status]);

  useEffect(() => { load(page); }, [page, load]);

  /* ── keyMeta: reverse map from cellKey → {variantId, productId, size} ── */
  const keyMeta = useMemo(() => {
    const m = new Map<string, { variantId: number | null; productId: number; size: string; originalQty: number }>();
    for (const p of data?.products ?? []) {
      const variantSizes = new Set<string>();
      for (const v of p.variants) {
        const k = cellKey(p.id, v.size, v.id);
        m.set(k, { variantId: v.id, productId: p.id, size: v.size, originalQty: v.qty });
        variantSizes.add(v.size);
      }
      // Cells for sizes with no existing variant
      for (const size of data?.sizes ?? []) {
        if (!variantSizes.has(size)) {
          const k = cellKey(p.id, size, null);
          m.set(k, { variantId: null, productId: p.id, size, originalQty: 0 });
        }
      }
    }
    return m;
  }, [data]);

  /* ── Ctrl+Z undo ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        setUndoStack((prev) => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          setLocalQty((lq) => {
            const next = new Map(lq);
            if (last.from === last.original) {
              next.delete(last.key);
            } else {
              next.set(last.key, last.from);
            }
            return next;
          });
          return prev.slice(0, -1);
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── cell edit: onChange updates display only, onBlur commits to undo stack ── */
  const onCellChange = useCallback((key: string, rawVal: string) => {
    const meta = keyMeta.get(key);
    if (!meta) return;

    if (rawVal.startsWith("=")) {
      // Formula mode — store formula, show raw text while editing
      setFormulaMap((fm) => { const n = new Map(fm); n.set(key, rawVal.slice(1)); return n; });
      setFormulaEditKey(key);
      return;
    }

    // Clear formula if user deletes "=" prefix
    setFormulaMap((fm) => { const n = new Map(fm); n.delete(key); return n; });
    const newQty = Math.max(0, parseInt(rawVal, 10) || 0);
    setLocalQty((lq) => {
      const next = new Map(lq);
      if (newQty === meta.originalQty) next.delete(key);
      else next.set(key, newQty);
      return next;
    });
  }, [keyMeta]);

  /* ── helper: evaluate formula for a cell ── */
  const runFormula = useCallback((formula: string, product: GProduct, sizes: string[]): number => {
    try {
      const sizeQty: Record<string, number> = {};
      for (const v of product.variants) sizeQty[v.size] = v.qty;
      // Overlay local edits from same row
      for (const sz of sizes) {
        const v = product.variants.find((x) => x.size === sz);
        const k = cellKey(product.id, sz, v?.id ?? null);
        if (localQty.has(k)) sizeQty[sz] = localQty.get(k)!;
      }
      return evalFormula(formula, {
        sizeQty, price: product.price, cost: product.cost_price,
        sku: product.sku, brand: product.brand, allSizes: sizes,
      }, namedTables);
    } catch {
      return 0;
    }
  }, [namedTables, localQty]);

  const onCellFocus = useCallback((key: string, displayQty: number, label: string) => {
    preFocusVal.current.set(key, displayQty);
    setActiveCell({ key, label });
    // If it's a formula cell, enter formula edit mode
    if (formulaMap.has(key)) setFormulaEditKey(key);
  }, [formulaMap]);

  const onCellBlur = useCallback((key: string, product: GProduct, sizes: string[]) => {
    setFormulaEditKey(null);
    setActiveCell(null);
    const meta = keyMeta.get(key);
    if (!meta) return;

    setLocalQty((lq) => {
      // Re-evaluate formula if present
      const formula = formulaMap.get(key);
      const currentLq = new Map(lq);
      if (formula) {
        const result = Math.max(0, Math.round(runFormula(formula, product, sizes)));
        currentLq.set(key, result);
      }

      const before = preFocusVal.current.get(key) ?? meta.originalQty;
      preFocusVal.current.delete(key);
      const after = currentLq.get(key) ?? meta.originalQty;
      if (before !== after) {
        setUndoStack((prev) => [...prev, { key, from: before, to: after, original: meta.originalQty }]);
      }
      return currentLq;
    });
  }, [keyMeta, formulaMap, runFormula]);

  /* ── keyboard navigation ── */
  function onCellKey(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number, colIdx: number, colCount: number,
  ) {
    let targetRow = rowIdx, targetCol = colIdx;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) targetCol = colIdx - 1;
        else { targetRow = rowIdx - 1; targetCol = colCount - 1; }
      } else {
        if (colIdx < colCount - 1) targetCol = colIdx + 1;
        else { targetRow = rowIdx + 1; targetCol = 0; }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      targetRow = rowIdx + 1;
    } else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      e.preventDefault(); targetCol = colIdx + 1;
    } else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      e.preventDefault(); targetCol = Math.max(0, colIdx - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); targetRow = rowIdx + 1;
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); targetRow = rowIdx - 1;
    } else return;

    targetRow = Math.max(0, Math.min(targetRow, (data?.products.length ?? 1) - 1));
    targetCol = Math.max(0, Math.min(targetCol, colCount - 1));
    const target = cellRefs.current.get(`${targetRow}:${targetCol}`);
    target?.focus();
    target?.select();
  }

  /* ── save ── */
  async function save() {
    const changes = [...localQty.entries()].map(([key, qty]) => {
      const m = keyMeta.get(key)!;
      return { variantId: m.variantId, productId: m.productId, size: m.size, qty };
    });
    if (!changes.length) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const label = `Таблиця — ${changes.length} змін, ${new Date().toLocaleString("uk-UA")}`;
      const r = await fetch("/api/erp/grid/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, label }),
      });
      const res = await r.json();
      if (res.ok) {
        setSaveMsg(`✓ Збережено ${res.applied} змін (знімок #${res.snapshotId})`);
        await load(page);
      } else {
        setSaveMsg("Помилка: " + (res.error ?? "невідома"));
      }
    } finally {
      setSaving(false);
    }
  }

  /* ── export to XLSX ── */
  async function exportXlsx() {
    const sp = new URLSearchParams({ perPage: "9999" });
    if (search) sp.set("q", search);
    if (brand) sp.set("brand", brand);
    if (status) sp.set("status", status);
    const r = await fetch(`/api/erp/grid/export?${sp}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mania_grid_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── discard local changes ── */
  function discard() {
    setLocalQty(new Map());
    setFormulaMap(new Map());
    setUndoStack([]);
    setSaveMsg("");
  }

  /* ── load snapshots ── */
  async function loadSnapshots() {
    const r = await fetch("/api/erp/grid/snapshots");
    setSnapshots(await r.json());
  }

  /* ── rollback ── */
  async function rollback(snapshotId: number) {
    setRollingBack(snapshotId);
    try {
      const r = await fetch("/api/erp/grid/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const res = await r.json();
      if (res.ok) {
        setSaveMsg(`✓ Відкат знімку #${snapshotId}: відновлено ${res.restored} варіантів`);
        setShowSnapshots(false);
        await load(page);
      }
    } finally {
      setRollingBack(null);
    }
  }

  const changeCount = localQty.size + formulaMap.size;
  const sizes = data?.sizes ?? [];
  const products = data?.products ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / PER_PAGE);

  /* ─── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E0E0E0] bg-white px-4 py-2.5">
        <h1 className="text-[15px] font-light tracking-tight text-[#212121]">Таблиця залишків</h1>
        <div className="mx-2 h-4 w-px bg-[#E0E0E0]" />

        {/* Search */}
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchInput); }}
          className="flex items-center gap-1">
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Пошук…"
            className="h-8 rounded-[3px] border border-[#E0E0E0] px-2.5 text-[12px] focus:border-[#007B6E] focus:outline-none w-36" />
          <button type="submit"
            className="h-8 rounded-[3px] border border-[#E0E0E0] bg-[#F5F5F5] px-2.5 text-[11px] hover:border-[#007B6E]">
            →
          </button>
          {search && (
            <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              className="text-[11px] text-[#9E9E9E] hover:text-[#007B6E]">✕</button>
          )}
        </form>

        {/* Brand filter */}
        <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}
          className="h-8 rounded-[3px] border border-[#E0E0E0] px-2 text-[12px] focus:border-[#007B6E] focus:outline-none bg-white">
          <option value="">Всі бренди</option>
          {data?.brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Status filter */}
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-8 rounded-[3px] border border-[#E0E0E0] px-2 text-[12px] focus:border-[#007B6E] focus:outline-none bg-white">
          <option value="">Всі статуси</option>
          <option value="publish">Активні</option>
          <option value="draft">Чернетки</option>
          <option value="inactive">Деактивовані</option>
        </select>

        <div className="flex-1" />

        {/* Hint */}
        <span className="text-[11px] text-[#9E9E9E]">Tab/Enter — навігація · Ctrl+Z — відмінити</span>

        {/* Export */}
        <button onClick={exportXlsx}
          className="h-8 rounded-[3px] border border-[#E0E0E0] px-3 text-[12px] text-[#9E9E9E] hover:border-[#007B6E] hover:text-[#007B6E]">
          ↓ XLSX
        </button>

        {/* Snapshots */}
        <button onClick={async () => { await loadSnapshots(); setShowSnapshots(true); }}
          className="h-8 rounded-[3px] border border-[#E0E0E0] px-3 text-[12px] text-[#9E9E9E] hover:border-[#007B6E] hover:text-[#007B6E]">
          Знімки
        </button>

        {/* Discard */}
        {changeCount > 0 && (
          <button onClick={discard}
            className="h-8 rounded-[3px] border border-[#E0E0E0] px-3 text-[12px] text-[#9E9E9E] hover:border-[#007B6E]">
            Скасувати ({changeCount})
          </button>
        )}

        {/* Save */}
        <button onClick={save} disabled={changeCount === 0 || saving}
          className={`h-8 rounded-[3px] px-4 text-[12px] font-medium transition-colors
            ${changeCount > 0
              ? "bg-[#007B6E] text-white hover:bg-[#006B5E]"
              : "bg-[#F5F5F5] text-[#9E9E9E] cursor-default"}`}>
          {saving ? "Збереження…" : changeCount > 0 ? `Зберегти (${changeCount})` : "Зберегти"}
        </button>
      </div>

      {/* Save message */}
      {saveMsg && (
        <div className={`px-4 py-2 text-[12px] border-b border-[#E0E0E0] ${saveMsg.startsWith("✓")
          ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {saveMsg}
          <button onClick={() => setSaveMsg("")} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Formula bar ── */}
      <div className="flex items-center gap-2 border-b border-[#E0E0E0] bg-[#FAFAFA] px-3 py-1.5 text-[12px]">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-[#9E9E9E] w-6">fx</span>
        <span className="text-[#9E9E9E] text-[11px] min-w-[120px] shrink-0">
          {activeCell?.label ?? "—"}
        </span>
        <input
          readOnly={!activeCell}
          value={
            activeCell
              ? formulaMap.has(activeCell.key)
                ? "=" + formulaMap.get(activeCell.key)
                : String(localQty.get(activeCell.key) ?? "")
              : ""
          }
          onChange={(e) => {
            if (!activeCell) return;
            onCellChange(activeCell.key, e.target.value);
            const refEntry = [...cellRefs.current.entries()].find(
              ([, el]) => el.dataset.cellkey === activeCell.key
            );
            if (refEntry) refEntry[1].value = e.target.value;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && activeCell) {
              const refEntry = [...cellRefs.current.entries()].find(
                ([, el]) => el.dataset.cellkey === activeCell.key
              );
              refEntry?.[1].blur();
            }
          }}
          placeholder="Введіть значення або =ФОРМУЛА(…)"
          className="flex-1 bg-transparent text-[12px] text-[#212121] focus:outline-none placeholder:text-[#ccc]"
        />
        {activeCell && formulaMap.has(activeCell.key) && (
          <span className="shrink-0 rounded-[3px] bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
            fx · {localQty.has(activeCell.key) ? `= ${localQty.get(activeCell.key)}` : "…"}
          </span>
        )}
        <div className="ml-2 shrink-0 text-[10px] text-[#BDBDBD]">
          SUM · IF · VLOOKUP/ВПР · MARGIN · MARKUP · PERCENT · таблиці: RECEIPTS ORDERS SUPPLIERS PRODUCTS
        </div>
      </div>

      {/* ── Table ── */}
      {loading && !data && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#9E9E9E]">
          Завантаження…
        </div>
      )}

      {data && (
        <div className="relative flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-[12px]">
            {/* ── HEAD ── */}
            <thead>
              <tr>
                {/* Sticky fixed cols */}
                {(["Бренд", "Назва", "Ціна", "Собів."] as const).map((h, ci) => (
                  <th key={h}
                    style={{ position: "sticky", top: 0, left: STICKY_LEFT[ci], zIndex: 30, width: STICKY_COL_W[ci], minWidth: STICKY_COL_W[ci] }}
                    className="border-b border-r border-[#E0E0E0] bg-[#F5F5F5] px-2 py-2 text-left text-[10px] uppercase tracking-[0.08em] text-[#9E9E9E] whitespace-nowrap">
                    {h}
                  </th>
                ))}
                {/* Size cols */}
                {sizes.map((sz) => (
                  <th key={sz}
                    style={{ position: "sticky", top: 0, zIndex: 20, minWidth: 52, width: 52 }}
                    className="border-b border-r border-[#E0E0E0] bg-[#F5F5F5] px-1 py-2 text-center text-[10px] uppercase tracking-[0.06em] text-[#9E9E9E] whitespace-nowrap">
                    {sz}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── BODY ── */}
            <tbody>
              {products.map((p, rowIdx) => {
                const variantBySz = new Map(p.variants.map((v) => [v.size, v]));
                return (
                  <tr key={p.id} className="group">
                    {/* Brand */}
                    <td style={{ position: "sticky", left: STICKY_LEFT[0], zIndex: 10, width: STICKY_COL_W[0] }}
                      className="border-b border-r border-[#F5F5F5] bg-white group-hover:bg-[#FAFAFA] px-2 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status] ?? "bg-[#ccc]"}`} />
                        <span className="truncate text-[11px] text-[#616161] max-w-[60px]" title={p.brand}>{p.brand}</span>
                      </div>
                    </td>

                    {/* Name */}
                    <td style={{ position: "sticky", left: STICKY_LEFT[1], zIndex: 10, width: STICKY_COL_W[1] }}
                      className="border-b border-r border-[#F5F5F5] bg-white group-hover:bg-[#FAFAFA] px-2 py-1.5">
                      <span className="block truncate text-[#212121]" title={p.name}>{p.name}</span>
                      {p.sku && <span className="text-[10px] text-[#BDBDBD]">{p.sku}</span>}
                    </td>

                    {/* Price */}
                    <td style={{ position: "sticky", left: STICKY_LEFT[2], zIndex: 10, width: STICKY_COL_W[2] }}
                      className="border-b border-r border-[#F5F5F5] bg-white group-hover:bg-[#FAFAFA] px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-[#212121]">
                      {uah(p.price)}
                    </td>

                    {/* Cost */}
                    <td style={{ position: "sticky", left: STICKY_LEFT[3], zIndex: 10, width: STICKY_COL_W[3] }}
                      className="border-b border-r border-[#F5F5F5] bg-white group-hover:bg-[#FAFAFA] px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-[#9E9E9E]">
                      {p.cost_price ? uah(p.cost_price) : "—"}
                    </td>

                    {/* Size cells */}
                    {sizes.map((sz, colIdx) => {
                      const variant = variantBySz.get(sz);
                      const key = cellKey(p.id, sz, variant?.id ?? null);
                      const hasFormula = formulaMap.has(key);
                      const isEditing = formulaEditKey === key;
                      const currentQty = localQty.has(key)
                        ? localQty.get(key)!
                        : hasFormula
                          ? Math.max(0, Math.round(runFormula(formulaMap.get(key)!, p, sizes)))
                          : (variant?.qty ?? 0);
                      const isChanged = localQty.has(key) || hasFormula;
                      const isEmpty = !variant && !hasFormula;
                      const cellLabel = `${p.brand} · ${p.name} · ${sz}`;

                      return (
                        <td key={sz}
                          style={{ minWidth: 52, width: 52 }}
                          className={`border-b border-r border-[#F5F5F5] p-0
                            ${hasFormula ? "bg-blue-50" : isChanged ? "bg-amber-50" : isEmpty ? "bg-[#FAFAFA]" : "bg-white"}`}>
                          <input
                            ref={(el) => {
                              const refKey = `${rowIdx}:${colIdx}`;
                              if (el) cellRefs.current.set(refKey, el);
                              else cellRefs.current.delete(refKey);
                            }}
                            data-cellkey={key}
                            type={isEditing ? "text" : "number"}
                            min={0}
                            value={
                              isEditing
                                ? "=" + (formulaMap.get(key) ?? "")
                                : isEmpty && !isChanged ? "" : currentQty
                            }
                            placeholder={isEmpty ? "—" : undefined}
                            onFocus={(e) => {
                              if (!isEditing) e.target.select();
                              onCellFocus(key, currentQty, cellLabel);
                            }}
                            onChange={(e) => onCellChange(key, e.target.value)}
                            onBlur={() => onCellBlur(key, p, sizes)}
                            onKeyDown={(e) => {
                              if (isEditing && (e.key === "Tab" || e.key === "Enter")) {
                                e.currentTarget.blur();
                              }
                              onCellKey(e, rowIdx, colIdx, sizes.length);
                            }}
                            className={`h-[30px] w-full border-none bg-transparent px-1 text-center text-[12px]
                              tabular-nums focus:outline-none focus:ring-1 focus:ring-inset
                              ${hasFormula
                                ? "text-blue-700 font-medium focus:ring-blue-400/40"
                                : isChanged
                                  ? "text-amber-800 font-medium focus:ring-[#212121]/30"
                                  : isEmpty
                                    ? "text-[#ccc] focus:ring-[#212121]/30"
                                    : "text-[#212121] focus:ring-[#212121]/30"}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {products.length === 0 && !loading && (
            <div className="py-16 text-center text-[12px] text-[#9E9E9E]">Товарів не знайдено</div>
          )}
        </div>
      )}

      {/* ── Footer: pagination + stats ── */}
      {data && (
        <div className="flex items-center justify-between border-t border-[#E0E0E0] bg-white px-4 py-2">
          <span className="text-[11px] text-[#9E9E9E]">
            {data.total.toLocaleString("uk-UA")} товарів · {sizes.length} розмірів
            {changeCount > 0 && <span className="ml-2 text-amber-700 font-medium">{changeCount} змін (не збережено)</span>}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="h-7 w-7 rounded-[3px] border border-[#E0E0E0] text-[12px] disabled:opacity-40 hover:border-[#007B6E]">
                ‹
              </button>
              <span className="px-3 text-[12px] text-[#212121]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="h-7 w-7 rounded-[3px] border border-[#E0E0E0] text-[12px] disabled:opacity-40 hover:border-[#007B6E]">
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Snapshots panel ── */}
      {showSnapshots && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[6px] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E0E0E0] px-5 py-3.5">
              <h2 className="text-[14px] font-medium text-[#212121]">Знімки для відкату</h2>
              <button onClick={() => setShowSnapshots(false)} className="text-[#9E9E9E] hover:text-[#007B6E]">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {snapshots.length === 0 && (
                <p className="px-5 py-8 text-center text-[12px] text-[#9E9E9E]">Знімків ще немає</p>
              )}
              {snapshots.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border-b border-[#F5F5F5] px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#212121] truncate">{s.label}</p>
                    <p className="text-[11px] text-[#9E9E9E]">
                      {new Date(s.created_at).toLocaleString("uk-UA")} · {s.item_count} варіантів
                    </p>
                  </div>
                  <button onClick={() => rollback(s.id)} disabled={rollingBack !== null}
                    className="shrink-0 rounded-[3px] border border-[#E0E0E0] px-3 py-1.5 text-[11px] text-[#212121] hover:border-[#007B6E] disabled:opacity-50">
                    {rollingBack === s.id ? "Відкат…" : "Відкотити"}
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 text-[11px] text-[#9E9E9E] border-t border-[#E0E0E0]">
              Відкат відновлює залишки до стану <b>перед</b> збереженням знімку.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
