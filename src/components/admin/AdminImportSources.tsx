"use client";

import { useEffect, useState } from "react";
import { SlideOver, StatusDot } from "./intertop/primitives";

type FeedType = "file" | "url";
type StockMode = "patch" | "snapshot";
type Source = {
  id: string; name: string; feed_type: FeedType;
  stock_mode: StockMode;
  template_id: string | null; template_name?: string | null;
  status: "new" | "ok" | "error"; error_count: number; feed_url: string | null;
  last_run_at: string | null; next_run_at: string | null;
  enabled: boolean; interval_minutes: number; running_at: string | null;
  last_feed_created_at: string | null; last_feed_signature: string | null;
  last_duration_ms: number | null; last_run_summary: string;
  created_at: string; updated_at: string;
};
type TemplateOption = { id: string; name: string };
type TestResult = {
  sourceId: string; filename: string; format: string; bytes: number;
  preview: { totalRows: number; processedRows: number; matchedRows: number; unmatchedRows: number; duplicateRows: number; skippedRows: number; zeroedRows: number };
};

type SourceForm = { name: string; feed_type: FeedType; stock_mode: StockMode; template_id: string; feed_url: string; enabled: boolean; interval_minutes: number };
const emptyForm = (): SourceForm =>
  ({ name: "", feed_type: "url", stock_mode: "patch", template_id: "", feed_url: "", enabled: true, interval_minutes: 180 });

