"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { SiteContent } from "@/lib/siteContent";
import { formatPrice, type Product } from "@/lib/catalog";

type Section = "content" | "products" | "backup" | "settings";

const NAV: { id: Section; label: string; d: string }[] = [
  { id: "content", label: "Контент", d: "M4 6h16M4 12h10M4 18h16" },
  {
    id: "products",
    label: "Товари",
    d: "M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z",
  },
  {
    id: "backup",
    label: "Резервні копії",
    d: "M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0L8 12m4 4V4",
  },
  {
    id: "settings",
    label: "Налаштування",
    d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0v2.5M12 9V6.5m4.243 6.743 1.767 1.768M5.99 8.99 4.222 7.222m8.021 8.021 1.768 1.767M5.99 15.01l-1.768 1.767M18.5 12H21m-10.5 0H8",
  },
];

function SvgIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d={d} />
    </svg>
  );
}

export function AdminDashboard({ initial }: { initial: SiteContent }) {
  const [section, setSection] = useState<Section>("content");
  const [content, setContent] = useState<SiteContent>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [unsaved, setUnsaved] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodSearch, setProdSearch] = useState("");
  const prodLoaded = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (section === "products" && !prodLoaded.current) {
      prodLoaded.current = true;
      loadProducts("");
    }
  }, [section]);

  async function loadProducts(q: string) {
    setProdLoading(true);
    try {
      const res = await fetch(`/api/admin/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (res.ok) setProducts(await res.json());
    } finally {
      setProdLoading(false);
    }
  }

  function update(fn: (c: SiteContent) => SiteContent) {
    setContent(fn);
    setUnsaved(true);
  }

  async function save() {
    setStatus("saving");
    const res = await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (res.ok) {
      setStatus("saved");
      setUnsaved(false);
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[60] flex overflow-hidden bg-[#f7f5f2] font-sans">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col bg-[#17130f] text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="font-display text-lg tracking-[0.14em]">MANIA GROUP</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/35">Адмін-панель</p>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex w-full items-center gap-3 rounded-[3px] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] transition-colors ${
                section === item.id
                  ? "bg-white/12 text-white"
                  : "text-white/40 hover:bg-white/6 hover:text-white/65"
              }`}
            >
              <SvgIcon d={item.d} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 px-2 py-3 space-y-0.5">
          <a
            href="/"
            target="_blank"
            className="flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:text-white/55"
          >
            <SvgIcon d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
            Сайт
          </a>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:text-white/55"
          >
            <SvgIcon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            Вийти
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e8e4de] bg-white px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-[#17130f]">
              {NAV.find((n) => n.id === section)?.label}
            </h1>
            {unsaved && section === "content" && (
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Незбережено
              </span>
            )}
          </div>
          {section === "content" && (
            <button
              onClick={save}
              disabled={status === "saving" || (!unsaved && status === "idle")}
              className={`h-8 rounded-[3px] px-5 text-[11px] uppercase tracking-[0.12em] transition-all ${
                status === "saved"
                  ? "bg-emerald-600 text-white"
                  : status === "error"
                  ? "bg-red-600 text-white"
                  : unsaved
                  ? "bg-[#17130f] text-white hover:opacity-85"
                  : "cursor-default bg-[#17130f]/10 text-[#17130f]/30"
              }`}
            >
              {status === "saving" ? "Зберігаємо…" : status === "saved" ? "✓ Збережено" : status === "error" ? "Помилка" : "Зберегти"}
            </button>
          )}
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-8 py-7">
          {section === "content" && <ContentSection content={content} update={update} />}
          {section === "products" && (
            <ProductsSection
              products={products}
              loading={prodLoading}
              search={prodSearch}
              onSearch={(q) => { setProdSearch(q); loadProducts(q); }}
              reload={() => loadProducts(prodSearch)}
            />
          )}
          {section === "backup" && <BackupSection />}
          {section === "settings" && <SettingsSection />}
        </main>
      </div>
    </div>
  );
}

/* ─── Content ─── */

