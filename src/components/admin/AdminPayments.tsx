"use client";

import { useCallback, useEffect, useState } from "react";
import { SlideOver } from "./intertop/primitives";

/**
 * Розділ «Оплата» — інтеграції прийому грошей. Поки що одна: monobank
 * Acquiring. Форматом дзеркалить «Доставку»: реєстр + права панель.
 */

type PayState = {
  enabled: boolean;
  active: boolean;
  tokenSource: "env" | "settings" | "none";
  tokenMasked: string;
  webhookUrl: string;
};

const EMPTY: PayState = {
  enabled: false, active: false, tokenSource: "none", tokenMasked: "", webhookUrl: "",
};

const inp =
  "h-9 w-full rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none";
const thCls =
  "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

export function AdminPayments({ onToast }: { onToast?: (msg: string) => void }) {
  const [state, setState] = useState<PayState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ token: "", enabled: false });
  const [test, setTest] = useState<{ state: "idle" | "testing"; msg: string; ok?: boolean }>({ state: "idle", msg: "" });
  const [copied, setCopied] = useState(false);

  // spinner=false на монтуванні: loading вже true, а синхронний setState
  // всередині ефекту викликає зайвий каскад рендерів.
  const load = useCallback((spinner = true) => {
    if (spinner) setLoading(true);
    fetch("/api/admin/payments")
      .then((r) => r.json())
      .then((d) => setState({ ...EMPTY, ...d }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // load(false) не викликає setState синхронно — спіннер уже увімкнений
  // початковим станом, а решта оновлень приходить у .then().
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(false); }, [load]);

  const openEdit = () => {
    setForm({ token: "", enabled: state.enabled });
    setTest({ state: "idle", msg: "" });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setEditing(false);
      load();
      onToast?.("Налаштування оплати збережено");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest({ state: "testing", msg: "" });
    const r = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: form.token }),
    }).then((x) => x.json());
    setTest({
      state: "idle",
      ok: r.ok,
      msg: r.ok ? `З'єднання успішне · ${r.merchant}` : r.error || "Помилка",
    });
  };

  const clearToken = async () => {
    if (!confirm("Видалити збережений токен monobank?")) return;
    await fetch("/api/admin/payments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear_token: true, enabled: false }),
    });
    setEditing(false);
    load();
    onToast?.("Токен видалено");
  };

  const copyHook = () => {
    navigator.clipboard?.writeText(state.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sourceLabel =
    state.tokenSource === "env" ? "з .env.local (перевизначає збережений)"
    : state.tokenSource === "settings" ? "збережений в адмінці"
    : "не налаштовано";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Оплата</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">Приймання платежів</p>
        </div>
        <button
          onClick={() => load()}
          className="ml-auto h-9 rounded-[4px] border border-[#e6eaec] px-4 text-[13px] text-[#5a6472] transition-colors hover:border-[#2b2d42] hover:text-[#2b2d42]"
        >
          ОНОВИТИ
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Спосіб оплати</th>
              <th className={thCls}>Тип</th>
              <th className={thCls}>Стан</th>
              <th className={thCls}>Токен</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : (
              <>
                <tr className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={openEdit}>
                  <td className="px-3 py-2.5 font-medium text-[#2b2d42]">monobank</td>
                  <td className="px-3 py-2.5 text-[#5a6472]">Картка онлайн</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${state.active ? "bg-[#2f9488]" : "bg-[#c0524a]"}`} />
                      <span className={state.active ? "text-[#2b2d42]" : "text-[#c0524a]"}>
                        {state.active ? "Увімкнено" : state.tokenSource === "none" ? "Не налаштовано" : "Вимкнено"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#5a6472]">
                    {state.tokenSource === "env" ? "у змінних середовища" : state.tokenMasked || "—"}
                    <span className="ml-2 text-[11px] text-[#aab4bf]">{sourceLabel}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(); }} className="text-[12px] text-[#2f9488] hover:underline">
                      Налаштувати
                    </button>
                  </td>
                </tr>
                <tr className="border-b border-[#eef2f3] last:border-0">
                  <td className="px-3 py-2.5 font-medium text-[#2b2d42]">Накладений платіж</td>
                  <td className="px-3 py-2.5 text-[#5a6472]">Нова Пошта</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#2f9488]" />
                      <span className="text-[#2b2d42]">Завжди доступний</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#aab4bf]">не потребує</td>
                  <td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={editing}
        title="monobank Acquiring"
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
          <label className="flex items-center gap-2 text-[13px] text-[#2b2d42]">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="h-4 w-4 accent-[#2f9488]"
            />
            Приймати оплату карткою на сайті
          </label>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[#8a94a0]">Токен мерчанта (X-Token)</label>
            <input
              type="password"
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              placeholder={state.tokenMasked ? `збережено: ${state.tokenMasked}` : "токен з кабінету еквайрингу"}
              className={inp}
              autoComplete="off"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#8a94a0]">
              Кабінет monobank для бізнесу → Еквайринг та API → токен.
              Порожнє поле не стирає збережений.
              {state.tokenSource === "env" && (
                <><br /><span className="text-[#c08a2a]">Зараз діє токен із .env.local — він має пріоритет.</span></>
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
              {state.tokenSource === "settings" && (
                <button onClick={clearToken} className="ml-auto text-[12px] text-[#c0524a] hover:underline">
                  Видалити токен
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-[#eef2f3] pt-4">
            <p className="mb-1 text-[11px] uppercase tracking-wider text-[#8a94a0]">Адреса для вебхука</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[3px] bg-[#f7f9fa] px-2 py-1.5 text-[11px] text-[#2b2d42]">
                {state.webhookUrl}
              </code>
              <button onClick={copyHook} className="h-8 shrink-0 rounded-[4px] border border-[#e6eaec] px-3 text-[12px] text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488]">
                {copied ? "СКОПІЙОВАНО" : "КОПІЮВАТИ"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[#8a94a0]">
              Ми передаємо її банку при створенні кожного рахунку — вручну в кабінеті
              нічого вписувати не треба. Підпис кожного виклику перевіряється,
              а статус оплати ми додатково перепитуємо в банку.
            </p>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
