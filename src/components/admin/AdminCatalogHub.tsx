"use client";

import { useEffect, useRef, useState } from "react";

// ── types ────────────────────────────────────────────────────────────────────

type OverviewData = {
  summary: {
    total: number; in_stock: number; out_stock: number;
    with_photo: number; no_photo: number; avg_price: number; stock_value: number;
  };
  brands: { brand: string; total: number; in_stock: number; out_stock: number; with_photo: number; avg_price: number; stock_value: number }[];
  categories: { category: string; total: number; in_stock: number; with_photo: number; avg_price: number }[];
  priceDist: { bucket: string; cnt: number }[];
  lowStock: { brand: string; cnt: number }[];
  meta: Record<string, string>;
};

type DiffCounts = {
  total: number; new_products: number; price_up: number; price_down: number;
  now_in_stock: number; now_out: number; unchanged: number; db_total: number;
};
type DiffItem = {
  sku: string; name: string; brand: string;
  change: "new" | "price_up" | "price_down" | "now_in_stock" | "now_out" | "unchanged";
  db_price?: number; xls_price?: number; db_in_stock?: boolean; xls_in_stock: boolean;
};

// ── helpers ──────────────────────────────────────────────────────────────────

const UAH = (n: number) => n.toLocaleString("uk-UA") + " ₴";
const N   = (n: number) => n.toLocaleString("uk-UA");

function fmtBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
function detectSlot(name: string): "mg" | "wp" | null {
  const u = name.toUpperCase();
  if (/\bMG\b|MG[._-]/.test(u) || u.startsWith("MG")) return "mg";
  if (/\bWP\b|WP[._-]/.test(u)) return "wp";
  return null;
}

