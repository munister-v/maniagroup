"use client";

import { useState, useEffect, useRef } from "react";

const MAX_FILE_MB = 20;

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

type WpPreview = {
  checked: number;
  found: { id: number; name: string; code: string; count: number; preview: string; source: string }[];
  notFound: { id: number; name: string; code: string }[];
};
type WpApplyResult = { productsUpdated: number; photosSaved: number; failed: { id: number; name: string }[]; notFound: WpPreview["notFound"] };

export function BulkPhotoMatcher({ onClose, onToast }: { onClose: () => void; onToast?: (m: string) => void }) {
  const [source, setSource] = useState<"files" | "wp">("files");
  const [files, setFiles] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<{ name: string; reason: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<MatchResult | null>(null);

  // ── WP source state ────────────────────────────────────────────────────
  const [wpStatus, setWpStatus] = useState<"idle" | "searching" | "previewed" | "applying" | "done">("idle");
  const [wpPreview, setWpPreview] = useState<WpPreview | null>(null);
  const [wpApplied, setWpApplied] = useState<WpApplyResult | null>(null);
  const [wpError, setWpError] = useState("");
  const [wpProgress, setWpProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [sourcesCount, setSourcesCount] = useState<number | null>(null);
  const wpAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (source !== "wp" || sourcesCount !== null) return;
    fetch("/api/admin/photo-sources").then((r) => r.json()).then((d) => {
      setSourcesCount((d.sources ?? []).filter((s: { enabled: boolean }) => s.enabled).length);
    }).catch(() => setSourcesCount(0));
  }, [source, sourcesCount]);

  /** Reads an NDJSON stream (one JSON object per line), dispatching each to onEvent. */
  async function readNdjson(res: Response, onEvent: (obj: Record<string, unknown>) => void) {
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try { onEvent(JSON.parse(line)); } catch { /* ignore malformed line */ }
      }
    }
    if (buf.trim()) { try { onEvent(JSON.parse(buf)); } catch { /* ignore */ } }
  }

  async function wpSearch() {
    setWpStatus("searching"); setWpError(""); setWpPreview(null); setWpProgress(null);
    const controller = new AbortController();
    wpAbort.current = controller;
    try {
      const r = await fetch("/api/admin/products/photos/wp-fetch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview" }), signal: controller.signal,
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setWpError(d.error ?? "Помилка"); setWpStatus("idle"); return; }
      let finalErr = "";
      await readNdjson(r, (ev) => {
        if (ev.type === "search-progress") setWpProgress({ label: "Шукаємо", done: ev.checked as number, total: ev.total as number });
        else if (ev.type === "done") {
          if (ev.error) { finalErr = ev.error as string; return; }
          setWpPreview(ev as unknown as WpPreview);
        }
      });
      setWpProgress(null);
      if (finalErr) { setWpError(finalErr); setWpStatus("idle"); return; }
      setWpStatus("previewed");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") { setWpStatus("idle"); setWpProgress(null); return; }
      setWpError("Помилка мережі"); setWpStatus("idle"); setWpProgress(null);
    }
  }

  async function wpApply() {
    setWpStatus("applying"); setWpError(""); setWpProgress(null);
    const controller = new AbortController();
    wpAbort.current = controller;
    try {
      const r = await fetch("/api/admin/products/photos/wp-fetch", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "apply" }), signal: controller.signal,
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setWpError(d.error ?? "Помилка"); setWpStatus("previewed"); return; }
      let finalErr = "";
      let finalResult: WpApplyResult | null = null;
      await readNdjson(r, (ev) => {
        if (ev.type === "search-progress") setWpProgress({ label: "Шукаємо", done: ev.checked as number, total: ev.total as number });
        else if (ev.type === "apply-progress") setWpProgress({ label: "Завантажуємо фото", done: ev.done as number, total: ev.total as number });
        else if (ev.type === "done") {
          if (ev.error) { finalErr = ev.error as string; return; }
          finalResult = ev as unknown as WpApplyResult;
        }
      });
      setWpProgress(null);
      if (finalErr) { setWpError(finalErr); setWpStatus("previewed"); return; }
      if (!finalResult) { setWpError("Порожня відповідь сервера"); setWpStatus("previewed"); return; }
      setWpApplied(finalResult);
      setWpStatus("done");
      onToast?.(`Підтягнуто фото для ${(finalResult as WpApplyResult).productsUpdated} товарів`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") { setWpStatus("previewed"); setWpProgress(null); return; }
      setWpError("Помилка мережі"); setWpStatus("previewed"); setWpProgress(null);
    }
  }

  function wpCancel() {
    wpAbort.current?.abort();
  }

  function wpSearchAgain() {
    setWpStatus("idle"); setWpPreview(null); setWpApplied(null); setWpError(""); setWpProgress(null);
  }

  function addFiles(list: FileList | File[]) {
    const existingNames = new Set(files.map((f) => f.name));
    const accepted: File[] = [];
    const rejected: { name: string; reason: string }[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) { rejected.push({ name: f.name, reason: "не зображення" }); continue; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { rejected.push({ name: f.name, reason: `>${MAX_FILE_MB}МБ` }); continue; }
      if (existingNames.has(f.name)) { rejected.push({ name: f.name, reason: "вже додано" }); continue; }
      existingNames.add(f.name);
      accepted.push(f);
    }
    setFiles((prev) => [...prev, ...accepted]);
    setRejectedFiles(rejected);
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
      <div className="relative z-10 max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[6px] border border-[#e6eaec] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-[#2b2d42]">Масове завантаження фото</h3>
            <p className="mt-0.5 text-[12px] text-[#8a94a0]">Назвіть файли кодом товару — система сама знайде відповідний товар</p>
          </div>
          <button onClick={onClose} className="text-[#8a94a0] hover:text-[#2b2d42]" aria-label="Закрити">✕</button>
        </div>

        <div className="mb-4 flex items-center gap-0.5 rounded-[3px] border border-[#e6eaec] p-0.5">
          <button onClick={() => setSource("files")}
            className={`h-8 flex-1 rounded-[2px] text-[11px] uppercase tracking-[0.08em] transition-colors ${source === "files" ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"}`}>
            З файлів
          </button>
          <button onClick={() => setSource("wp")}
            className={`h-8 flex-1 rounded-[2px] text-[11px] uppercase tracking-[0.08em] transition-colors ${source === "wp" ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"}`}>
            З WP
          </button>
        </div>

        {source === "wp" && (
          <div className="space-y-4">
            {wpStatus !== "done" && (
              <>
                <div className="rounded-[4px] border border-[#e6eaec] bg-[#f7f9fa] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#5a6472]">
                  Шукає фото в медіатеках підключених WordPress-сайтів за артикулом/SKU товару (по черзі, поки не знайдеться) — для всіх товарів без фото одразу.
                  Джерела керуються в <b className="text-[#2b2d42]">Налаштування → Фото з WP</b>.
                </div>

                {wpStatus === "idle" && sourcesCount === 0 && (
                  <div className="rounded-[4px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800">
                    Немає підключених джерел. Додайте хоча б одне в <b>Налаштування → Фото з WP</b>.
                  </div>
                )}
                {wpStatus === "idle" && (
                  <button onClick={wpSearch} disabled={sourcesCount === 0 || sourcesCount === null}
                    className="h-10 w-full rounded-[4px] border border-[#2f9488] text-[12px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
                    Знайти фото для товарів без фото
                  </button>
                )}
                {wpStatus === "searching" && (
                  <>
                    <ProgressBar progress={wpProgress} fallback="Шукаємо на джерелі…" />
                    <button onClick={wpCancel} className="w-full rounded-[4px] border border-[#e6eaec] py-2 text-[12px] text-[#5a6472] hover:border-[#2b2d42]">Скасувати</button>
                  </>
                )}
                {wpError && <p className="text-[12px] text-red-600">{wpError}</p>}

                {wpStatus === "previewed" && wpPreview && (
                  <>
                    <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
                      Перевірено <b>{wpPreview.checked}</b> товарів без фото — знайдено фото для <b>{wpPreview.found.length}</b>,
                      не знайдено для <b>{wpPreview.notFound.length}</b>.
                    </div>
                    {wpPreview.found.length > 0 && (
                      <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-[4px] border border-[#e6eaec] bg-white p-2">
                        {wpPreview.found.slice(0, 30).map((f) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <div key={f.id} className="flex items-center gap-2.5 text-[12px]">
                            <img src={f.preview} alt="" className="h-8 w-8 shrink-0 rounded-[2px] object-cover" />
                            <span className="min-w-0 flex-1 truncate text-[#2b2d42]">{f.name}</span>
                            <span className="shrink-0 text-[#8a94a0]">{f.count} фото · {f.source}</span>
                          </div>
                        ))}
                        {wpPreview.found.length > 30 && <p className="text-[11px] text-[#8a94a0]">…і ще {wpPreview.found.length - 30}</p>}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setWpStatus("idle"); setWpPreview(null); }} className="rounded-[4px] border border-[#e6eaec] px-4 py-2 text-[12px] text-[#5a6472] hover:border-[#2b2d42]">Скасувати</button>
                      <button onClick={wpApply} disabled={wpPreview.found.length === 0}
                        className="rounded-[4px] border border-[#2f9488] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
                        Завантажити й прив&apos;язати ({wpPreview.found.length})
                      </button>
                    </div>
                  </>
                )}
                {wpStatus === "applying" && (
                  <>
                    <ProgressBar progress={wpProgress} fallback="Завантажуємо фото…" />
                    <button onClick={wpCancel} className="w-full rounded-[4px] border border-[#e6eaec] py-2 text-[12px] text-[#5a6472] hover:border-[#2b2d42]">Скасувати</button>
                  </>
                )}
              </>
            )}

            {wpStatus === "done" && wpApplied && (
              <div className="space-y-4">
                <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
                  ✓ Підтягнуто <b>{wpApplied.photosSaved}</b> фото для <b>{wpApplied.productsUpdated}</b> товарів
                </div>
                {wpApplied.notFound.length > 0 && (
                  <div className="rounded-[4px] border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="mb-1.5 text-[12px] text-amber-800">⚠ Не знайдено на джерелі для {wpApplied.notFound.length} товарів:</p>
                    <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-amber-700">
                      {wpApplied.notFound.slice(0, 15).map((f) => <li key={f.id} className="truncate">{f.name} <span className="font-mono">({f.code})</span></li>)}
                      {wpApplied.notFound.length > 15 && <li className="text-amber-400">…і ще {wpApplied.notFound.length - 15}</li>}
                    </ul>
                  </div>
                )}
                {wpApplied.failed.length > 0 && (
                  <div className="rounded-[4px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
                    ✗ Не вдалося завантажити для: {wpApplied.failed.map((f) => f.name).join(", ")}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={wpSearchAgain} className="rounded-[4px] border border-[#e6eaec] px-4 py-2 text-[12px] text-[#5a6472] hover:border-[#2b2d42]">Шукати ще</button>
                  <button onClick={onClose} className="rounded-[4px] border border-[#2f9488] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white">Готово</button>
                </div>
              </div>
            )}
          </div>
        )}

        {source === "files" && status !== "done" && (
          <>
            <div className="mb-3 rounded-[4px] border border-[#e6eaec] bg-[#f7f9fa] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#5a6472]">
              <b className="text-[#2b2d42]">Як назвати файли:</b> артикул або SKU товару на початку назви —
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
                dragOver ? "border-[#2f9488] bg-[#f0faf4]" : "border-[#e6eaec] hover:border-[#b6c0ca]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#8a94a0]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="text-[13px] text-[#3a4250]">Перетягніть фото сюди або натисніть</p>
              <input id="bulk-photo-input" type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); }} />
            </div>

            {files.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Обрано файлів: {files.length}</p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-[4px] border border-[#e6eaec] bg-white p-2 text-[11px] text-[#5a6472]">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{f.name}</span>
                      <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-[#8a94a0] hover:text-red-600">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rejectedFiles.length > 0 && (
              <div className="mt-2 rounded-[4px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <p className="mb-1">⚠ Пропущено:</p>
                <ul className="space-y-0.5">
                  {rejectedFiles.map((f, i) => <li key={i} className="truncate">{f.name} — {f.reason}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-[4px] border border-[#e6eaec] px-4 py-2 text-[12px] text-[#5a6472] hover:border-[#2b2d42]">Скасувати</button>
              <button onClick={run} disabled={files.length === 0 || status === "running"}
                className="rounded-[4px] border border-[#2f9488] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
                {status === "running" ? "Обробка…" : `Завантажити й прив'язати (${files.length})`}
              </button>
            </div>
          </>
        )}

        {source === "files" && status === "done" && result && (
          <div className="space-y-4">
            <div className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
              ✓ Прив'язано <b>{result.matched.length}</b> фото до <b>{byProduct.size}</b> товарів
            </div>

            {byProduct.size > 0 && (
              <div className="rounded-[4px] border border-[#e6eaec] bg-white">
                <div className="divide-y divide-[#F5F5F5]">
                  {Array.from(byProduct.entries()).map(([key, items]) => {
                    const [, name] = key.split(":");
                    return (
                      <div key={key} className="px-4 py-2 text-[12px]">
                        <span className="font-medium text-[#2b2d42]">{name}</span>
                        <span className="ml-2 text-[#8a94a0]">{items.length} фото</span>
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
              <button onClick={onClose} className="rounded-[4px] border border-[#2f9488] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white">Готово</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ progress, fallback }: { progress: { label: string; done: number; total: number } | null; fallback: string }) {
  if (!progress || progress.total === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-[#8a94a0]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#8a94a0]" /> {fallback}
      </div>
    );
  }
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between text-[12px] text-[#5a6472]">
        <span>{progress.label}…</span>
        <span>{progress.done} / {progress.total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e6eaec]">
        <div className="h-full rounded-full bg-[#2b2d42] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
