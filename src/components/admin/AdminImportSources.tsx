"use client";

import { useEffect, useState } from "react";
import { SlideOver, StatusDot } from "./intertop/primitives";

type FeedType = "file" | "url";
type Source = {
  id: string; name: string; feed_type: FeedType;
  template_id: string | null; template_name?: string | null;
  status: "new" | "ok" | "error"; error_count: number; feed_url: string | null;
  last_run_at: string | null; next_run_at: string | null;
  last_feed_created_at: string | null; last_run_summary: string;
  created_at: string; updated_at: string;
};
type TemplateOption = { id: string; name: string };

const emptyForm = (): { name: string; feed_type: FeedType; template_id: string; feed_url: string } =>
  ({ name: "", feed_type: "file", template_id: "", feed_url: "" });

function dmy(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLOR: Record<Source["status"], string> = { new: "#8a94a0", ok: "#2f9488", error: "#c0524a" };
const STATUS_LABEL: Record<Source["status"], string> = { new: "Не запускалось", ok: "Успішно", error: "Помилка" };

export function AdminImportSources({ onToast }: { onToast?: (msg: string) => void } = {}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Source | null | "new">(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

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
    setForm({ name: s.name, feed_type: s.feed_type, template_id: s.template_id ?? "", feed_url: s.feed_url ?? "" });
    setEditing(s);
  };

  const save = async () => {
    setSaving(true);
    const body = { name: form.name, feed_type: form.feed_type, template_id: form.template_id || null, feed_url: form.feed_url || null };
    try {
      if (editing === "new") {
        await fetch("/api/admin/import-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (editing) {
        await fetch(`/api/admin/import-sources/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setEditing(null);
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

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Джерела даних</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">
            Реєстр іменованих імпортів — кожне завантаження файлу з такою назвою оновлює свій рядок · {sources.length.toLocaleString("uk-UA")} записів
          </p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto h-9 rounded-[4px] border border-[#2f9488] px-4 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white"
        >
          СТВОРИТИ ДЖЕРЕЛО
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>ID</th>
              <th className={thCls}>Назва</th>
              <th className={thCls}>Тип фіда</th>
              <th className={thCls}>Шаблон маппінгу</th>
              <th className={thCls}>Статус джерела даних</th>
              <th className={`${thCls} text-right`}>Помилок</th>
              <th className={thCls}>Дата останнього запуску</th>
              <th className={thCls}>Результат</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : sources.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-12 text-center text-[#8a94a0]">
                За вашим запитом нічого не знайдено — джерело зʼявиться тут автоматично після першого застосованого імпорту, або створіть його вручну
              </td></tr>
            ) : sources.map((s) => (
              <tr key={s.id} className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={() => openEdit(s)}>
                <td className="px-3 py-2.5 text-[#5a6472]">{s.id}</td>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{s.name}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{s.feed_type === "file" ? "Файл" : "URL"}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{s.template_name ?? "—"}</td>
                <td className="px-3 py-2.5"><StatusDot color={STATUS_COLOR[s.status]} label={STATUS_LABEL[s.status]} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">{s.error_count}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{dmy(s.last_run_at)}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-[#5a6472]" title={s.last_run_summary}>{s.last_run_summary || "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {s.feed_type === "url" && s.feed_url && (
                      <button onClick={(e) => { e.stopPropagation(); runNow(s); }} disabled={runningId === s.id}
                        className="text-[12px] text-[#2f9488] hover:underline disabled:opacity-50">
                        {runningId === s.id ? "Оновлення…" : "Оновити зараз"}
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); remove(s); }} className="text-[12px] text-[#c0524a] hover:underline">
                      Видалити
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={editing !== null}
        title={editing === "new" ? "Нове джерело" : `Редагувати «${editing ? editing.name : ""}»`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="h-9 flex-1 rounded-[4px] border border-[#e6eaec] text-[13px] text-[#5a6472] hover:bg-[#f7f9fa]">Скасувати</button>
            <button onClick={save} disabled={saving || !form.name.trim()} className="h-9 flex-1 rounded-[4px] bg-[#2f9488] text-[13px] font-medium text-white transition-colors hover:bg-[#267b71] disabled:opacity-50">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Назва джерела</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Напр. назва файлу постачальника"
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Тип фіда</span>
            <select value={form.feed_type} onChange={(e) => setForm((f) => ({ ...f, feed_type: e.target.value as FeedType }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
              <option value="file">Файл (ручне завантаження)</option>
              <option value="url">URL-фід (XML/CSV)</option>
            </select>
          </label>
          {form.feed_type === "url" && (
            <>
              <label className="block">
                <span className="mb-1 block text-[12px] text-[#8a94a0]">URL фіда</span>
                <input value={form.feed_url} onChange={(e) => setForm((f) => ({ ...f, feed_url: e.target.value }))}
                  placeholder="https://site.local/prices.xml"
                  className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
              </label>
              <div className="rounded-[4px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2 text-[12px] text-[#5a6472]">
                Посилання на XML ({"<catalog><offers><offer>"}…) або CSV з тими ж полями. Оновлюється автоматично що 3 години, або натисніть «Оновити зараз» у списку джерел.
                {editing !== "new" && editing && (
                  <>
                    {" "}<button type="button" onClick={() => runNow(editing)} disabled={runningId === editing.id}
                      className="font-medium text-[#2f9488] hover:underline disabled:opacity-50">
                      {runningId === editing.id ? "Оновлення…" : "Оновити зараз →"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Шаблон маппінгу</span>
            <select value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
              <option value="">— автовизначення —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      </SlideOver>
    </div>
  );
}