function dmy(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLOR: Record<Source["status"], string> = { new: "#8a94a0", ok: "#2f9488", error: "#c0524a" };
const STATUS_LABEL: Record<Source["status"], string> = { new: "Не запускалось", ok: "Успішно", error: "Помилка" };
const INTERVAL_LABEL: Record<number, string> = {
  30: "кожні 30 хв", 60: "щогодини", 180: "кожні 3 години",
  360: "кожні 6 годин", 720: "кожні 12 годин", 1440: "раз на добу",
};

export function AdminImportSources({ onToast }: { onToast?: (msg: string) => void } = {}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Source | null | "new">(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/import-sources")
      .then((r) => r.json())
      .then((d) => setSources((d.sources ?? []) as Source[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/admin/import-templates")
      .then((r) => r.json())
      .then((d) => setTemplates((d.templates ?? []) as TemplateOption[]))
      .catch(() => {});
  }, []);

  const openNew = () => { setForm(emptyForm()); setEditing("new"); };
  const openEdit = (s: Source) => {
    setForm({ name: s.name, feed_type: s.feed_type, stock_mode: s.stock_mode ?? "patch", template_id: s.template_id ?? "", feed_url: s.feed_url ?? "", enabled: s.enabled, interval_minutes: s.interval_minutes ?? 180 });
    setEditing(s);
  };

  const save = async () => {
    setSaving(true);
    const body = { name: form.name, feed_type: form.feed_type, stock_mode: form.stock_mode, template_id: form.template_id || null, feed_url: form.feed_url || null, enabled: form.enabled, interval_minutes: form.interval_minutes };
    try {
      let response: Response;
      if (editing === "new") {
        response = await fetch("/api/admin/import-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (editing) {
        response = await fetch(`/api/admin/import-sources/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        return;
      }
      const data = await response.json();
      if (!response.ok) { onToast?.(data.error ?? "Не вдалося зберегти"); return; }
      setEditing(null);
      onToast?.("Автооновлення збережено");
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Source) => {
    if (!confirm(`Видалити джерело «${s.name}»?`)) return;
    await fetch(`/api/admin/import-sources/${s.id}`, { method: "DELETE" });
    load();
  };

  /** Guide 2.8's "Оновити зараз" — fetch this URL feed and apply it now,
   *  outside its normal 3-hour cron cycle. */
  const runNow = async (s: Source) => {
    if (s.stock_mode === "snapshot" && !confirm("Це повний знімок: позиції, яких немає у фіді, можуть бути обнулені. Запустити синхронізацію?")) return;
    setRunningId(s.id);
    try {
      const res = await fetch(`/api/admin/import-sources/${s.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { onToast?.(data.error ?? "Помилка запуску"); return; }
      onToast?.(data.skipped ? data.reason : `Джерело «${s.name}»: ${data.matchedRows} поз., ${data.productsCreated} нових товарів`);
      load();
    } finally {
      setRunningId(null);
    }
  };

  const testSource = async (s: Source) => {
    setTestingId(s.id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/import-sources/${s.id}/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { onToast?.(data.error ?? "Не вдалося перевірити фід"); return; }
      setTestResult({ sourceId: s.id, filename: data.filename, format: data.format, bytes: data.bytes, preview: data.preview });
      onToast?.(`Перевірено без змін у каталозі: ${data.preview.matchedRows} рядків знайдено`);
    } finally {
      setTestingId(null);
    }
  };

  const toggleSource = async (s: Source) => {
    const body = { name: s.name, feed_type: s.feed_type, stock_mode: s.stock_mode, template_id: s.template_id, feed_url: s.feed_url, enabled: !s.enabled, interval_minutes: s.interval_minutes };
    const res = await fetch(`/api/admin/import-sources/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { onToast?.(data.error ?? "Не вдалося змінити стан"); return; }
    onToast?.(!s.enabled ? `«${s.name}» увімкнено` : `«${s.name}» призупинено`);
    load();
  };

  const recurringSources = sources.filter((s) => s.feed_type === "url");
  const activeCount = recurringSources.filter((s) => s.enabled).length;
  const errorCount = recurringSources.filter((s) => s.status === "error").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Автоматичне оновлення</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">
            Для постійних посилань постачальників. Звичайний Excel або CSV завантажуйте у вкладці «Імпорт із файлу».
          </p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto h-9 rounded-[4px] border border-[#2f9488] px-4 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white"
        >
          ДОДАТИ АВТООНОВЛЕННЯ
        </button>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-[5px] border border-[#D7E8E5] bg-[#F3F9F8] px-4 py-3 text-[12px] leading-5 text-[#49615E]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white font-semibold text-[#2f9488]">i</span>
        <p><b className="text-[#1f2733]">Безпечний порядок:</b> додайте посилання, натисніть «Перевірити без змін» і лише після доброго покриття увімкніть розклад. Не змінений файл система пропустить автоматично.</p>
      </div>

      <div className="mb-4 grid grid-cols-3 border border-[#e6eaec] bg-white sm:max-w-[520px]">
        <div className="border-r border-[#e6eaec] px-4 py-3"><p className="text-[9px] uppercase tracking-[0.12em] text-[#8a94a0]">Активні</p><p className="mt-1 text-[20px] font-semibold tabular-nums text-[#2f9488]">{activeCount}</p></div>
        <div className="border-r border-[#e6eaec] px-4 py-3"><p className="text-[9px] uppercase tracking-[0.12em] text-[#8a94a0]">На паузі</p><p className="mt-1 text-[20px] font-semibold tabular-nums text-[#2b2d42]">{recurringSources.filter((s) => !s.enabled).length}</p></div>
        <div className="px-4 py-3"><p className="text-[9px] uppercase tracking-[0.12em] text-[#8a94a0]">Помилки</p><p className={`mt-1 text-[20px] font-semibold tabular-nums ${errorCount ? "text-[#c0524a]" : "text-[#2b2d42]"}`}>{errorCount}</p></div>
      </div>

      {loading ? (
        <div className="border border-[#e6eaec] bg-white px-4 py-12 text-center text-[13px] text-[#8a94a0]">Завантаження джерел…</div>
      ) : recurringSources.length === 0 ? (
        <div className="border border-dashed border-[#cfd7da] bg-white px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-[#2b2d42]">Автооновлень ще немає</p>
          <p className="mx-auto mt-2 max-w-[520px] text-[12px] leading-5 text-[#8a94a0]">Додайте постійне посилання постачальника. Для разового Excel або CSV використовуйте вкладку «Імпорт із файлу».</p>
          <button onClick={openNew} className="mt-4 h-9 rounded-[4px] bg-[#2f9488] px-5 text-[12px] font-medium text-white hover:bg-[#267b71]">Додати перше джерело</button>
        </div>
      ) : (
        <div className="space-y-3">
          {recurringSources.map((s) => {
            const result = testResult?.sourceId === s.id ? testResult : null;
            const coverage = result && result.preview.processedRows > 0 ? Math.round(result.preview.matchedRows / result.preview.processedRows * 100) : null;
            return (
              <div key={s.id} className={`border bg-white ${s.status === "error" ? "border-[#e5b9b5]" : "border-[#e6eaec]"}`}>
                <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => openEdit(s)} className="truncate text-left text-[15px] font-semibold text-[#2b2d42] hover:text-[#2f9488]">{s.name}</button>
                      <span className={`rounded-[3px] border px-2 py-0.5 text-[10px] ${s.enabled ? "border-[#b9d9d4] bg-[#f3f9f8] text-[#2f9488]" : "border-[#dfe3e5] bg-[#f7f9fa] text-[#8a94a0]"}`}>{s.enabled ? "Активне" : "Пауза"}</span>
                      {s.running_at && <span className="text-[10px] font-medium text-blue-600">Синхронізація виконується…</span>}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[#8a94a0]" title={s.feed_url ?? ""}>{s.feed_url || "Ручне джерело без URL"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.feed_type === "url" && s.feed_url && (
                      <>
                        <button onClick={() => testSource(s)} disabled={testingId === s.id || runningId === s.id}
                          className="h-8 rounded-[4px] border border-[#cfd7da] px-3 text-[11px] font-medium text-[#3a4250] hover:bg-[#f7f9fa] disabled:opacity-50">
                          {testingId === s.id ? "Перевіряємо…" : "Перевірити без змін"}
                        </button>
                        <button onClick={() => runNow(s)} disabled={runningId === s.id || testingId === s.id}
                          className="h-8 rounded-[4px] border border-[#2f9488] px-3 text-[11px] font-medium text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
                          {runningId === s.id ? "Синхронізація…" : "Синхронізувати зараз"}
                        </button>
                      </>
                    )}
                    <button onClick={() => toggleSource(s)} className="h-8 rounded-[4px] border border-[#cfd7da] px-3 text-[11px] text-[#5a6472] hover:bg-[#f7f9fa]">{s.enabled ? "Поставити на паузу" : "Увімкнути"}</button>
                  </div>
                </div>

                <div className="grid border-t border-[#eef2f3] sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border-b border-[#eef2f3] px-4 py-3 sm:border-r lg:border-b-0"><p className="text-[9px] uppercase tracking-[0.1em] text-[#8a94a0]">Розклад</p><p className="mt-1 text-[12px] text-[#3a4250]">{s.enabled ? INTERVAL_LABEL[s.interval_minutes] ?? `${s.interval_minutes} хв` : "призупинено"}</p><p className="mt-0.5 text-[10px] text-[#8a94a0]">Наступний: {s.enabled ? dmy(s.next_run_at) : "—"}</p></div>
                  <div className="border-b border-[#eef2f3] px-4 py-3 lg:border-b-0 lg:border-r"><p className="text-[9px] uppercase tracking-[0.1em] text-[#8a94a0]">Режим залишків</p><p className={`mt-1 text-[12px] ${s.stock_mode === "snapshot" ? "text-amber-700" : "text-[#3a4250]"}`}>{s.stock_mode === "snapshot" ? "Повний знімок" : "Лише рядки фіда"}</p><p className="mt-0.5 text-[10px] text-[#8a94a0]">{s.template_name || "Колонки визначаються автоматично"}</p></div>
                  <div className="border-b border-[#eef2f3] px-4 py-3 sm:border-b-0 sm:border-r"><p className="text-[9px] uppercase tracking-[0.1em] text-[#8a94a0]">Останній запуск</p><div className="mt-1"><StatusDot color={STATUS_COLOR[s.status]} label={s.running_at ? "Виконується" : STATUS_LABEL[s.status]} /></div><p className="mt-0.5 text-[10px] text-[#8a94a0]">{dmy(s.last_run_at)}{s.last_duration_ms != null ? ` · ${(s.last_duration_ms / 1000).toFixed(1)} с` : ""}</p></div>
                  <div className="px-4 py-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#8a94a0]">Результат</p><p className={`mt-1 text-[11px] leading-4 ${s.status === "error" ? "text-[#c0524a]" : "text-[#5a6472]"}`}>{s.last_run_summary || "Ще не запускалося"}</p></div>
                </div>

                {result && (
                  <div className={`flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center ${coverage != null && coverage >= 90 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current bg-white text-[12px] font-semibold text-[#2f9488]">{coverage ?? 0}%</div>
                    <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-[#2b2d42]">Dry-run завершено, каталог не змінено</p><p className="mt-0.5 text-[10px] text-[#5a6472]">{result.format} · {(result.bytes / 1024).toFixed(1)} КБ · {result.preview.matchedRows} знайдено · {result.preview.unmatchedRows} не знайдено · {result.preview.duplicateRows} дублів</p></div>
                    {result.preview.zeroedRows > 0 && <span className="text-[11px] font-medium text-amber-800">При повному знімку: {result.preview.zeroedRows} позицій до нуля</span>}
                  </div>
                )}

                <div className="flex items-center justify-end gap-4 border-t border-[#eef2f3] px-4 py-2 text-[11px]">
                  <button onClick={() => openEdit(s)} className="text-[#2f9488] hover:underline">Налаштувати</button>
                  <button onClick={() => remove(s)} className="text-[#c0524a] hover:underline">Видалити</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SlideOver
        open={editing !== null}
        title={editing === "new" ? "Нове автооновлення" : `Налаштувати «${editing ? editing.name : ""}»`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="h-9 flex-1 rounded-[4px] border border-[#e6eaec] text-[13px] text-[#5a6472] hover:bg-[#f7f9fa]">Скасувати</button>
            <button onClick={save} disabled={saving || !form.name.trim() || !form.feed_url.trim()} className="h-9 flex-1 rounded-[4px] bg-[#2f9488] text-[13px] font-medium text-white transition-colors hover:bg-[#267b71] disabled:opacity-50">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[#3a4250]">Як поводитися із залишками</span>
            <select value={form.stock_mode} onChange={(e) => setForm((f) => ({ ...f, stock_mode: e.target.value as StockMode }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
              <option value="patch">Безпечно: змінити лише те, що є у файлі</option>
              <option value="snapshot">Повна заміна: відсутні позиції обнулити</option>
            </select>
            <span className="mt-1 block text-[11px] leading-4 text-[#8a94a0]">
              Повний знімок використовуйте лише для повної таблиці постачальника. Перед застосуванням система покаже всі обнулення.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[#3a4250]">Зрозуміла назва</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Напр. Щоденні залишки постачальника"
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>
          {form.feed_type === "url" && (
            <>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#3a4250]">Посилання постачальника</span>
                <input value={form.feed_url} onChange={(e) => setForm((f) => ({ ...f, feed_url: e.target.value }))}
                  placeholder="https://supplier.example/catalog.xml"
                  className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
                <span className="mt-1 block text-[11px] leading-4 text-[#8a94a0]">Постійне пряме посилання на CSV, XLSX або XML. Сторінка сайту чи Google Drive без прямого доступу не підійде.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#3a4250]">Як часто перевіряти зміни</span>
                <select value={form.interval_minutes} onChange={(e) => setForm((f) => ({ ...f, interval_minutes: Number(e.target.value) }))}
                  className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
                  <option value={30}>Кожні 30 хвилин</option>
                  <option value={60}>Щогодини</option>
                  <option value={180}>Кожні 3 години</option>
                  <option value={360}>Кожні 6 годин</option>
                  <option value={720}>Кожні 12 годин</option>
                  <option value={1440}>Раз на добу</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-[4px] border border-[#e6eaec] bg-white px-3 py-3">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-[#2f9488]" />
                <span><b className="block text-[12px] font-medium text-[#3a4250]">Увімкнути автоматичний розклад</b><span className="mt-0.5 block text-[11px] leading-4 text-[#8a94a0]">Вимкніть, щоб спочатку зберегти й перевірити фід без автоматичного запуску.</span></span>
              </label>
              <div className="rounded-[4px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2 text-[12px] text-[#5a6472]">
                Після збереження натисніть «Перевірити без змін». Система завантажить файл, покаже покриття каталогу, дублі, невідомі позиції й можливі обнулення.
                {editing !== "new" && editing && (
                  <>
                    {" "}<button type="button" onClick={() => testSource(editing)} disabled={testingId === editing.id}
                      className="font-medium text-[#2f9488] hover:underline disabled:opacity-50">
                      {testingId === editing.id ? "Перевіряємо…" : "Перевірити зараз →"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Як читати колонки (необовʼязково)</span>
            <select value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
              <option value="">Визначити автоматично (рекомендовано)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      </SlideOver>
    </div>
  );
}
