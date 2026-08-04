"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Редактор логотипів брендів і стрічки на головній.
 *
 * Головна ідея: адмін бачить не абстрактний список, а те, що реально покажеться
 * на сайті. Зверху — прев'ю стрічки один-в-один, нижче — список із перетягуванням.
 *
 * ⚠️ На головну потрапляють лише перші STRIP_LIMIT видимих брендів, у яких є
 * логотип. Без явної межі у списку люди сортують бренди, які все одно не видно,
 * і думають, що редактор зламаний.
 */

type Bg = "light" | "dark";
type Row = {
  brand: string; slug: string; logo: string | null; source: string;
  bg: Bg; visible: boolean; sort_order: number | null;
};

/** Стільки логотипів показує стрічка на головній (див. BrandStrip у page.tsx). */
const STRIP_LIMIT = 18;

const SOURCE_LABEL: Record<string, { t: string; bg: string; c: string }> = {
  manual: { t: "Вручну", bg: "#e8f5e9", c: "#2e7d32" },
  auto: { t: "Авто", bg: "#e3f2fd", c: "#1565c0" },
  bundled: { t: "Вбудовано", bg: "#f3e5f5", c: "#6a1b9a" },
  none: { t: "Немає лого", bg: "#f5f5f4", c: "#8a8278" },
};

const isDeadLogo = (u: string | null) => !!u && u.includes("clearbit");

