"use client";

import { useEffect, useRef, useState } from "react";

type Row = { brand: string; slug: string; logo: string | null; source: string };

const SOURCE_LABEL: Record<string, { t: string; bg: string; c: string }> = {
  manual: { t: "Вручну", bg: "#e8f5e9", c: "#2e7d32" },
  auto: { t: "Авто (локально)", bg: "#e3f2fd", c: "#1565c0" },
  bundled: { t: "Вбудовано", bg: "#f3e5f5", c: "#6a1b9a" },
  none: { t: "Немає", bg: "#f5f5f4", c: "#8a8278" },
};

export function AdminBrandLogos({ onToast }: { onToast?: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "none">("all");
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch("/api/admin/brand-logos", { cache: "no-store" });
    const d = await r.json();
    setRows(d.brands ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch("/api/admin/brand-logos", { cache: "no-store" });
      const d = await r.json();
      if (alive) { setRows(d.brands ?? []); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

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

  async function setLogo(brand: string, logoUrl: string) {
    await fetch("/api/admin/brand-logos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, logoUrl }),
    });
    await load();
  }

  async function removeLogo(brand: string) {
    await fetch(`/api/admin/brand-logos?brand=${encodeURIComponent(brand)}`, { method: "DELETE" });
    onToast?.(`Логотип «${brand}» прибрано`);
    await load();
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
      await setLogo(brand, ud.url);
      onToast?.(`Логотип «${brand}» оновлено`);
    } finally { setBusy(false); }
  }

  const filtered = rows.filter((r) => {
    if (filter === "none" && r.logo) return false;
    if (search && !r.brand.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const withLogo = rows.filter((r) => r.logo).length;

  return (
    <div>
      <input ref={fileInput} type="file" accept="image/*" onChange={onFile} className="hidden" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Логотипи брендів</h2>
          <p className="text-sm text-muted">
            {withLogo} з {rows.length} брендів мають лого.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadAll}
            disabled={busyDownload || busy}
            className="rounded border border-[#17130f] px-4 py-2 text-[12px] uppercase tracking-luxe text-[#17130f] hover:bg-[#17130f] hover:text-white disabled:opacity-50"
            title="Завантажує лого з Logo.dev (потрібен LOGO_DEV_TOKEN у .env.local) або з сайтів брендів. Зберігає на диск — більше не залежить від зовнішніх CDN."
          >
            {busyDownload ? "Завантаження…" : "↓ Завантажити на диск"}
          </button>
          <button
            onClick={autofill}
            disabled={busy || busyDownload}
            className="rounded bg-ink px-4 py-2 text-[12px] uppercase tracking-luxe text-paper disabled:opacity-50"
          >
            {busy ? "…" : "Авто-наповнити"}
          </button>
        </div>
      </div>

      {/* Hint about Logo.dev token */}
      <div className="mb-5 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900 leading-relaxed">
        <strong>Для авто-завантаження лого:</strong> зареєструйтесь безкоштовно на{" "}
        <span className="font-mono">logo.dev</span> → отримайте <span className="font-mono">pk_…</span> токен →
        додайте до <span className="font-mono">/opt/maniagroup/.env.local</span> рядок{" "}
        <span className="font-mono">LOGO_DEV_TOKEN=pk_ваш_токен</span> → натисніть «↓ Завантажити на диск».
        Лого зберігаються постійно — зовнішній CDN більше не потрібен.
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук бренду…"
          className="w-64 rounded border border-line bg-white px-3 py-2 text-sm text-ink"
        />
        <div className="flex gap-1 text-[12px] uppercase tracking-luxe">
          {(["all", "none"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1.5 ${filter === f ? "bg-ink text-paper" : "bg-[#f0ede8] text-ink/70"}`}
            >
              {f === "all" ? "Усі" : "Без лого"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Завантаження…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const src = SOURCE_LABEL[r.source] ?? SOURCE_LABEL.none;
            const isBroken = r.logo?.includes("clearbit.com") || r.logo?.includes("logo.clearbit");
            return (
              <div key={r.brand} className={`flex items-center gap-3 rounded border bg-white p-3 ${isBroken ? "border-amber-300" : "border-line"}`}>
                <div className="flex h-12 w-24 flex-none items-center justify-center rounded bg-[#faf8f5]">
                  {r.logo && !isBroken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.logo} alt={r.brand} className="max-h-9 max-w-[88px] object-contain" />
                  ) : (
                    <span className="px-1 text-center text-[10px] uppercase tracking-wide text-ink/50">{r.brand}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.brand}</p>
                  <span
                    className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{ background: isBroken ? "#fff3e0" : src.bg, color: isBroken ? "#e65100" : src.c }}
                  >
                    {isBroken ? "⚠ Clearbit (мертвий)" : src.t}
                  </span>
                </div>
                <div className="flex flex-none flex-col gap-1">
                  <button
                    onClick={() => pickFile(r.brand)}
                    disabled={busy}
                    className="rounded border border-line px-2 py-1 text-[11px] text-ink hover:bg-[#f5f2ee] disabled:opacity-50"
                  >
                    Завантажити
                  </button>
                  {r.source !== "bundled" && r.source !== "none" && (
                    <button
                      onClick={() => removeLogo(r.brand)}
                      className="rounded border border-line px-2 py-1 text-[11px] text-[#c62828] hover:bg-[#fdecea]"
                    >
                      Прибрати
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
