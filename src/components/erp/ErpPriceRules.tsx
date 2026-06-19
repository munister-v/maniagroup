"use client";

import { useEffect, useState } from "react";

type Rule = {
  id: string; name: string; condition_field: string; condition_value: string;
  action: string; value: string; active: boolean; created_at: string;
};

const ACTION_LABEL: Record<string, string> = {
  set_markup: "Знижка % від ціни (sale_price)",
  set_discount: "Знижка % (аналог)",
  set_sale_pct: "Встановити sale_price = price × N%",
  set_price: "Встановити ціну фіксовано (грн)",
};
const FIELD_LABEL: Record<string, string> = { all: "Всі товари", brand: "Бренд", category: "Категорія", gender: "Стать" };

const btn = "h-9 px-4 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors";
const teal = btn + " bg-[#007B6E] text-white hover:bg-[#006B5E]";
const ghost = btn + " border border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E]";
const inp = "h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]";

export function ErpPriceRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");
  const [form, setForm] = useState({ name: "", condition_field: "all", condition_value: "", action: "set_markup", value: "10", active: true });

  async function load() {
    setLoading(true);
    const r = await fetch("/api/erp/price-rules");
    setRules(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    await fetch("/api/erp/price-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, value: Number(form.value) }),
    });
    setShowForm(false); load();
  }
  async function toggle(rule: Rule) {
    await fetch("/api/erp/price-rules", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rule, active: !rule.active }),
    });
    load();
  }
  async function del(id: string) {
    if (!confirm("Видалити правило?")) return;
    await fetch("/api/erp/price-rules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  async function apply() {
    setApplying(true); setApplyMsg("");
    const r = await fetch("/api/erp/price-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply" }),
    });
    const d = await r.json();
    setApplyMsg(`✓ Застосовано до ${d.updated ?? 0} товарів`);
    setApplying(false);
  }
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-normal text-[#212121]">Правила цін</h1>
          <p className="text-[13px] text-[#9E9E9E]">Автоматично встановлюють sale_price або regular_price для груп товарів</p>
        </div>
        <div className="flex gap-2">
          {applyMsg && <span className="self-center text-[12px] text-green-700">{applyMsg}</span>}
          <button onClick={apply} disabled={applying} className={ghost}>{applying ? "Застосування…" : "▶ Застосувати всі"}</button>
          <button onClick={() => setShowForm(true)} className={teal}>+ Нове правило</button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 border border-[#E0E0E0] bg-white p-5 space-y-4">
          <h2 className="text-[15px] text-[#212121]">Нове правило</h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className={lbl}>Назва правила</span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp + " w-full"} placeholder="напр. Літній розпродаж" /></label>
            <label className="block"><span className={lbl}>Умова (поле)</span>
              <select value={form.condition_field} onChange={(e) => set("condition_field", e.target.value)} className={inp + " w-full"}>
                {Object.entries(FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            {form.condition_field !== "all" && (
              <label className="block"><span className={lbl}>Значення умови</span>
                <input value={form.condition_value} onChange={(e) => set("condition_value", e.target.value)} className={inp + " w-full"} placeholder={form.condition_field === "brand" ? "напр. Armani" : "напр. Сукні"} /></label>
            )}
            <label className="block"><span className={lbl}>Дія</span>
              <select value={form.action} onChange={(e) => set("action", e.target.value)} className={inp + " w-full"}>
                {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="block"><span className={lbl}>Значення (%  або  ₴)</span>
              <input type="number" min={0} value={form.value} onChange={(e) => set("value", e.target.value)} className={inp + " w-full"} /></label>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[#F5F5F5]">
            <button onClick={() => setShowForm(false)} className={ghost}>Скасувати</button>
            <button onClick={save} className={teal}>Зберегти</button>
          </div>
        </div>
      )}

      <div className="border border-[#E0E0E0] bg-white">
        {loading && <p className="py-8 text-center text-[#9E9E9E]">Завантаження…</p>}
        {!loading && !rules.length && <p className="py-8 text-center text-[#9E9E9E]">Правил ще немає. Створіть перше.</p>}
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-4 border-b border-[#F5F5F5] px-5 py-3 last:border-0">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[#212121]">{rule.name || "Без назви"}</p>
              <p className="text-[12px] text-[#9E9E9E]">
                {FIELD_LABEL[rule.condition_field] ?? rule.condition_field}
                {rule.condition_value ? ` = ${rule.condition_value}` : ""}
                {" · "}{ACTION_LABEL[rule.action] ?? rule.action} · {rule.value}%
              </p>
            </div>
            <button onClick={() => toggle(rule)}
              className={`text-[12px] font-medium ${rule.active ? "text-green-700" : "text-[#9E9E9E]"}`}>
              {rule.active ? "Активне" : "Вимкнено"}
            </button>
            <button onClick={() => del(rule.id)} className="text-[#BDBDBD] hover:text-red-600 text-[13px]">✕</button>
          </div>
        ))}
      </div>

      <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-700">
        ⚠ «Застосувати всі» змінює ціни у базі даних для всіх товарів, що відповідають умовам активних правил. Зробіть backup перед застосуванням.
      </div>
    </div>
  );
}