export function AdminBrandLogos({ onToast }: { onToast?: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "none" | "hidden">("all");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true);
    const r = await fetch("/api/admin/brand-logos", { cache: "no-store" });
    const d = await r.json();
    setRows(d.brands ?? []);
    setDirty(false);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(false); }, [load]);

  /* ── логотипи ─────────────────────────────────────────────────────────── */

  async function downloadAll() {
    setBusyDownload(true);
    try {
      const r = await fetch("/api/admin/brand-logos/download", { method: "POST" });
      const d = await r.json();
      onToast?.(d.ok ? `Завантажено: ${d.saved} лого (пропущено: ${d.skipped})` : `Помилка: ${d.error}`);
      await load();
    } finally { setBusyDownload(false); }
  }

  async function autofill() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/brand-logos/autofill", { method: "POST" });
      const d = await r.json();
      onToast?.(`Наповнено: ${d.filled ?? 0}`);
      await load();
    } finally { setBusy(false); }
  }

  async function setLogo(brand: string, logoUrl: string, bg: Bg = "light") {
    await fetch("/api/admin/brand-logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, logoUrl, bg }),
    });
    await load(false);
  }

  async function removeLogo(brand: string) {
    await fetch(`/api/admin/brand-logos?brand=${encodeURIComponent(brand)}`, { method: "DELETE" });
    onToast?.(`Логотип «${brand}» прибрано`);
    await load(false);
  }

  function pickFile(brand: string) {
    uploadFor.current = brand;
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const brand = uploadFor.current;
    e.target.value = "";
    if (!file || !brand) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const ud = await up.json();
      if (!ud.url) { onToast?.(ud.error || "Помилка завантаження"); return; }
      const current = rows.find((r) => r.brand === brand)?.bg ?? "light";
      await setLogo(brand, ud.url, current);
      onToast?.(`Логотип «${brand}» оновлено`);
    } finally { setBusy(false); }
  }

  async function toggleBg(r: Row) {
    if (!r.logo) return;
    await setLogo(r.brand, r.logo, r.bg === "dark" ? "light" : "dark");
  }

  /* ── порядок і видимість ──────────────────────────────────────────────── */

  // Перетягування можливе лише в повному списку: у відфільтрованому позиція на
  // екрані не збігається з позицією в даних, і картка їхала б не туди.
  const reorderable = !search && filter === "all";

  function applyMove(from: number, to: number) {
    if (from === to) return;
    setRows((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  }

  function move(idx: number, dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= rows.length) return;
    setRows((cur) => {
      const next = [...cur];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function toggleVisible(brand: string) {
    setRows((cur) => cur.map((r) => (r.brand === brand ? { ...r, visible: !r.visible } : r)));
    setDirty(true);
  }

  /** Підняти бренд одразу в стрічку — швидше, ніж тягнути через пів списку. */
  function promote(idx: number) {
    applyMove(idx, 0);
  }

  function hideAllWithoutLogo() {
    setRows((cur) => cur.map((r) => (r.logo ? r : { ...r, visible: false })));
    setDirty(true);
    onToast?.("Бренди без лого приховано — не забудьте зберегти");
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      const items = rows.map((r, i) => ({ brand: r.brand, visible: r.visible, sort_order: i }));
      const res = await fetch("/api/admin/brand-logos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) { onToast?.("Не вдалося зберегти порядок"); return; }
      setDirty(false);
      onToast?.("Порядок і видимість збережено");
    } finally { setSavingOrder(false); }
  }

  /* ── похідні дані ─────────────────────────────────────────────────────── */

  // Те, що реально побачить покупець: видимі, з лого, перші STRIP_LIMIT.
  const strip = useMemo(
    () => rows.filter((r) => r.visible && r.logo && !isDeadLogo(r.logo)).slice(0, STRIP_LIMIT),
    [rows],
  );
  const inStrip = useMemo(() => new Set(strip.map((r) => r.brand)), [strip]);

  const filtered = rows.filter((r) => {
    if (filter === "none" && r.logo) return false;
    if (filter === "hidden" && r.visible) return false;
    if (search && !r.brand.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const withLogo = rows.filter((r) => r.logo).length;
  const hiddenCount = rows.filter((r) => !r.visible).length;

  return (
    <div>
      <input ref={fileInput} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {/* ── шапка ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Логотипи брендів</h2>
          <p className="text-sm text-muted">
            {withLogo} з {rows.length} мають лого · у стрічці {strip.length} із {STRIP_LIMIT}
            {hiddenCount > 0 && ` · приховано ${hiddenCount}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={hideAllWithoutLogo}
            className="rounded border border-line px-4 py-2 text-[12px] uppercase tracking-luxe text-ink hover:bg-[#f5f2ee]">
            Сховати без лого
          </button>
          <button onClick={downloadAll} disabled={busyDownload || busy}
            title="Завантажує лого з Logo.dev (потрібен LOGO_DEV_TOKEN) або з сайтів брендів і зберігає на диск."
            className="rounded border border-[#2f9488] px-4 py-2 text-[12px] uppercase tracking-luxe text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
            {busyDownload ? "Завантаження…" : "↓ На диск"}
          </button>
          <button onClick={autofill} disabled={busy || busyDownload}
            className="rounded bg-ink px-4 py-2 text-[12px] uppercase tracking-luxe text-paper disabled:opacity-50">
            {busy ? "…" : "Авто-наповнити"}
          </button>
        </div>
      </div>

      {/* ── прев'ю: рівно те, що побачить покупець ── */}
      <div className="mb-5 rounded border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-luxe text-muted">Стрічка на головній</p>
          <span className="text-[11px] text-muted">{strip.length} / {STRIP_LIMIT}</span>
        </div>
        {strip.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted">
            Жодного видимого бренду з логотипом — стрічка на головній не покажеться.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {strip.map((r) => (
              <li key={r.brand}
                className={`flex h-[58px] items-center justify-center rounded border border-line px-2 ${
                  r.bg === "dark" ? "bg-ink" : "bg-white"
                }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.logo!} alt={r.brand} className="max-h-8 max-w-full object-contain" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── панель збереження ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-line bg-[#f7f9fa] px-4 py-3">
        <p className="text-[12px] leading-relaxed text-ink/70">
          {reorderable
            ? "Тягніть за ручку ⠿ або стрілками ↑↓. Перші вісімнадцять видимих із лого потрапляють на головну."
            : "Щоб міняти порядок — зніміть пошук і фільтр: у відфільтрованому списку картка переїхала б не туди."}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <button onClick={() => load(false)}
              className="rounded border border-line px-3 py-2 text-[12px] uppercase tracking-luxe text-ink hover:bg-white">
              Скасувати
            </button>
          )}
          <button onClick={saveOrder} disabled={!dirty || savingOrder}
            className="rounded bg-ink px-4 py-2 text-[12px] uppercase tracking-luxe text-paper disabled:opacity-40">
            {savingOrder ? "Збереження…" : dirty ? "Зберегти" : "Збережено"}
          </button>
        </div>
      </div>

      {/* ── фільтри ── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук бренду…"
          className="w-64 rounded border border-line bg-white px-3 py-2 text-sm text-ink" />
        <div className="flex gap-1 text-[12px] uppercase tracking-luxe">
          {(["all", "none", "hidden"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded px-3 py-1.5 ${filter === f ? "bg-ink text-paper" : "bg-[#f0ede8] text-ink/70"}`}>
              {f === "all" ? "Усі" : f === "none" ? "Без лого" : `Приховані${hiddenCount ? ` (${hiddenCount})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Завантаження…</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((r, i) => {
            const src = SOURCE_LABEL[r.source] ?? SOURCE_LABEL.none;
            const dead = isDeadLogo(r.logo);
            const shown = inStrip.has(r.brand);
            const position = shown ? strip.findIndex((s) => s.brand === r.brand) + 1 : null;

            return (
              <li
                key={r.brand}
                onDragOver={(e) => { if (reorderable && dragIdx !== null) { e.preventDefault(); setOverIdx(i); } }}
                onDrop={() => { if (reorderable && dragIdx !== null) { applyMove(dragIdx, i); setDragIdx(null); setOverIdx(null); } }}
                className={`flex items-center gap-3 rounded border bg-white p-2.5 transition-all ${
                  dead ? "border-amber-300" : "border-line"
                } ${dragIdx === i ? "opacity-40" : ""} ${!r.visible ? "opacity-55" : ""} ${
                  overIdx === i && dragIdx !== null && dragIdx !== i ? "border-t-2 border-t-[#2f9488]" : ""
                }`}
              >
                {/* ручка: тягнемо лише за неї, щоб кнопки лишались клікабельними */}
                {reorderable && (
                  <div
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    title="Перетягнути"
                    className="flex h-9 w-6 flex-none cursor-grab items-center justify-center rounded text-ink/25 hover:bg-[#f5f2ee] hover:text-ink/60 active:cursor-grabbing"
                  >
                    ⠿
                  </div>
                )}

                {/* позиція у стрічці */}
                <div className="w-9 flex-none text-center">
                  {position ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2f9488] text-[11px] font-medium text-white">
                      {position}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-ink/25">—</span>
                  )}
                </div>

                {/* прев'ю логотипа на своєму фоні */}
                <div className={`flex h-11 w-24 flex-none items-center justify-center rounded border border-line ${
                  r.bg === "dark" ? "bg-ink" : "bg-[#f7f9fa]"
                }`}>
                  {r.logo && !dead ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo} alt={r.brand} className="max-h-8 max-w-[86px] object-contain" />
                  ) : (
                    <span className="px-1 text-center text-[10px] uppercase tracking-wide text-ink/50">{r.brand}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.brand}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                      style={{ background: dead ? "#fff3e0" : src.bg, color: dead ? "#e65100" : src.c }}>
                      {dead ? "⚠ мертвий CDN" : src.t}
                    </span>
                    {!r.visible && (
                      <span className="rounded bg-[#fdecea] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#c0524a]">
                        приховано
                      </span>
                    )}
                    {r.visible && r.logo && !shown && (
                      <span className="rounded bg-[#f5f2ee] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/50">
                        поза стрічкою
                      </span>
                    )}
                  </div>
                </div>

                {/* дії */}
                <div className="flex flex-none items-center gap-1">
                  {reorderable && (
                    <div className="mr-1 flex flex-col text-ink/30">
                      <button onClick={() => move(i, -1)} disabled={i === 0}
                        className="px-1 leading-none hover:text-ink disabled:opacity-25" aria-label="Вище">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === filtered.length - 1}
                        className="px-1 leading-none hover:text-ink disabled:opacity-25" aria-label="Нижче">↓</button>
                    </div>
                  )}

                  {reorderable && r.visible && r.logo && !shown && (
                    <button onClick={() => promote(i)} title="Підняти у стрічку"
                      className="rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-[#f5f2ee]">
                      ↥ У стрічку
                    </button>
                  )}

                  <button onClick={() => toggleVisible(r.brand)}
                    title={r.visible ? "Сховати зі стрічки" : "Показувати"}
                    className={`rounded border px-2 py-1 text-[11px] ${
                      r.visible ? "border-line text-ink hover:bg-[#f5f2ee]" : "border-[#c0524a] text-[#c0524a] hover:bg-[#fdecea]"
                    }`}>
                    {r.visible ? "👁" : "🚫"}
                  </button>

                  {r.logo && !dead && (
                    <button onClick={() => toggleBg(r)} disabled={busy}
                      title="Фон плитки: світлий або темний. Потрібен для білих логотипів."
                      className="rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-[#f5f2ee] disabled:opacity-50">
                      {r.bg === "dark" ? "◼" : "◻"}
                    </button>
                  )}

                  <button onClick={() => pickFile(r.brand)} disabled={busy}
                    className="rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-[#f5f2ee] disabled:opacity-50">
                    Замінити
                  </button>

                  {r.source !== "bundled" && r.source !== "none" && (
                    <button onClick={() => removeLogo(r.brand)}
                      className="rounded border border-line px-2 py-1 text-[11px] text-[#c62828] hover:bg-[#fdecea]">
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">Нічого не знайдено</li>
          )}
        </ul>
      )}
    </div>
  );
}