const CHANGE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  new:          { label: "Новий",        bg: "bg-emerald-100", text: "text-emerald-800" },
  price_up:     { label: "Ціна ↑",      bg: "bg-amber-100",   text: "text-amber-800"   },
  price_down:   { label: "Ціна ↓",      bg: "bg-blue-100",    text: "text-blue-800"    },
  now_in_stock: { label: "З'явився",    bg: "bg-emerald-50",  text: "text-emerald-700" },
  now_out:      { label: "Зник",        bg: "bg-red-100",     text: "text-red-800"     },
  unchanged:    { label: "Без змін",    bg: "bg-[#f0ece5]",   text: "text-[#9c8f7d]"  },
};

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-[4px] border p-4 ${accent ? "border-[#17130f] bg-[#17130f]" : "border-[#e8e4de] bg-white"}`}>
      <p className={`text-[10px] uppercase tracking-[0.14em] ${accent ? "text-white/60" : "text-[#9c8f7d]"}`}>{label}</p>
      <p className={`mt-1.5 text-[22px] font-semibold tabular-nums ${accent ? "text-white" : "text-[#17130f]"}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-[11px] ${accent ? "text-white/50" : "text-[#b9ae9b]"}`}>{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, color = "bg-[#17130f]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-[#f0ece5]">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-[#9c8f7d]">{pct}%</span>
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandSort, setBrandSort] = useState<"stock_value" | "in_stock" | "brand">("stock_value");
  const [showAllBrands, setShowAllBrands] = useState(false);

  useEffect(() => {
    fetch("/api/admin/catalog")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#e8e4de] border-t-[#17130f]" />
    </div>
  );
  if (!data) return <p className="p-6 text-[13px] text-red-600">Помилка завантаження</p>;

  const s = data.summary;
  const maxBrandValue = Math.max(...data.brands.map((b) => b.stock_value), 1);
  const maxPriceCnt   = Math.max(...data.priceDist.map((p) => p.cnt), 1);
  const lastSync = data.meta.last_sync ? new Date(data.meta.last_sync).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  const sortedBrands = [...data.brands].sort((a, b) => {
    if (brandSort === "brand") return a.brand.localeCompare(b.brand, "uk");
    return b[brandSort] - a[brandSort];
  });
  const visibleBrands = showAllBrands ? sortedBrands : sortedBrands.slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-[3px] border border-[#e8e4de] bg-[#faf8f5] px-4 py-2.5">
        <p className="text-[11px] text-[#9c8f7d]">
          Останній імпорт: <span className="text-[#17130f]">{lastSync}</span>
          {data.meta.source === "xls" && <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] text-emerald-700">XLS</span>}
        </p>
        <p className="text-[11px] text-[#9c8f7d]">
          Статус БД: <span className="font-medium text-[#17130f]">{data.meta.sync_status === "idle" ? "✓ Готово" : data.meta.sync_status ?? "—"}</span>
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-7 gap-3">
        <KpiCard label="Усього товарів"    value={N(s.total)}       />
        <KpiCard label="В наявності"       value={N(s.in_stock)}    sub={`${Math.round(s.in_stock/s.total*100)}% від усіх`} accent />
        <KpiCard label="Немає в наявн."   value={N(s.out_stock)}   sub={`${Math.round(s.out_stock/s.total*100)}%`} />
        <KpiCard label="З фото"            value={N(s.with_photo)}  sub={`${Math.round(s.with_photo/s.total*100)}%`} />
        <KpiCard label="Без фото"          value={N(s.no_photo)}    />
        <KpiCard label="Середня ціна"      value={UAH(s.avg_price)} sub="тільки в наявн." />
        <KpiCard label="Вартість складу"   value={(s.stock_value / 1_000_000).toFixed(1) + " млн ₴"} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Brand table */}
        <div className="col-span-2 rounded-[4px] border border-[#e8e4de] bg-white">
          <div className="flex items-center justify-between border-b border-[#f0ece5] px-5 py-3.5">
            <h3 className="text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Бренди</h3>
            <div className="flex gap-1.5">
              {(["stock_value", "in_stock", "brand"] as const).map((s) => (
                <button key={s}
                  onClick={() => setBrandSort(s)}
                  className={`rounded-[2px] px-2 py-0.5 text-[9px] uppercase tracking-wider transition-colors ${brandSort === s ? "bg-[#17130f] text-white" : "text-[#9c8f7d] hover:text-[#17130f]"}`}
                >
                  {s === "stock_value" ? "За вартістю" : s === "in_stock" ? "За наявн." : "А–Я"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#f7f4f0] text-[9px] uppercase tracking-wider text-[#b9ae9b]">
                  <th className="py-2 pl-5 pr-3 text-left">Бренд</th>
                  <th className="py-2 pr-3 text-right">В наявн.</th>
                  <th className="py-2 pr-3 text-right">Архів</th>
                  <th className="py-2 pr-3 text-right">З фото</th>
                  <th className="py-2 pr-3 text-right">Сер. ціна</th>
                  <th className="py-2 pr-5 text-right">Вартість</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f7f4f0]">
                {visibleBrands.map((b) => (
                  <tr key={b.brand} className="group hover:bg-[#faf8f5]">
                    <td className="py-2 pl-5 pr-3 font-medium text-[#17130f]">{b.brand}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{N(b.in_stock)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#b9ae9b]">{N(b.out_stock)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{N(b.with_photo)}</span>
                        <MiniBar value={b.with_photo} max={b.in_stock} color="bg-blue-400" />
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{b.avg_price > 0 ? UAH(b.avg_price) : "—"}</td>
                    <td className="py-2 pr-5 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-medium">{b.stock_value > 0 ? UAH(b.stock_value) : "—"}</span>
                        <MiniBar value={b.stock_value} max={maxBrandValue} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.brands.length > 12 && (
            <div className="border-t border-[#f0ece5] px-5 py-3">
              <button onClick={() => setShowAllBrands((v) => !v)} className="text-[11px] text-[#9c8f7d] hover:text-[#17130f]">
                {showAllBrands ? "Згорнути" : `Показати всі ${data.brands.length} брендів`}
              </button>
            </div>
          )}
        </div>

        {/* Right column: price dist + low stock + categories */}
        <div className="space-y-5">
          {/* Price distribution */}
          <div className="rounded-[4px] border border-[#e8e4de] bg-white p-5">
            <h3 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Розподіл цін (в наявності)</h3>
            <div className="space-y-3">
              {data.priceDist.map((p) => (
                <div key={p.bucket}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-[#17130f]">{p.bucket} ₴</span>
                    <span className="tabular-nums text-[#9c8f7d]">{N(p.cnt)}</span>
                  </div>
                  <MiniBar value={p.cnt} max={maxPriceCnt} />
                </div>
              ))}
            </div>
          </div>

          {/* Low stock alerts */}
          {data.lowStock.length > 0 && (
            <div className="rounded-[4px] border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-amber-800">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Мало залишків
              </h3>
              <div className="space-y-1.5">
                {data.lowStock.map((b) => (
                  <div key={b.brand} className="flex justify-between text-[12px]">
                    <span className="text-amber-900">{b.brand}</span>
                    <span className="tabular-nums font-medium text-amber-800">{b.cnt} шт.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top categories */}
          <div className="rounded-[4px] border border-[#e8e4de] bg-white p-5">
            <h3 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Топ категорій</h3>
            <div className="space-y-2.5">
              {data.categories.slice(0, 8).map((c) => (
                <div key={c.category}>
                  <div className="mb-0.5 flex justify-between text-[11px]">
                    <span className="truncate text-[#17130f]" title={c.category}>{c.category}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-[#9c8f7d]">{N(c.in_stock)}</span>
                  </div>
                  <MiniBar value={c.in_stock} max={data.categories[0]?.in_stock ?? 1} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Diff tab ──────────────────────────────────────────────────────────────────

const IMPORT_STEPS = ["Файли", "MG.xls", "WP.xls", "Фото", "База даних", "Готово"];
function msgToStep(msg: string): number | null {
  if (/Парсинг MG|MG:/i.test(msg)) return 1;
  if (/Парсинг WP|WP:/i.test(msg)) return 2;
  if (/Store API|Завантаження фото/i.test(msg)) return 3;
  if (/Запис у БД/i.test(msg)) return 4;
  return null;
}
function fmtBytes2(n: number) { return n < 1024*1024 ? `${Math.round(n/1024)} КБ` : `${(n/1024/1024).toFixed(1)} МБ`; }

type SyncMeta = { last_sync?: string; source?: string; total_products?: number; history?: ImportHistoryEntry[] };
type ImportHistoryEntry = { at: string; mg: string; wp: string; inStock: number; archived: number; total: number; withImages: number; categories: number };
type CatalogImportResult = { inStock: number; archived: number; total: number; withImages: number; categories: number; ms?: number };

function ImportTab() {
  const [mg, setMg] = useState<File | null>(null);
  const [wp, setWp] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<CatalogImportResult | null>(null);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const loadMeta = () => fetch("/api/admin/sync").then((r) => r.json()).then(setMeta).catch(() => {});
  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [progress]);

  function assign(files: FileList | File[]) {
    let curMg = mg, curWp = wp;
    for (const f of Array.from(files)) {
      if (!/\.xlsx?$/i.test(f.name)) continue;
      const slot = detectSlot(f.name);
      if (slot === "mg") curMg = f;
      else if (slot === "wp") curWp = f;
      else if (!curMg) curMg = f;
      else curWp = f;
    }
    setMg(curMg); setWp(curWp);
  }

  async function run() {
    if (!mg || !wp) return;
    setStatus("importing"); setProgress([]); setError(""); setResult(null); setStep(0);
    const fd = new FormData();
    fd.append("mg", mg); fd.append("wp", wp);
    try {
      const res = await fetch("/api/admin/import-catalog", { method: "POST", body: fd });
      if (!res.body) { setStatus("error"); setError("Немає відповіді від сервера"); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "progress") {
              setProgress((p) => [...p, d.message]);
              const s = msgToStep(d.message);
              if (s !== null) setStep((prev) => Math.max(prev, s));
            } else if (d.type === "done") {
              setStatus("done"); setResult(d); setStep(5); loadMeta();
            } else if (d.type === "error") {
              setStatus("error"); setError(d.message);
            }
          } catch {}
        }
      }
    } catch { setStatus("error"); setError("Не вдалося з'єднатися"); }
  }

  const fileSlot = (label: string, file: File | null, onSet: (f: File | null) => void, hint: string) => (
    <div className={`flex-1 rounded-[4px] border-2 p-4 transition-all ${file ? "border-emerald-400 bg-emerald-50/40" : "border-dashed border-[#ddd7ce] hover:border-[#b9ae9b]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#9c8f7d]">{label}</span>
          {file ? (
            <div className="mt-1.5">
              <p className="truncate text-[13px] font-medium text-[#17130f]">{file.name}</p>
              <p className="text-[11px] text-[#9c8f7d]">{fmtBytes2(file.size)}</p>
            </div>
          ) : (
            <label className="mt-1.5 flex cursor-pointer items-center gap-1 text-[12px] text-[#9c8f7d] underline-offset-2 hover:underline hover:text-[#17130f]">
              {hint}
              <input type="file" accept=".xls,.xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSet(f); }} />
            </label>
          )}
        </div>
        {file && (
          <button onClick={() => onSet(null)} className="text-[#b9ae9b] hover:text-red-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>
    </div>
  );

  const isRunning = status === "importing";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-[4px] border border-[#e8e4de] bg-white p-6">
        <h2 className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Імпорт каталогу з XLS</h2>
        <p className="mb-6 text-[12px] text-[#b9ae9b]">Завантажте MG.xls і WP.xls — файли визначаються автоматично за назвою. Процес займає ~1 хвилину.</p>

        {/* Steps */}
        <div className="mb-6 flex items-center">
          {IMPORT_STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold transition-all ${
                  i < step ? "bg-emerald-500 text-white" :
                  i === step && isRunning ? "animate-pulse bg-[#17130f] text-white" :
                  status === "done" && i === 5 ? "bg-emerald-500 text-white" :
                  "bg-[#f0ece5] text-[#b9ae9b]"
                }`}>
                  {(i < step || (status === "done" && i <= 5)) ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
                </div>
                <span className={`text-[9px] whitespace-nowrap ${i <= step ? "text-[#17130f]" : "text-[#c8c0b4]"}`}>{s}</span>
              </div>
              {i < IMPORT_STEPS.length - 1 && <div className={`mx-1 mb-4 h-px w-8 ${i < step ? "bg-emerald-400" : "bg-[#e8e4de]"}`} />}
            </div>
          ))}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); assign(e.dataTransfer.files); }}
          className={`mb-4 rounded-[4px] border-2 border-dashed px-4 py-5 text-center transition-all ${dragOver ? "border-[#17130f] bg-[#f7f5f2]" : "border-[#e0dacf] hover:border-[#b9ae9b]"}`}
        >
          <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-[#c8c0b4]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="mt-2 text-[13px] text-[#17130f]">Перетягніть MG.xls і WP.xls сюди</p>
          <label className="mt-1 inline-block cursor-pointer text-[12px] text-[#9c8f7d] underline-offset-2 hover:underline hover:text-[#17130f]">
            або оберіть файли
            <input type="file" accept=".xls,.xlsx" multiple className="sr-only" onChange={(e) => e.target.files && assign(e.target.files)} />
          </label>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          {fileSlot("MG — повний перелік", mg, setMg, "обрати MG.xls")}
          {fileSlot("WP — поточні залишки", wp, setWp, "обрати WP.xls")}
        </div>

        <button onClick={run} disabled={!mg || !wp || isRunning}
          className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-[#17130f] px-8 text-[11px] uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-35">
          {isRunning ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Імпортується…</> : "Запустити імпорт"}
        </button>

        {isRunning && progress.length > 0 && (
          <div ref={logRef} className="mt-4 max-h-44 overflow-y-auto rounded-[3px] bg-[#17130f] px-4 py-3 font-mono text-[11px] leading-relaxed">
            {progress.map((msg, i) => <p key={i} className="text-emerald-400"><span className="mr-2 text-emerald-700">›</span>{msg}</p>)}
            <p className="animate-pulse text-emerald-700">_</p>
          </div>
        )}
        {status === "error" && (
          <div className="mt-4 flex items-start gap-3 rounded-[3px] border border-red-200 bg-red-50 px-4 py-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-4 w-4 shrink-0 text-red-500"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" /></svg>
            <p className="text-[12px] text-red-700">{error}</p>
          </div>
        )}
        {status === "done" && result && (
          <div className="mt-4 space-y-3">
            <p className="text-[12px] font-medium text-emerald-700">✓ Імпорт завершено {result.ms ? `· ${(result.ms / 1000).toFixed(1)} с` : ""}</p>
            <div className="grid grid-cols-5 gap-2">
              {[
                { l: "В наявн.", v: result.inStock, c: "text-emerald-700" },
                { l: "Архів",   v: result.archived, c: "text-[#9c8f7d]" },
                { l: "Усього",  v: result.total,    c: "text-[#17130f]" },
                { l: "З фото",  v: result.withImages, c: "text-[#17130f]" },
                { l: "Категорій", v: result.categories, c: "text-[#17130f]" },
              ].map((s) => (
                <div key={s.l} className="rounded-[3px] border border-[#eae5dd] bg-[#faf8f5] p-3 text-center">
                  <p className={`text-[18px] font-semibold tabular-nums ${s.c}`}>{N(s.v)}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[#b9ae9b]">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {meta?.history && meta.history.length > 0 && (
        <div className="rounded-[4px] border border-[#e8e4de] bg-white p-6">
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Журнал імпортів</h2>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[9px] uppercase tracking-wider text-[#b9ae9b]">
                <th className="py-2 pr-4 text-left">Дата</th>
                <th className="py-2 pr-4 text-left">Файли</th>
                <th className="py-2 pr-4 text-right">В наявн.</th>
                <th className="py-2 pr-4 text-right">Архів</th>
                <th className="py-2 pr-4 text-right">З фото</th>
                <th className="py-2 text-right">Усього</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {meta.history.map((h, i) => (
                <tr key={i} className="hover:bg-[#faf8f5]">
                  <td className="py-2.5 pr-4 tabular-nums text-[#17130f]">{new Date(h.at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="max-w-[180px] truncate py-2.5 pr-4 text-[#9c8f7d]">{h.mg} · {h.wp}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-700">{N(h.inStock)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-[#9c8f7d]">{N(h.archived)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{N(h.withImages)}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums">{N(h.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── XLS Diff tab ─────────────────────────────────────────────────────────────

type DiffFilter = "all" | "new" | "price_up" | "price_down" | "now_in_stock" | "now_out";

function DiffTab() {
  const [mg, setMg] = useState<File | null>(null);
  const [wp, setWp] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ counts: DiffCounts; items: DiffItem[]; mgCount: number; wpCount: number } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<DiffFilter>("all");
  const [dragOver, setDragOver] = useState(false);

  function assign(files: FileList | File[]) {
    let curMg = mg, curWp = wp;
    for (const f of Array.from(files)) {
      if (!/\.xlsx?$/i.test(f.name)) continue;
      const slot = detectSlot(f.name);
      if (slot === "mg") curMg = f;
      else if (slot === "wp") curWp = f;
      else if (!curMg) curMg = f;
      else curWp = f;
    }
    setMg(curMg); setWp(curWp);
  }

  async function analyze() {
    if (!mg || !wp) return;
    setLoading(true); setError(""); setResult(null);
    const fd = new FormData();
    fd.append("mg", mg); fd.append("wp", wp);
    try {
      const res = await fetch("/api/admin/catalog/diff", { method: "POST", body: fd });
      const d = await res.json();
      if (res.ok) setResult(d);
      else setError(d.error ?? "Помилка аналізу");
    } catch { setError("Помилка мережі"); }
    setLoading(false);
  }

  const filtered = result ? (filter === "all" ? result.items.filter((i) => i.change !== "unchanged") : result.items.filter((i) => i.change === filter)) : [];

  const fileSlot2 = (label: string, file: File | null, onSet: (f: File | null) => void, hint: string) => (
    <div className={`flex-1 rounded-[4px] border-2 p-3 transition-all ${file ? "border-emerald-400 bg-emerald-50/40" : "border-dashed border-[#ddd7ce] hover:border-[#b9ae9b]"}`}>
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#9c8f7d]">{label}</span>
      {file ? (
        <div className="mt-1 flex items-center justify-between">
          <div>
            <p className="truncate text-[12px] font-medium text-[#17130f]">{file.name}</p>
            <p className="text-[10px] text-[#9c8f7d]">{fmtBytes(file.size)}</p>
          </div>
          <button onClick={() => onSet(null)} className="text-[#b9ae9b] hover:text-red-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
      ) : (
        <label className="mt-1 flex cursor-pointer items-center text-[11px] text-[#9c8f7d] underline-offset-2 hover:underline hover:text-[#17130f]">
          {hint}
          <input type="file" accept=".xls,.xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSet(f); }} />
        </label>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl space-y-5">
      {/* Upload panel */}
      <div className="rounded-[4px] border border-[#e8e4de] bg-white p-5">
        <h2 className="mb-1 text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Аналіз XLS vs База даних</h2>
        <p className="mb-4 text-[12px] text-[#b9ae9b]">Завантажте нові файли, щоб побачити що зміниться ПЕРЕД імпортом. Дані в базі не змінюються.</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); assign(e.dataTransfer.files); }}
          className={`mb-3 rounded-[4px] border-2 border-dashed px-4 py-4 text-center transition-all ${dragOver ? "border-[#17130f] bg-[#f7f5f2]" : "border-[#e0dacf] hover:border-[#b9ae9b]"}`}
        >
          <p className="text-[12px] text-[#9c8f7d]">Перетягніть MG.xls та WP.xls</p>
          <label className="mt-0.5 inline-block cursor-pointer text-[11px] text-[#b9ae9b] underline-offset-2 hover:underline hover:text-[#9c8f7d]">
            або оберіть
            <input type="file" accept=".xls,.xlsx" multiple className="sr-only" onChange={(e) => e.target.files && assign(e.target.files)} />
          </label>
        </div>

        <div className="mb-4 flex gap-3">
          {fileSlot2("MG — повний перелік", mg, setMg, "MG.xls")}
          {fileSlot2("WP — залишки", wp, setWp, "WP.xls")}
        </div>

        <button onClick={analyze} disabled={!mg || !wp || loading}
          className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-[#17130f] px-6 text-[11px] uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 disabled:opacity-35">
          {loading ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Аналізуємо…</> : "Проаналізувати зміни"}
        </button>
        {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Counts row */}
          <div className="grid grid-cols-7 gap-2">
            {[
              { k: "all",          l: "Всі зміни",    v: result.counts.total - result.counts.unchanged, bg: "bg-[#17130f] text-white" },
              { k: "new",          l: "Нові товари",  v: result.counts.new_products,  bg: "bg-emerald-100 text-emerald-900" },
              { k: "price_up",     l: "Ціна вгору",   v: result.counts.price_up,      bg: "bg-amber-100 text-amber-900" },
              { k: "price_down",   l: "Ціна вниз",    v: result.counts.price_down,    bg: "bg-blue-100 text-blue-900" },
              { k: "now_in_stock", l: "З'явились",    v: result.counts.now_in_stock,  bg: "bg-emerald-50 text-emerald-800" },
              { k: "now_out",      l: "Зникли",       v: result.counts.now_out,       bg: "bg-red-100 text-red-900" },
              { k: "unchanged2",   l: "Без змін",     v: result.counts.unchanged,     bg: "bg-[#f5f1ea] text-[#9c8f7d]" },
            ].map((s) => (
              <button key={s.k}
                onClick={() => s.k !== "unchanged2" && setFilter(s.k as DiffFilter)}
                className={`rounded-[4px] border p-3 text-center transition-all ${
                  filter === s.k || (s.k === "all" && filter === "all") ? "border-[#17130f] ring-1 ring-[#17130f]" : "border-transparent"
                } ${s.bg}`}>
                <p className="text-[16px] font-semibold tabular-nums">{N(s.v)}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-wider opacity-70">{s.l}</p>
              </button>
            ))}
          </div>

          {/* Stats: XLS vs DB */}
          <div className="flex gap-4 text-[11px] text-[#9c8f7d]">
            <span>MG.xls: <b className="text-[#17130f]">{N(result.mgCount)}</b> рядків</span>
            <span>WP.xls: <b className="text-[#17130f]">{N(result.wpCount)}</b> рядків</span>
            <span>Поточна БД: <b className="text-[#17130f]">{N(result.counts.db_total)}</b> товарів</span>
          </div>

          {/* Table of changes */}
          {filtered.length > 0 && (
            <div className="overflow-hidden rounded-[4px] border border-[#e8e4de]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12px]">
                  <thead>
                    <tr className="border-b border-[#f0ece5] bg-[#faf8f5] text-[9px] uppercase tracking-wider text-[#9c8f7d]">
                      <th className="py-2.5 pl-4 pr-3 text-left">Артикул</th>
                      <th className="py-2.5 pr-3 text-left">Назва</th>
                      <th className="py-2.5 pr-3 text-left">Бренд</th>
                      <th className="py-2.5 pr-3 text-right">Ціна в БД</th>
                      <th className="py-2.5 pr-3 text-right">Ціна в XLS</th>
                      <th className="py-2.5 pr-3 text-right">Наявн. в БД</th>
                      <th className="py-2.5 pr-4 text-center">Зміна</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f7f4f0]">
                    {filtered.slice(0, 200).map((item, i) => {
                      const cl = CHANGE_LABELS[item.change] ?? CHANGE_LABELS.unchanged;
                      return (
                        <tr key={i} className="hover:bg-[#faf8f5]">
                          <td className="py-2 pl-4 pr-3 font-mono text-[11px] text-[#9c8f7d]">{item.sku}</td>
                          <td className="max-w-[200px] truncate py-2 pr-3 text-[#17130f]" title={item.name}>{item.name}</td>
                          <td className="py-2 pr-3 text-[#9c8f7d]">{item.brand}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{item.db_price != null ? UAH(item.db_price) : "—"}</td>
                          <td className={`py-2 pr-3 text-right tabular-nums font-medium ${item.change === "price_up" ? "text-amber-700" : item.change === "price_down" ? "text-blue-700" : ""}`}>
                            {item.xls_price != null && item.xls_price > 0 ? UAH(item.xls_price) : "—"}
                          </td>
                          <td className="py-2 pr-3 text-center text-[11px]">{item.db_in_stock == null ? "—" : item.db_in_stock ? "✓" : "✗"}</td>
                          <td className="py-2 pr-4 text-center">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${cl.bg} ${cl.text}`}>{cl.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > 200 && (
                <div className="border-t border-[#f0ece5] px-4 py-2.5 text-[11px] text-[#9c8f7d]">
                  Показано 200 з {N(filtered.length)} записів
                </div>
              )}
            </div>
          )}
          {filtered.length === 0 && filter !== "all" && (
            <div className="rounded-[4px] border border-[#e8e4de] bg-[#faf8f5] px-4 py-8 text-center text-[12px] text-[#9c8f7d]">
              Немає записів для цього фільтру
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

type HubTab = "overview" | "import" | "diff";

const HUB_TABS: { id: HubTab; label: string; icon: string }[] = [
  {
    id: "overview",
    label: "Огляд каталогу",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    id: "import",
    label: "Імпорт XLS",
    icon: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V4m0 0L8 8m4-4l4 4",
  },
  {
    id: "diff",
    label: "Аналіз змін",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
];

export function AdminCatalogHub() {
  const [tab, setTab] = useState<HubTab>("overview");

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-[4px] border border-[#e8e4de] bg-white p-1">
        {HUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[3px] px-4 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              tab === t.id ? "bg-[#17130f] text-white" : "text-[#9c8f7d] hover:text-[#17130f]"
            }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
              <path d={t.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "overview" && <OverviewTab />}
      {tab === "import"   && <ImportTab  />}
      {tab === "diff"     && <DiffTab    />}
    </div>
  );
}
