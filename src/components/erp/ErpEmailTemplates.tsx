"use client";

import { useEffect, useState } from "react";

type Template = { id: string; name: string; slug: string; subject: string; body: string; updated_at: string };

const btn = "h-9 px-4 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors";
const teal = btn + " bg-[#007B6E] text-white hover:bg-[#006B5E]";
const ghost = btn + " border border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E]";
const inp = "w-full h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]";

const VARS = ["{{order_number}}", "{{customer_name}}", "{{email}}", "{{phone}}", "{{total}}", "{{ttn}}", "{{status}}", "{{return_id}}"];

export function ErpEmailTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/erp/email-templates");
    setTemplates(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    await fetch("/api/erp/email-templates", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, name: editing.name, subject: editing.subject, body: editing.body }),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    load();
  }
  async function del(id: string) {
    if (!confirm("Видалити шаблон?")) return;
    await fetch("/api/erp/email-templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (editing?.id === id) setEditing(null);
    load();
  }
  function insertVar(v: string) {
    if (!editing) return;
    setEditing((e) => e ? { ...e, body: e.body + v } : e);
  }

  return (
    <div className="flex h-full">
      {/* Left: template list */}
      <aside className="w-[260px] shrink-0 border-r border-[#E0E0E0] bg-white overflow-y-auto">
        <div className="border-b border-[#E0E0E0] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[#212121]">Шаблони листів</h2>
        </div>
        {loading && <p className="p-4 text-[12px] text-[#9E9E9E]">Завантаження…</p>}
        {templates.map((t) => (
          <button key={t.id} onClick={() => setEditing({ ...t })}
            className={`w-full text-left px-4 py-3 border-b border-[#F5F5F5] transition-colors ${
              editing?.id === t.id ? "bg-[#007B6E]/[0.07] border-l-2 border-l-[#007B6E]" : "hover:bg-[#FAFAFA]"
            }`}>
            <p className="text-[13px] font-medium text-[#212121] truncate">{t.name}</p>
            <p className="text-[11px] text-[#9E9E9E] truncate">{t.subject}</p>
          </button>
        ))}
      </aside>

      {/* Right: editor */}
      {!editing ? (
        <div className="flex flex-1 items-center justify-center text-[#9E9E9E] text-[13px]">Оберіть шаблон зліва</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[700px] space-y-4">
            <label className="block"><span className={lbl}>Назва шаблону</span>
              <input value={editing.name} onChange={(e) => setEditing((ed) => ed ? { ...ed, name: e.target.value } : ed)} className={inp} /></label>
            <label className="block"><span className={lbl}>Тема листа (Subject)</span>
              <input value={editing.subject} onChange={(e) => setEditing((ed) => ed ? { ...ed, subject: e.target.value } : ed)} className={inp} /></label>
            <div>
              <span className={lbl}>Тіло листа</span>
              <div className="mb-2 flex flex-wrap gap-1">
                {VARS.map((v) => (
                  <button key={v} onClick={() => insertVar(v)}
                    className="px-2 py-0.5 text-[11px] border border-[#E0E0E0] bg-[#FAFAFA] text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] transition-colors">
                    {v}
                  </button>
                ))}
              </div>
              <textarea value={editing.body} onChange={(e) => setEditing((ed) => ed ? { ...ed, body: e.target.value } : ed)}
                rows={14} className="w-full resize-y border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] font-mono focus:border-[#007B6E] focus:outline-none" />
              <p className="mt-1 text-[11px] text-[#9E9E9E]">Клацніть на змінну вище, щоб вставити у курсор позицію (або скопіюйте вручну)</p>
            </div>

            {/* Preview */}
            <div className="border border-[#E0E0E0] bg-[#FAFAFA] p-4">
              <p className="mb-1 text-[11px] font-semibold uppercase text-[#9E9E9E]">Попередній перегляд</p>
              <p className="text-[12px] text-[#424242] font-medium mb-2">{editing.subject}</p>
              <pre className="text-[12px] text-[#212121] whitespace-pre-wrap font-sans leading-relaxed">{editing.body}</pre>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-[#F5F5F5]">
              {saved && <span className="text-[12px] text-green-700">✓ Збережено</span>}
              <button onClick={() => del(editing.id)} className="text-[12px] text-red-500 hover:text-red-700 mr-auto">Видалити</button>
              <button onClick={() => setEditing(null)} className={ghost}>Скасувати</button>
              <button onClick={save} disabled={saving} className={teal}>{saving ? "Збереження…" : "Зберегти"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
