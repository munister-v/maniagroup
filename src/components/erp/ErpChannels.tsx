"use client";

import { useCallback, useEffect, useState } from "react";

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
const inp = "h-9 rounded-[3px] border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";

type Counts = { count: number; units: number; value: number };

const FORMATS: { id: string; title: string; ext: string; desc: string; accent: string; feed?: string }[] = [
  { id: "csv",     title: "CSV прайс",        ext: "CSV",  desc: "Універсальний прайс-лист: артикул, ціна, залишок, розміри. Відкриється в Excel/Google Sheets.", accent: "#3f7d52", feed: "price.csv" },
  { id: "xlsx",    title: "Excel прайс",      ext: "XLSX", desc: "Той самий прайс у форматі Excel зі стилізованими колонками.", accent: "#1f6e43", feed: "price.xlsx" },
  { id: "prom",    title: "Prom.ua імпорт",   ext: "XLSX", desc: "Файл у форматі імпорту Prom.ua (українські колонки Код_товару, Ціна, Наявність…).", accent: "#5b8def", feed: "prom.xlsx" },
  { id: "rozetka", title: "Rozetka (YML)",    ext: "XML",  desc: "YML-фід для Rozetka Marketplace: пропозиції, ціни, наявність, розміри як параметри.", accent: "#7a3fd8", feed: "rozetka.xml" },
  { id: "google",  title: "Google Merchant",  ext: "XML",  desc: "RSS 2.0 фід для Google Merchant Center / Shopping (g:-namespace).", accent: "#d2562e", feed: "google.xml" },
];

const BASE_URL = "https://maniagroup.munister.com.ua";
// Channels worth exposing as a self-pulling live URL (marketplace fetches on schedule).
const LIVE_FEEDS = [
  { feed: "rozetka.xml", title: "Rozetka YML", accent: "#7a3fd8" },
  { feed: "google.xml",  title: "Google Merchant", accent: "#d2562e" },
  { feed: "prom.xlsx",   title: "Prom.ua", accent: "#5b8def" },
  { feed: "price.csv",   title: "CSV прайс", accent: "#3f7d52" },
];

export function ErpChannels() {
  const [scope, setScope] = useState<"instock" | "all">("instock");
  const [requireImage, setRequireImage] = useState(true);
  const [minPrice, setMinPrice] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  function copyFeed(feed: string) {
    const url = `${BASE_URL}/feed/${feed}`;
    navigator.clipboard?.writeText(url);
    setCopied(feed);
    setTimeout(() => setCopied((c) => (c === feed ? null : c)), 1800);
  }

  const params = useCallback(() => {
    const sp = new URLSearchParams({ scope });
    if (!requireImage) sp.set("requireImage", "0");
    if (minPrice && Number(minPrice) > 0) sp.set("minPrice", minPrice);
    return sp;
  }, [scope, requireImage, minPrice]);

  useEffect(() => {
    setLoading(true);
    const sp = params(); sp.set("count", "1");
    const t = setTimeout(() => {
      fetch(`/api/erp/export?${sp}`).then((r) => r.json()).then(setCounts).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [params]);

  function download(format: string) {
    const sp = params(); sp.set("format", format);
    const a = document.createElement("a");
    a.href = `/api/erp/export?${sp}`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Канали · Вигрузки</h1>
        <p className="text-[12px] text-[#9E9E9E]">Експорт прайсу та залишків у форматах майданчиків. Ціни й наявність — актуальні з бази на момент завантаження.</p>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <div className="flex items-center gap-0.5 rounded-[3px] border border-[#E0E0E0] p-0.5">
          {([["instock", "Лише в наявності"], ["all", "Весь каталог"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setScope(v)}
              className={`rounded-[2px] px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] transition-colors ${scope === v ? "bg-[#007B6E] text-white" : "text-[#9E9E9E] hover:text-[#007B6E]"}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[#212121]">
          <input type="checkbox" checked={requireImage} onChange={(e) => setRequireImage(e.target.checked)} className="h-4 w-4 accent-[#007B6E]" />
          Лише з фото
        </label>
        <label className="flex items-center gap-2 text-[12px] text-[#9E9E9E]">
          Ціна від
          <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" className={inp + " w-24"} />
          ₴
        </label>
      </div>

      {/* live preview */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Товарів у вигрузці", v: counts ? counts.count.toLocaleString("uk-UA") : "…" },
          { l: "Одиниць на складі", v: counts ? counts.units.toLocaleString("uk-UA") : "…" },
          { l: "Вартість залишку", v: counts ? uah(counts.value) : "…" },
        ].map((k) => (
          <div key={k.l} className="rounded-[4px] border border-[#E0E0E0] bg-white p-3">
            <p className={`text-[20px] font-light tabular-nums ${loading ? "opacity-40" : ""}`}>{k.v}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#9E9E9E]">{k.l}</p>
          </div>
        ))}
      </div>

      {/* format cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORMATS.map((f) => (
          <div key={f.id} className="flex flex-col justify-between rounded-[4px] border border-[#E0E0E0] bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-12 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: f.accent }}>{f.ext}</span>
              <div>
                <p className="text-[14px] text-[#212121]">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[#9E9E9E]">{f.desc}</p>
              </div>
            </div>
            <button onClick={() => download(f.id)} disabled={!counts || counts.count === 0}
              className="mt-4 h-9 rounded-[3px] bg-[#007B6E] px-4 text-[11px] uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-85 disabled:opacity-30">
              Завантажити {counts ? `(${counts.count.toLocaleString("uk-UA")})` : ""}
            </button>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[#BDBDBD]">
        Підказка: для Rozetka/Prom завантажений файл прив'язується в кабінеті майданчика; для Google Merchant — як запланований фід. Розміри з залишком ідуть як параметри пропозиції.
      </p>

      {/* ── Live feeds by URL (E6) ── */}
      <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-5 items-center rounded-full bg-[#007B6E]/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#007B6E]">Live</span>
          <h2 className="text-[14px] text-[#212121]">Живі фіди за посиланням</h2>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-[#9E9E9E]">
          Майданчик сам тягне фід за розкладом — нічого завантажувати вручну. Вставте посилання в кабінеті
          Rozetka / Prom / Google Merchant. Дані актуальні, кеш оновлюється кожні 30 хв. Завжди «лише в наявності + з фото».
        </p>
        <div className="space-y-2">
          {LIVE_FEEDS.map((f) => {
            const url = `${BASE_URL}/feed/${f.feed}`;
            return (
              <div key={f.feed} className="flex items-center gap-2 rounded-[3px] border border-[#EEEEEE] bg-[#FAFAFA] px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.accent }} />
                <span className="w-28 shrink-0 text-[12px] text-[#212121]">{f.title}</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#616161]">{url}</code>
                <a href={`/feed/${f.feed}`} target="_blank" rel="noreferrer"
                  className="shrink-0 text-[11px] text-[#9E9E9E] underline-offset-2 hover:text-[#007B6E] hover:underline">відкрити</a>
                <button onClick={() => copyFeed(f.feed)}
                  className="shrink-0 rounded-[3px] border border-[#E0E0E0] px-2.5 py-1 text-[11px] text-[#424242] transition-colors hover:border-[#007B6E] hover:text-[#007B6E]">
                  {copied === f.feed ? "✓ Скопійовано" : "Копіювати"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
