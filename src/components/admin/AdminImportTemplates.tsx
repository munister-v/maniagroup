"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "./intertop/primitives";

type Column = { raw_label: string; property_key: string; required: boolean; value_list_id: string };
type TemplateType = "products" | "offers";
type Template = {
  id: string; name: string; format: "csv" | "xlsx"; template_type: TemplateType; encoding: string; delimiter: string;
  header_row: number; data_start_row: number; created_at: string; updated_at: string; column_count?: number;
};
type TemplateDetail = Template & { columns: (Column & { value_list_id: string | null })[] };
type PropertyOption = { key: string; label: string; group: "offer" | "product" };
type ValueListOption = { id: string; name: string; property_key: string };

const emptyColumn = (): Column => ({ raw_label: "", property_key: "", required: false, value_list_id: "" });

function emptyForm(): { name: string; format: "csv" | "xlsx"; template_type: TemplateType; encoding: string; delimiter: string; header_row: number; data_start_row: number; columns: Column[] } {
  return { name: "", format: "csv", template_type: "offers", encoding: "utf-8", delimiter: ";", header_row: 1, data_start_row: 2, columns: [emptyColumn()] };
}

export function AdminImportTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [valueLists, setValueLists] = useState<ValueListOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TemplateDetail | null | "new">(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/import-templates")
      .then((r) => r.json())
      .then((d) => setTemplates((d.templates ?? []) as Template[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/admin/import-templates/properties")
      .then((r) => r.json())
      .then((d) => setProperties((d.properties ?? []) as PropertyOption[]))
      .catch(() => {});
    fetch("/api/admin/value-lists")
      .then((r) => r.json())
      .then((d) => setValueLists((d.lists ?? []) as ValueListOption[]))
      .catch(() => {});
  }, []);

  const openNew = () => { setForm(emptyForm()); setEditing("new"); };
  const openEdit = async (t: Template) => {
    const r = await fetch(`/api/admin/import-templates/${t.id}`);
    const d = await r.json();
    const full = d.template as TemplateDetail;
    if (!full) return;
    setForm({
      name: full.name, format: full.format, template_type: full.template_type, encoding: full.encoding, delimiter: full.delimiter,
      header_row: full.header_row, data_start_row: full.data_start_row,
      columns: full.columns.length
        ? full.columns.map((c) => ({ raw_label: c.raw_label, property_key: c.property_key, required: c.required, value_list_id: c.value_list_id ?? "" }))
        : [emptyColumn()],
    });
    setEditing(full);
  };

  const save = async () => {
    setSaving(true);
    const body = {
      ...form,
      columns: form.columns
        .filter((c) => c.raw_label.trim() !== "" && c.property_key)
        .map((c) => ({ ...c, value_list_id: c.value_list_id || null })),
    };
    try {
      if (editing === "new") {
        await fetch("/api/admin/import-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (editing) {
        await fetch(`/api/admin/import-templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Template) => {
    if (!confirm(`Видалити шаблон «${t.name}»?`)) return;
    await fetch(`/api/admin/import-templates/${t.id}`, { method: "DELETE" });
    load();
  };

  const setColumn = (i: number, patch: Partial<Column>) => {
    setForm((f) => ({ ...f, columns: f.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  };
  const addColumn = () => setForm((f) => ({ ...f, columns: [...f.columns, emptyColumn()] }));
  const removeColumn = (i: number) => setForm((f) => ({ ...f, columns: f.columns.filter((_, idx) => idx !== i) }));

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";
  const TYPE_LABEL: Record<TemplateType, string> = { products: "Товари", offers: "Торгові пропозиції" };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Шаблони даних</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">
            Іменована мапінг-схема «колонка файлу → властивість» для завантаження товарів — {templates.length.toLocaleString("uk-UA")} записів
          </p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto h-9 rounded-[4px] border border-[#2f9488] px-4 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white"
        >
          СТВОРИТИ ШАБЛОН
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Назва</th>
              <th className={thCls}>Тип властивостей</th>
              <th className={thCls}>Формат файлу</th>
              <th className={`${thCls} text-right`}>Колонок</th>
              <th className={thCls}>Оновлено</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-[#8a94a0]">Ще немає шаблонів — створіть перший, щоб не покладатись лише на автовизначення колонок</td></tr>
            ) : templates.map((t) => (
              <tr key={t.id} className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={() => openEdit(t)}>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{t.name}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{TYPE_LABEL[t.template_type] ?? t.template_type}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{t.format.toUpperCase()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">{t.column_count ?? 0}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{new Date(t.updated_at).toLocaleDateString("uk-UA")}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(t); }}
                    className="text-[12px] text-[#c0524a] hover:underline"
                  >
                    Видалити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={editing !== null}
        title={editing === "new" ? "Новий шаблон" : `Редагувати «${editing ? editing.name : ""}»`}
        onClose={() => setEditing(null)}
        width="max-w-2xl"
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
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Назва шаблону</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Напр. «Постачальник X — прайс.csv»"
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] text-[#8a94a0]">Тип шаблону</span>
              <select value={form.template_type} onChange={(e) => setForm((f) => ({ ...f, template_type: e.target.value as TemplateType }))}
                className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
                <option value="offers">Торгові пропозиції (товари + розміри/ціни/залишки)</option>
                <option value="products">Товари</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-[#8a94a0]">Формат файлу</span>
              <select value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as "csv" | "xlsx" }))}
                className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
            </label>
            {form.format === "csv" && (
              <label className="block">
                <span className="mb-1 block text-[12px] text-[#8a94a0]">Роздільник</span>
                <select value={form.delimiter} onChange={(e) => setForm((f) => ({ ...f, delimiter: e.target.value }))}
                  className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
                  <option value=";">; (крапка з комою)</option>
                  <option value=",">, (кома)</option>
                  <option value="\t">Tab</option>
                </select>
              </label>
            )}
            {form.format === "csv" && (
              <label className="block">
                <span className="mb-1 block text-[12px] text-[#8a94a0]">Кодування</span>
                <select value={form.encoding} onChange={(e) => setForm((f) => ({ ...f, encoding: e.target.value }))}
                  className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
                  <option value="utf-8">UTF-8</option>
                  <option value="windows-1251">Windows-1251</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[12px] text-[#8a94a0]">Рядок заголовків</span>
              <input type="number" min={1} value={form.header_row}
                onChange={(e) => setForm((f) => ({ ...f, header_row: Math.max(1, Number(e.target.value) || 1) }))}
                className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-[#8a94a0]">Рядок початку даних</span>
              <input type="number" min={1} value={form.data_start_row}
                onChange={(e) => setForm((f) => ({ ...f, data_start_row: Math.max(1, Number(e.target.value) || 1) }))}
                className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-[12px] text-[#8a94a0]">Колонки — назва в файлі → наша властивість (+ опційний список значень для перекладу)</span>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-1.5 text-[11px] text-[#8a94a0]">
                <span>Заголовок у файлі</span><span>Властивість</span><span>Список значень</span><span>Обов.</span><span></span>
              </div>
              {form.columns.map((col, i) => {
                const listsForProp = valueLists.filter((v) => v.property_key === col.property_key);
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-center gap-1.5">
                    <input value={col.raw_label} onChange={(e) => setColumn(i, { raw_label: e.target.value })} placeholder="Артикул"
                      className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                    <select value={col.property_key} onChange={(e) => setColumn(i, { property_key: e.target.value, value_list_id: "" })}
                      className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none">
                      <option value="">— оберіть —</option>
                      <optgroup label="Торгова пропозиція">
                        {properties.filter((p) => p.group === "offer").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </optgroup>
                      <optgroup label="Товар">
                        {properties.filter((p) => p.group === "product").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </optgroup>
                    </select>
                    <select value={col.value_list_id} onChange={(e) => setColumn(i, { value_list_id: e.target.value })}
                      disabled={!col.property_key || listsForProp.length === 0}
                      className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none disabled:bg-[#f7f9fa] disabled:text-[#c3ccd4]">
                      <option value="">без відповідностей</option>
                      {listsForProp.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <input type="checkbox" checked={col.required} onChange={(e) => setColumn(i, { required: e.target.checked })}
                      className="h-4 w-4 accent-[#2f9488]" />
                    <button onClick={() => removeColumn(i)} aria-label="Видалити колонку"
                      className="flex h-8 w-8 items-center justify-center text-[#8a94a0] hover:text-[#c0524a]">✕</button>
                  </div>
                );
              })}
            </div>
            <button onClick={addColumn} className="mt-2 text-[12px] font-medium text-[#2f9488] hover:underline">+ Додати колонку</button>
          </div>

          {form.columns.some((c) => c.property_key) && (
            <div className="rounded-[4px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2 text-[12px] text-[#5a6472]">
              При завантаженні заголовок у файлі має збігатись <b>дослівно</b> з тим, що вказано тут (регістр не враховується) — на відміну від автовизначення, тут немає розпізнавання синонімів.
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