function ContentSection({
  content,
  update,
}: {
  content: SiteContent;
  update: (fn: (c: SiteContent) => SiteContent) => void;
}) {
  function hero(field: keyof SiteContent["hero"], value: string) {
    update((c) => ({ ...c, hero: { ...c.hero, [field]: value } }));
  }
  function service(i: number, field: "title" | "text", value: string) {
    update((c) => ({
      ...c,
      services: c.services.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)),
    }));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card title="Рядок оголошень" subtitle="Відображається над меню на всіх сторінках">
        <Field label="Текст" value={content.announcement} onChange={(v) => update((c) => ({ ...c, announcement: v }))} />
      </Card>

      <Card title="Hero-блок" subtitle="Перший екран головної сторінки">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Надпис над заголовком" value={content.hero.eyebrow} onChange={(v) => hero("eyebrow", v)} />
          <Field label="Заголовок — рядок 1" value={content.hero.titleLine1} onChange={(v) => hero("titleLine1", v)} />
          <Field label="Акцентне слово (курсив)" value={content.hero.titleAccent} onChange={(v) => hero("titleAccent", v)} />
          <Field label="Підзаголовок" value={content.hero.subtitle} onChange={(v) => hero("subtitle", v)} textarea />
        </div>
      </Card>

      <Card title="Блоки переваг" subtitle="4 плашки перед футером">
        <div className="grid grid-cols-2 gap-4">
          {content.services.map((s, i) => (
            <div key={i} className="space-y-3 rounded-[3px] border border-[#eceae6] p-4">
              <p className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Блок {i + 1}</p>
              <Field label="Заголовок" value={s.title} onChange={(v) => service(i, "title", v)} />
              <Field label="Текст" value={s.text} onChange={(v) => service(i, "text", v)} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─── Products ─── */

type EditState = { id: string; regularPrice: string; salePrice: string };
type SaveStatus = "idle" | "saving" | "saved" | "error" | "no-creds";

function ProductsSection({
  products,
  loading,
  search,
  onSearch,
  reload,
}: {
  products: Product[];
  loading: boolean;
  search: string;
  onSearch: (q: string) => void;
  reload: () => void;
}) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  function startEdit(p: Product) {
    setSaveStatus("idle");
    setEditing({
      id: p.id,
      regularPrice: String(p.oldPrice ?? p.price),
      salePrice: p.oldPrice ? String(p.price) : "",
    });
  }

  function cancelEdit() {
    setEditing(null);
    setSaveStatus("idle");
  }

  async function saveEdit() {
    if (!editing) return;
    setSaveStatus("saving");
    const res = await fetch(`/api/admin/products/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regular_price: editing.regularPrice,
        sale_price: editing.salePrice || "",
      }),
    });
    if (res.status === 503) {
      setSaveStatus("no-creds");
      return;
    }
    if (res.ok) {
      setSaveStatus("saved");
      setEditing(null);
      reload();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } else {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  return (
    <div>
      {/* Search + status bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Пошук товарів…"
          className="h-9 w-72 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-sm text-[#17130f] placeholder:text-[#b9ae9b] focus:border-[#17130f] focus:outline-none"
        />
        {loading
          ? <span className="text-[11px] uppercase tracking-wider text-[#9c8f7d]">Завантаження…</span>
          : products.length > 0 && <span className="text-[11px] text-[#9c8f7d]">{products.length} товарів</span>
        }
        {saveStatus === "saved" && <span className="text-[11px] text-emerald-600">✓ Ціну оновлено в WooCommerce</span>}
        {saveStatus === "error" && <span className="text-[11px] text-red-600">Помилка збереження</span>}
        {saveStatus === "no-creds" && (
          <span className="text-[11px] text-amber-600">
            Додайте WOOCOMMERCE_KEY і WOOCOMMERCE_SECRET у .env.local
          </span>
        )}
      </div>

      {loading && products.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-[3px] bg-[#ede9e3]" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[3px] border border-[#e8e4de] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                <th className="w-10 px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Товар</th>
                <th className="px-4 py-3 text-left">Бренд</th>
                <th className="px-4 py-3 text-right">Звичайна ціна</th>
                <th className="px-4 py-3 text-right">Акційна ціна</th>
                <th className="px-4 py-3 text-center w-28">Статус</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {products.map((p, i) => {
                const isEditing = editing?.id === p.id;
                const regularPrice = p.oldPrice ?? p.price;
                const salePrice = p.oldPrice ? p.price : null;

                return (
                  <tr key={p.id} className={`transition-colors ${isEditing ? "bg-[#faf8f5]" : "hover:bg-[#fdfcfb]"}`}>
                    <td className="px-4 py-3 text-[11px] tabular-nums text-[#b9ae9b]">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          <div className="h-10 w-8 shrink-0 overflow-hidden rounded-[2px] bg-[#f0ece6]">
                            <Image src={p.image} alt={p.name} width={32} height={40} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-10 w-8 shrink-0 rounded-[2px]" style={{ backgroundColor: p.tone }} />
                        )}
                        <a href={`/product/${p.slug}`} target="_blank" className="font-medium text-[#17130f] hover:underline">
                          {p.name}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#9c8f7d]">{p.brand}</td>

                    {/* Ціна звичайна */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editing.regularPrice}
                          onChange={(e) => setEditing((v) => v && { ...v, regularPrice: e.target.value })}
                          className="h-8 w-28 rounded-[3px] border border-[#17130f]/30 bg-white px-2 text-right text-sm tabular-nums text-[#17130f] focus:border-[#17130f] focus:outline-none"
                          placeholder="0"
                          min="0"
                        />
                      ) : (
                        <span className="tabular-nums text-[#17130f]">{formatPrice(regularPrice)}</span>
                      )}
                    </td>

                    {/* Акційна ціна */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editing.salePrice}
                          onChange={(e) => setEditing((v) => v && { ...v, salePrice: e.target.value })}
                          className="h-8 w-28 rounded-[3px] border border-[#17130f]/30 bg-white px-2 text-right text-sm tabular-nums text-[#17130f] focus:border-[#17130f] focus:outline-none"
                          placeholder="0 = без акції"
                          min="0"
                        />
                      ) : salePrice != null ? (
                        <span className="font-medium tabular-nums text-[#b3392c]">{formatPrice(salePrice)}</span>
                      ) : (
                        <span className="text-[#d0c8be]">—</span>
                      )}
                    </td>

                    {/* Статус */}
                    <td className="px-4 py-3 text-center">
                      {isEditing && saveStatus === "saving" ? (
                        <span className="text-[10px] text-[#9c8f7d] uppercase tracking-wider">Збереження…</span>
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                          p.tag === "last" ? "bg-amber-50 text-amber-700" :
                          p.tag === "sale" ? "bg-red-50 text-red-600" :
                          "bg-emerald-50 text-emerald-700"
                        }`}>
                          {p.tag === "last" ? "Останній" : p.tag === "sale" ? "Sale" : "В наявності"}
                        </span>
                      )}
                    </td>

                    {/* Дії */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={saveEdit}
                            disabled={saveStatus === "saving"}
                            className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-[#17130f] text-white hover:opacity-80 disabled:opacity-40 transition-opacity"
                            title="Зберегти"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e8e4de] text-[#9c8f7d] hover:text-[#17130f] transition-colors"
                            title="Скасувати"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            onClick={() => startEdit(p)}
                            className="flex h-7 w-7 items-center justify-center rounded-[3px] text-[#b9ae9b] hover:bg-[#f0ece6] hover:text-[#17130f] transition-colors"
                            title="Редагувати ціну"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[#9c8f7d]">Товарів не знайдено</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-[#b9ae9b]">
        Редагування цін потребує WooCommerce REST API ключів (Read/Write) у .env.local
      </p>
    </div>
  );
}

/* ─── Backup ─── */

function BackupSection() {
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus("importing");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setImportStatus("success");
        setImportMsg("Контент відновлено. Перезавантажте сторінку.");
      } else {
        const err = await res.json().catch(() => ({}));
        setImportStatus("error");
        setImportMsg((err as { error?: string }).error ?? "Невірний формат файлу");
      }
    } catch {
      setImportStatus("error");
      setImportMsg("Помилка читання файлу");
    }
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => { setImportStatus("idle"); setImportMsg(""); }, 5000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Export */}
      <Card title="Резервна копія контенту" subtitle="Завантажує поточний стан: оголошення, hero, блоки переваг">
        <div className="flex items-center gap-4">
          <a
            href="/api/admin/export"
            download
            className="inline-flex h-9 items-center rounded-[3px] bg-[#17130f] px-5 text-[11px] uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-85"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0L8 12m4 4V4" />
            </svg>
            Завантажити JSON
          </a>
          <span className="text-[12px] text-[#9c8f7d]">maniagroup-backup-YYYY-MM-DD.json</span>
        </div>
      </Card>

      {/* Import */}
      <Card title="Відновлення з файлу" subtitle="Завантажте раніше збережену копію — перезапише поточний контент">
        <div className="flex flex-wrap items-center gap-4">
          <label className={`inline-flex h-9 cursor-pointer items-center rounded-[3px] border border-[#e8e4de] bg-white px-5 text-[11px] uppercase tracking-[0.12em] text-[#17130f] transition-colors hover:bg-[#f7f5f2] ${importStatus === "importing" ? "pointer-events-none opacity-50" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importStatus === "importing" ? "Відновлення…" : "Обрати файл .json"}
            <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </label>

          {importStatus === "success" && (
            <span className="text-[11px] text-emerald-600">✓ {importMsg}</span>
          )}
          {importStatus === "error" && (
            <span className="text-[11px] text-red-600">✗ {importMsg}</span>
          )}
        </div>
      </Card>

      {/* Info */}
      <Card title="Що зберігається" subtitle="">
        <ul className="space-y-2 text-[12px] text-[#9c8f7d]">
          {[
            "Рядок оголошень",
            "Заголовок та підзаголовок Hero-блоку",
            "Блоки переваг (4 плашки)",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#b9ae9b]" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-[#b9ae9b]">
          Ціни і товари зберігаються у WooCommerce і не входять до резервної копії.
        </p>
      </Card>
    </div>
  );
}

/* ─── Settings ─── */

function SettingsSection() {
  return (
    <div className="max-w-2xl space-y-6">
      <Card title="Сервер та API">
        <div className="space-y-3">
          <InfoRow label="Staging-домен" value="maniagroup.munister.com.ua" />
          <InfoRow label="WC Store API" value="maniagroup.com.ua/wp-json/wc/store" />
          <InfoRow label="VPS" value="173.242.49.73 · pm2 maniagroup · :3020" />
        </div>
      </Card>

      <Card title="WooCommerce REST API" subtitle="Потрібно для редагування цін товарів у розділі «Товари»">
        <div className="space-y-3">
          <p className="text-[12px] text-[#9c8f7d]">
            Згенеруйте ключі у WP Admin → WooCommerce → Налаштування → Додатково → REST API → «Додати ключ» (доступ: читання/запис).
          </p>
          <div className="rounded-[3px] border border-[#e8e4de] bg-[#f7f5f2] px-4 py-3 font-mono text-[12px] leading-relaxed text-[#9c8f7d]">
            WOOCOMMERCE_KEY=ck_xxxxxxxxxx<br />
            WOOCOMMERCE_SECRET=cs_xxxxxxxxxx
          </div>
          <p className="text-[11px] text-[#b9ae9b]">
            Додайте у файл .env.local на сервері та запустіть ./deploy.sh
          </p>
        </div>
      </Card>

      <Card title="Пароль адміна">
        <div className="rounded-[3px] border border-[#e8e4de] bg-[#f7f5f2] px-4 py-3 font-mono text-[12px] text-[#9c8f7d]">
          ADMIN_PASSWORD=ваш_новий_пароль
        </div>
        <p className="mt-2 text-[11px] text-[#b9ae9b]">Після зміни: ./deploy.sh</p>
      </Card>

      <Card title="Деплой">
        <div className="rounded-[3px] border border-[#e8e4de] bg-[#f7f5f2] px-4 py-3 font-mono text-[12px] text-[#9c8f7d]">
          ./deploy.sh
        </div>
        <p className="mt-2 text-[12px] text-[#b9ae9b]">
          git pull → npm build → pm2 restart — запускається з локального комп'ютера.
        </p>
      </Card>
    </div>
  );
}

/* ─── Helpers ─── */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-[#e8e4de] bg-white p-6">
      <div className="mb-5">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">{title}</h2>
        {subtitle && <p className="mt-1 text-[12px] text-[#b9ae9b]">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-32 shrink-0 text-[11px] uppercase tracking-wider text-[#9c8f7d]">{label}</span>
      <span className="font-mono text-[12px] text-[#17130f]">{value}</span>
    </div>
  );
}

function Field({
  label, value, onChange, textarea,
}: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-[#9c8f7d]">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-[3px] border border-[#e8e4de] bg-[#faf8f5] px-3 py-2 text-sm text-[#17130f] focus:border-[#17130f] focus:bg-white focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 h-9 w-full rounded-[3px] border border-[#e8e4de] bg-[#faf8f5] px-3 text-sm text-[#17130f] focus:border-[#17130f] focus:bg-white focus:outline-none"
        />
      )}
    </label>
  );
}
