"use client";

import { useRef, useState } from "react";

/* Mirrors lib/stockImport types (kept local to avoid importing server code). */
type ImportPreview = {
  kind: "offers" | "master" | "unknown";
  filename: string;
  totalRows: number; matchedRows: number; unmatchedRows: number;
  affectedProducts: number; newVariants: number; stockChanges: number; priceChanges: number;
  sample: { name: string; size?: string; detail: string }[];
  unmatchedSample: string[];
};
type ApplyResult = {
  kind: string; matchedRows: number; unmatchedRows: number;
  productsUpdated: number; variantsUpserted: number; stockMovements: number;
};

const KIND_LABEL: Record<string, string> = { offers: "Прайс / залишки (offers)", master: "База MG (master)", unknown: "Невідомий" };

export function ErpImport({ onBack }: { onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() { setFile(null); setPreview(null); setResult(null); setErr(""); }

  async function choose(f: File) {
    reset(); setFile(f); setBusy(true);
    const fd = new FormData(); fd.append("file", f); fd.append("mode", "preview");
    try {
      const r = await fetch("/api/erp/import", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok && d.preview) setPreview(d.preview);
      else setErr(d.error ?? "Не вдалося прочитати файл");
    } catch { setErr("Помилка мережі"); }
    setBusy(false);
  }

  async function apply() {
    if (!file || busy) return;
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file); fd.append("mode", "apply");
    try {
      const r = await fetch("/api/erp/import", { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok && d.result) setResult(d.result);
      else setErr(d.error ?? "Помилка застосування");
    } catch { setErr("Помилка мережі"); }
    setBusy(false);
  }

  const Stat = ({ label, value, accent }: { label: string; value: number | string; accent?: string }) => (
    <div className="rounded-[4px] border border-[#e2ddd5] bg-white px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">{label}</p>
      <p className={`mt-0.5 text-[18px] tabular-nums ${accent ?? "text-[#17130f]"}`}>{typeof value === "number" ? value.toLocaleString("uk-UA") : value}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1000px] p-6">
      <button onClick={onBack} className="mb-3 text-[12px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">‹ До товарів</button>
      <h1 className="text-[22px] font-light tracking-tight">Завантажити товари</h1>
      <p className="mt-1 text-[12px] text-[#9c8f7d]">
        Оновлення цін і залишків з файлу: <b>прайс/залишки</b> (Intertop CSV, по розмірах) або <b>база MG</b> (.xls).
        Спершу — попередній перегляд, зміни застосовуються лише після підтвердження.
      </p>

      {/* drop zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) choose(f); }}
          onClick={() => fileRef.current?.click()}
          className={`mt-4 cursor-pointer rounded-[4px] border-2 border-dashed px-4 py-10 text-center transition-colors ${drag ? "border-[#17130f] bg-[#faf8f5]" : "border-[#e0dacf] hover:border-[#b9ae9b]"}`}>
          <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-[#c8c0b4]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="mt-2 text-[13px] text-[#5c5347]">{file ? file.name : "Перетягніть файл або натисніть"}</p>
          <p className="mt-0.5 text-[11px] text-[#9c8f7d]">.csv · .xls · .xlsx</p>
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="sr-only"
            onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
        </div>
      )}

      {busy && !result && <p className="mt-4 text-center text-[12px] text-[#9c8f7d]">Обробка…</p>}
      {err && <p className="mt-4 rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</p>}

      {/* preview */}
      {preview && !result && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[3px] bg-[#17130f] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white">{KIND_LABEL[preview.kind]}</span>
            <span className="text-[12px] text-[#9c8f7d]">{preview.filename} · {preview.totalRows.toLocaleString("uk-UA")} рядків</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Знайдено" value={preview.matchedRows} accent="text-green-700" />
            <Stat label="Не знайдено" value={preview.unmatchedRows} accent={preview.unmatchedRows ? "text-red-600" : "text-[#17130f]"} />
            <Stat label="Товарів" value={preview.affectedProducts} />
            <Stat label="Нові розміри" value={preview.newVariants} />
            <Stat label="Зміни залишку" value={preview.stockChanges} />
            <Stat label="Зміни ціни" value={preview.priceChanges} />
          </div>

          {preview.matchedRows === 0 && (
            <p className="rounded-[4px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Жоден рядок не зіставлено з каталогом. Для прайсу Intertop спершу імпортуйте базу MG — вона заповнить «Заводський артикул», за яким матчиться прайс.
            </p>
          )}

          {preview.sample.length > 0 && (
            <div className="rounded-[4px] border border-[#e2ddd5] bg-white">
              <p className="border-b border-[#f0ece6] px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Приклад змін</p>
              <ul className="max-h-60 divide-y divide-[#f7f4f0] overflow-y-auto">
                {preview.sample.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-[#17130f]">{s.name}{s.size ? <span className="text-[#9c8f7d]"> · {s.size}</span> : null}</span>
                    <span className="shrink-0 tabular-nums text-[#5c5347]">{s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.unmatchedSample.length > 0 && (
            <p className="text-[11px] text-[#9c8f7d]">Не знайдені (приклад): {preview.unmatchedSample.join(" · ")}</p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-[#e2ddd5] pt-3">
            <button onClick={reset} className="h-9 rounded-[3px] border border-[#e2ddd5] px-4 text-[11px] uppercase tracking-[0.1em] text-[#5c5347] hover:border-[#17130f]">Інший файл</button>
            <button onClick={apply} disabled={busy || preview.matchedRows === 0}
              className="h-9 rounded-[3px] bg-[#17130f] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
              {busy ? "Застосування…" : `Застосувати (${preview.matchedRows.toLocaleString("uk-UA")})`}
            </button>
          </div>
        </div>
      )}

      {/* result */}
      {result && (
        <div className="mt-5 space-y-4">
          <p className="rounded-[4px] border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] text-green-800">✓ Імпорт застосовано</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Оброблено" value={result.matchedRows} accent="text-green-700" />
            <Stat label="Товарів оновлено" value={result.productsUpdated} />
            <Stat label="Розмірів" value={result.variantsUpserted} />
            <Stat label="Рухів складу" value={result.stockMovements} />
          </div>
          <div className="flex items-center justify-end gap-3">
            <button onClick={reset} className="h-9 rounded-[3px] border border-[#e2ddd5] px-4 text-[11px] uppercase tracking-[0.1em] text-[#5c5347] hover:border-[#17130f]">Ще файл</button>
            <button onClick={onBack} className="h-9 rounded-[3px] bg-[#17130f] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85">До товарів</button>
          </div>
        </div>
      )}
    </div>
  );
}
