"use client";

import { useEffect, useRef, useState } from "react";
import { ErpImport } from "./ErpImport";

/**
 * Intertop-style «Завантажити товари» — 4 tabs with numbered step-flows.
 * Renders inside a modal overlay (X handled by parent).
 */

type Tab = "products" | "template" | "price-template" | "price-upload";

const TABS: { id: Tab; label: string }[] = [
  { id: "products",       label: "Завантажити товари" },
  { id: "template",       label: "Вивантажити шаблон" },
  { id: "price-template", label: "Вигрузити шаблон цін/залишків" },
  { id: "price-upload",   label: "Завантажити ціни/залишки" },
];

const sel = "h-10 w-full appearance-none border border-[#E0E0E0] bg-white px-3 pr-8 text-[14px] text-[#212121] focus:border-[#007B6E] focus:outline-none";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#007B6E] text-[12px] font-semibold text-white">{n}</span>
      <div className="flex-1 pt-0.5 text-[14px] leading-relaxed text-[#424242]">{children}</div>
    </div>
  );
}

function Caret() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9E9E9E]"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const darkBtn = "px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white bg-[#212121] hover:bg-[#333] transition-colors disabled:opacity-40";
const tealBtn = "px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white bg-[#007B6E] hover:bg-[#006B5E] transition-colors disabled:opacity-40";

export function ErpImportTabs({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("products");

  return (
    <div className="flex flex-col">
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-[#E0E0E0] px-6 py-4">
        <h2 className="text-[18px] font-normal text-[#212121]">Завантажити товари</h2>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center text-[#9E9E9E] hover:text-[#212121] text-[20px] leading-none">✕</button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap border-b border-[#E0E0E0]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-[13px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id
                ? "border-[#007B6E] bg-[#007B6E] text-white"
                : "border-transparent text-[#616161] hover:text-[#007B6E] hover:border-[#007B6E]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[70vh] overflow-y-auto">
        {tab === "products"       && <ProductsTab onClose={onClose} />}
        {tab === "template"       && <TemplateTab onClose={onClose} />}
        {tab === "price-template" && <PriceTemplateTab />}
        {tab === "price-upload"   && <PriceUploadTab />}
      </div>
    </div>
  );
}

/* ── Tab 1: upload products (wraps the smart AI importer) ─────────────────── */

function ProductsTab({ onClose }: { onClose: () => void }) {
  return (
    <div className="p-6">
      <h3 className="mb-4 text-[16px] font-normal text-[#212121]">Завантажити товари</h3>
      <p className="mb-4 text-[13px] text-[#424242]">
        <b>Оберіть файл</b> для якого будуть оновлюватись товари.<br />
        Для завантаження використовуйте файл на основі раніше створеного шаблону з вкладки{" "}
        <button onClick={() => {}} className="text-[#007B6E] hover:underline">Вивантажити шаблон</button>.
      </p>
      <ErpImport onBack={onClose} />
    </div>
  );
}

/* ── Tab 2: export an editable product template ─────────────────────────────── */

function TemplateTab({ onClose }: { onClose: () => void }) {
  const [cats, setCats] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [type, setType] = useState("empty");

  useEffect(() => {
    fetch("/api/admin/products/facets").then((r) => r.json())
      .then((d) => setCats((d.categories ?? []).map((c: { name: string }) => c.name)))
      .catch(() => {});
  }, []);

  function createTemplate() {
    const sp = new URLSearchParams({ format: "xlsx", scope: "all" });
    if (category) sp.set("category", category);
    if (type === "empty") sp.set("empty", "1");
    const a = document.createElement("a");
    a.href = `/api/erp/export?${sp}`;
    a.click();
  }

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[18px] font-normal text-[#212121]">Створення шаблона</h3>
      <div className="space-y-6">
        <Step n={1}>
          <p className="mb-2.5">
            <span className="text-[#007B6E] font-medium">Виберіть категорію</span> товарів, для яких ви хочете створити шаблон
          </p>
          <div className="relative max-w-md">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
              <option value="">Усі категорії</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Caret />
          </div>
        </Step>
        <Step n={2}>
          <p className="mb-2.5">
            <span className="text-[#007B6E] font-medium">Виберіть тип шаблону.</span> Тип шаблону впливає на його наповнення:<br />
            <span className="text-[12px] text-[#9E9E9E]">(Формування шаблону може зайняти кілька хвилин)</span>
          </p>
          <div className="relative max-w-md">
            <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
              <option value="empty">Пустий шаблон</option>
              <option value="filled">Шаблон з товарами</option>
            </select>
            <Caret />
          </div>
        </Step>
        <Step n={3}>
          <p className="mb-2.5">
            <span className="text-[#007B6E] font-medium">Створіть шаблон</span> файл для додавання/оновлення товарів
          </p>
          <button onClick={createTemplate} className={darkBtn}>Створіть шаблон</button>
        </Step>
        <Step n={4}>
          Відредагуйте створений шаблон в Excel, Google Sheets або будь-якому зручному табличному редакторі.
          Довідкові значення для властивостей можна знайти у вкладці{" "}
          <button className="text-[#007B6E] hover:underline">Інформація</button>
        </Step>
        <Step n={5}>
          Завантажте відредагований шаблон використовуючи форму у вкладці{" "}
          <button onClick={onClose} className="text-[#007B6E] hover:underline">Завантажити товари</button>.
        </Step>
      </div>
    </div>
  );
}

/* ── Tab 3: export a price/stock template ────────────────────────────────────── */

function PriceTemplateTab() {
  const [format, setFormat] = useState("csv");
  const [type, setType] = useState("all");
  const [email, setEmail] = useState("");

  function create() {
    const fmt = format === "xlsx" ? "xlsx" : "csv";
    const sp = new URLSearchParams({ format: fmt, scope: type === "instock" ? "instock" : "all" });
    const a = document.createElement("a");
    a.href = `/api/erp/export?${sp}`;
    a.click();
  }

  return (
    <div className="p-6">
      <h3 className="mb-5 text-[18px] font-normal text-[#212121]">Створити файл з цінами/залишками торгових пропозицій</h3>
      <div className="space-y-6">
        <Step n={1}>
          <p className="mb-2.5"><span className="text-[#007B6E] font-medium">Виберіть формат</span> товарів, для яких ви хочете створити шаблон</p>
          <div className="relative max-w-md">
            <select value={format} onChange={(e) => setFormat(e.target.value)} className={sel}>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel (XLSX)</option>
            </select>
            <Caret />
          </div>
        </Step>
        <Step n={2}>
          <p className="mb-2.5"><span className="text-[#007B6E] font-medium">Виберіть тип шаблону.</span> Тип шаблону впливає на його наповнення</p>
          <div className="relative max-w-md">
            <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
              <option value="all">Всі товари</option>
              <option value="instock">Лише в наявності</option>
            </select>
            <Caret />
          </div>
        </Step>
        <Step n={3}>
          <p className="mb-2.5"><span className="text-[#007B6E] font-medium">Електронна пошта</span> для відправки файлу</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Залиште порожнім — файл збережеться одразу на комп'ютер"
            className="h-10 w-full max-w-md border border-[#E0E0E0] bg-white px-3 text-[14px] focus:border-[#007B6E] focus:outline-none" />
          <p className="mt-1.5 text-[12px] text-[#9E9E9E]">
            Вивантаження до 5 тис торгівельних пропозицій буде одразу збережено на комп'ютер, понад 5 тис — відправлено на електронну пошту
          </p>
        </Step>
        <Step n={4}>
          <p className="mb-2.5"><span className="text-[#007B6E] font-medium">Створіть шаблон</span> файлу для оновлення цін/залишків</p>
          <button onClick={create} className={darkBtn}>Створіть шаблон</button>
        </Step>
      </div>
    </div>
  );
}

/* ── Tab 4: upload prices/stock ─────────────────────────────────────────────── */

function PriceUploadTab() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setSavedUrl(localStorage.getItem("mg_price_feed_url") ?? "");
      setSavedAt(localStorage.getItem("mg_price_feed_saved_at") ?? "");
    } catch {}
  }, []);

  function saveUrl() {
    try {
      const now = new Date().toLocaleString("uk-UA");
      localStorage.setItem("mg_price_feed_url", url.trim());
      localStorage.setItem("mg_price_feed_saved_at", now);
      setSavedUrl(url.trim());
      setSavedAt(now);
    } catch {}
  }

  return (
    <div className="space-y-4 p-6">
      {/* Upload area */}
      <div className="border border-[#E0E0E0] bg-white p-5">
        <h3 className="mb-4 text-[16px] font-normal text-[#212121]">Оновлення цін і залишків торгових пропозицій</h3>
        <div className="flex items-center gap-3">
          <label className="flex h-10 flex-1 max-w-sm cursor-pointer items-center border border-[#E0E0E0] bg-white text-[13px] text-[#9E9E9E] hover:border-[#007B6E]">
            <span className="flex-1 px-3 truncate">{file ? file.name : "No file chosen"}</span>
            <span className="flex h-full items-center border-l border-[#E0E0E0] px-3 text-[#424242] bg-[#FAFAFA]">Browse</span>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button disabled={!file} className={darkBtn + " disabled:opacity-40"}>
            Завантажити приклад файлу
          </button>
        </div>
        <p className="mt-3 text-[12px] text-[#9E9E9E]">
          Оновлення цін та залишків відбувається в середньому через 5 хв. якщо немає черги на оновлення.
        </p>
      </div>

      {/* URL feed */}
      <div className="border border-[#E0E0E0] bg-white p-5">
        <p className="mb-3 text-[13px] text-[#424242]">Посилання на файл з цінами/залишками по якому буде автоматичне оновлення</p>
        <div className="flex items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
            className="h-10 flex-1 border border-[#E0E0E0] bg-white px-3 text-[14px] focus:border-[#007B6E] focus:outline-none" />
          <button onClick={saveUrl} className={darkBtn}>Зберегти посилання на файл</button>
        </div>
        {savedAt && (
          <div className="mt-3 text-[12px] text-[#9E9E9E]">
            <p>Посилання збережено о</p>
            <p className="font-medium text-[#424242]">{savedAt}</p>
            {savedUrl && (
              <p className="mt-1">Останнє оновлення у файлі</p>
            )}
            {savedUrl && <a href={savedUrl} target="_blank" rel="noreferrer" className="text-[#007B6E] hover:underline">Останній лог загрузки</a>}
          </div>
        )}
      </div>
    </div>
  );
}
