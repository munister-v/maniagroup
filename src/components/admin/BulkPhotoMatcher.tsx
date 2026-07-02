"use client";

import { useState } from "react";

/**
 * "Auto" answer to products with no photos (e.g. freshly created by an MG.xls
 * import, which never carries images): drop a whole folder of files named by
 * supplier code — 90101.jpg, 90101-1.jpg, DEMO-PALTO-01_2.png — and every file
 * gets attached to the right product automatically, no per-product manual
 * upload needed. See /api/admin/products/photos/bulk-match for the matching
 * logic (longest known sku/factory_article that prefixes the filename).
 */

type MatchResult = {
  matched: { filename: string; productId: number; productName: string }[];
  unmatched: string[];
  failed: string[];
};

export function BulkPhotoMatcher({ onClose, onToast }: { onClose: () => void; onToast?: (m: string) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<MatchResult | null>(null);

  function addFiles(list: FileList | File[]) {
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imgs]);
  }

  async function run() {
    if (files.length === 0) return;
    setStatus("running");
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    try {
      const res = await fetch("/api/admin/products/photos/bulk-match", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setResult(data as MatchResult);
        setStatus("done");
        onToast?.(`Прив'язано: ${data.matched.length} фото до товарів`);
      } else {
        onToast?.(data.error ?? "Помилка обробки");
        setStatus("idle");
      }
    } catch {
      onToast?.("Помилка мережі");
      setStatus("idle");
    }
  }

  const byProduct = new Map<string, { filename: string }[]>();
  if (result) {
    for (const m of result.matched) {
      const key = `${m.productId}:${m.productName}`;
      const arr = byProduct.get(key) ?? [];
      arr.push({ filename: m.filename });
      byProduct.set(key, arr);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[6px] border border-[#e8e4de] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-[#17130f]">Масове завантаження фото</h3>
            <p className="mt-0.5 text-[12px] text-[#9c8f7d]">Назвіть файли кодом товару — система сама знайде відповідний товар</p>
          </div>
          <button onClick={onClose} className="text-[#9c8f7d] hover:text-[#17130f]" aria-label="Закрити">✕</button>
        </div>

        {status !== "done" && (
          <>
            <div className="mb-3 rounded-[4px] border border-[#e8e4de] bg-[#faf8f5] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#6b6253]">
              <b className="text-[#17130f]">Як назвати файли:</b> артикул або SKU товару на початку назви —
              <code className="mx-1 rounded bg-white px-1 py-0.5 text-[11px]">90101.jpg</code>,
              <code className="mx-1 rounded bg-white px-1 py-0.5 text-[11px]">90101-1.jpg</code>,
              <code className="mx-1 rounded bg-white px-1 py-0.5 text-[11px]">DEMO-PALTO-01_2.png</code> — кілька фото одного товару впорядкуються за номером у кінці назви.
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              onClick={() => document.getElementById("bulk-photo-input")?.click()}
              className={`flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[4px] border-2 border-dashed text-center transition-colors ${
                dragOver ? "border-[#107C41] bg-[#f0faf4]" : "border-[#e8e4de] hover:border-[#c9bdab]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#9c8f7d]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="text-[13px] text-[#424242]">Перетягніть фото сюди або натисніть</p>
              <input id="bulk-photo-input" type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); }} />
            </div>

            {files.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d]">Обрано файлів: {files.length}</p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-[4px] border border-[#e8e4de] bg-white p-2 text-[11px] text-[#6b6253]">
                  {files.map((f, i) => <div key={i} className="truncate">{f.name}</div>)}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-[4px] border border-[#e8e4de] px-4 py-2 text-[12px] text-[#6b6253] hover:border-[#17130f]">Скасувати</button>
              <button onClick={run} disabled={files.length === 0 || status === "running"}
                className="rounded-[4px] bg-[#17130f] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">
                {status === "running" ? "Обробка…" : `Завантажити й прив'язати (${files.length})`}
              </button>
            </div>
          </>
        )}

        {status === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
              ✓ Прив'язано <b>{result.matched.length}</b> фото до <b>{byProduct.size}</b> товарів
            </div>

            {byProduct.size > 0 && (
              <div className="rounded-[4px] border border-[#e8e4de] bg-white">
                <div className="divide-y divide-[#F5F5F5]">
                  {Array.from(byProduct.entries()).map(([key, items]) => {
                    const [, name] = key.split(":");
                    return (
                      <div key={key} className="px-4 py-2 text-[12px]">
                        <span className="font-medium text-[#17130f]">{name}</span>
                        <span className="ml-2 text-[#9c8f7d]">{items.length} фото</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {result.unmatched.length > 0 && (
              <div className="rounded-[4px] border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="mb-1.5 text-[12px] text-amber-800">⚠ Не знайдено товар для {result.unmatched.length} файлів:</p>
                <ul className="space-y-0.5 text-[11px] text-amber-700">
                  {result.unmatched.slice(0, 15).map((f, i) => <li key={i} className="font-mono">{f}</li>)}
                  {result.unmatched.length > 15 && <li className="text-amber-400">…і ще {result.unmatched.length - 15}</li>}
                </ul>
              </div>
            )}

            {result.failed.length > 0 && (
              <div className="rounded-[4px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
                ✗ Не вдалося обробити: {result.failed.join(", ")}
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-[4px] bg-[#17130f] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-white hover:opacity-85">Готово</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
