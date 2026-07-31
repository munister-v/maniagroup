"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "./intertop/primitives";

/**
 * Екран 7 карти Intertop — «Доставка». Реєстр способів доставки, редагування
 * правою slide-over панеллю, як у них.
 *
 * У нас реально один спосіб — Нова Пошта (відділення), тому реєстр показує
 * його стан: чи налаштований ключ, звідки він узятий, поріг безкоштовної
 * доставки. Вигаданих способів не додаємо.
 */

type DeliveryState = {
  keySource: "env" | "settings" | "none";
  keyMasked: string;
  sender_city: string;
  sender_branch: string;
  sender_phone: string;
  free_ship_threshold: string;
};

const EMPTY: DeliveryState = {
  keySource: "none", keyMasked: "",
  sender_city: "", sender_branch: "", sender_phone: "", free_ship_threshold: "",
};

const inp =
  "h-9 w-full rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none";
const thCls =
  "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

export function AdminDelivery({ onToast }: { onToast?: (msg: string) => void }) {
  const [state, setState] = useState<DeliveryState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ api_key: "", sender_city: "", sender_branch: "", sender_phone: "", free_ship_threshold: "" });
  const [test, setTest] = useState<{ state: "idle" | "testing"; msg: string; ok?: boolean }>({ state: "idle", msg: "" });

  const load = () => {
    setLoading(true);
    fetch("/api/admin/delivery")
      .then((r) => r.json())
      .then((d) => setState({ ...EMPTY, ...d }))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openEdit = () => {
    // Ключ не приходить з сервера — поле лишається порожнім і означає
    // «не чіпати збережений».
    setForm({
      api_key: "",
      sender_city: state.sender_city,
      sender_branch: state.sender_branch,
      sender_phone: state.sender_phone,
      free_ship_threshold: state.free_ship_threshold,
    });
    setTest({ state: "idle", msg: "" });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/delivery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setEditing(false);
      load();
      onToast?.("Налаштування доставки збережено");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest({ state: "testing", msg: "" });
    const r = await fetch("/api/admin/delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: form.api_key }),
    }).then((x) => x.json());
    setTest({
      state: "idle",
      ok: r.ok,
      msg: r.ok ? `З'єднання успішне · ${r.areas} областей` : r.error || "Помилка",
    });
  };

  const clearKey = async () => {
    if (!confirm("Видалити збережений ключ Нової Пошти?")) return;
    await fetch("/api/admin/delivery", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_key: true }),
    });
    setEditing(false);
    load();
    onToast?.("Ключ видалено");
  };

  const configured = state.keySource !== "none";
  const sourceLabel =
    state.keySource === "env" ? "з .env.local (перевизначає збережений)"
    : state.keySource === "settings" ? "збережений в адмінці"
    : "не налаштовано";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Доставка</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">Способи доставки та інтеграції</p>
        </div>
        <button
          onClick={load}
          className="ml-auto h-9 rounded-[4px] border border-[#e6eaec] px-4 text-[13px] text-[#5a6472] transition-colors hover:border-[#2b2d42] hover:text-[#2b2d42]"
        >
          ОНОВИТИ
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Спосіб доставки</th>
              <th className={thCls}>Тип</th>
              <th className={thCls}>Стан</th>
              <th className={thCls}>Ключ API</th>
              <th className={thCls}>Безкоштовно від</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : (
              <tr className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={openEdit}>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">Нова Пошта</td>
                <td className="px-3 py-2.5 text-[#5a6472]">Відділення</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-[#2f9488]" : "bg-[#c0524a]"}`} />
                    <span className={configured ? "text-[#2b2d42]" : "text-[#c0524a]"}>
                      {configured ? "Підключено" : "Не налаштовано"}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[#5a6472]">
                  {state.keySource === "env" ? "у змінних середовища" : state.keyMasked || "—"}
                  <span className="ml-2 text-[11px] text-[#aab4bf]">{sourceLabel}</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-[#2b2d42]">
                  {state.free_ship_threshold ? `${Number(state.free_ship_threshold).toLocaleString("uk-UA")} ₴` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(); }}
                    className="text-[12px] text-[#2f9488] hover:underline"
                  >
                    Налаштувати
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={editing}
        title="Нова Пошта"
        onClose={() => setEditing(false)}
        width="max-w-lg"
        footer={
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="h-9 rounded-[4px] border border-[#2f9488] px-5 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white disabled:opacity-50"
            >
              {saving ? "ЗБЕРЕЖЕННЯ…" : "ЗБЕРЕГТИ"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="h-9 rounded-[4px] border border-[#e6eaec] px-5 text-[13px] text-[#5a6472] hover:border-[#2b2d42] hover:text-[#2b2d42]"
            >
              СКАСУВАТИ
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[#8a94a0]">Ключ API</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              placeholder={state.keyMasked ? `збережено: ${state.keyMasked}` : "вставте ключ з кабінету НП"}
              className={inp}
              autoComplete="off"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#8a94a0]">
              Кабінет Нової Пошти → Налаштування → Безпека → API-ключі.
              Порожнє поле не стирає збережений ключ.
              {state.keySource === "env" && (
                <><br /><span className="text-[#c08a2a]">Зараз діє ключ із .env.local — він має пріоритет над збереженим тут.</span></>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={runTest}
                disabled={test.state === "testing"}
                className="h-8 rounded-[4px] border border-[#e6eaec] px-3 text-[12px] text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488] disabled:opacity-50"
              >
                {test.state === "testing" ? "ПЕРЕВІРКА…" : "ПЕРЕВІРИТИ"}
              </button>
              {test.msg && (
                <span className={`text-[12px] ${test.ok ? "text-[#2f9488]" : "text-[#c0524a]"}`}>{test.msg}</span>
              )}
              {state.keySource === "settings" && (
                <button onClick={clearKey} className="ml-auto text-[12px] text-[#c0524a] hover:underline">
                  Видалити ключ
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-[#eef2f3] pt-4">
            <p className="mb-3 text-[11px] uppercase tracking-wider text-[#8a94a0]">Відправник</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] text-[#8a94a0]">Місто</label>
                <input value={form.sender_city} onChange={(e) => setForm((f) => ({ ...f, sender_city: e.target.value }))} className={inp} placeholder="Київ" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#8a94a0]">Відділення</label>
                <input value={form.sender_branch} onChange={(e) => setForm((f) => ({ ...f, sender_branch: e.target.value }))} className={inp} placeholder="Відділення №1" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[#8a94a0]">Телефон</label>
                <input value={form.sender_phone} onChange={(e) => setForm((f) => ({ ...f, sender_phone: e.target.value }))} className={inp} placeholder="+380..." />
              </div>
            </div>
          </div>

          <div className="border-t border-[#eef2f3] pt-4">
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[#8a94a0]">Безкоштовна доставка від, ₴</label>
            <input
              value={form.free_ship_threshold}
              onChange={(e) => setForm((f) => ({ ...f, free_ship_threshold: e.target.value.replace(/\D/g, "") }))}
              className={inp}
              inputMode="numeric"
            />
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
