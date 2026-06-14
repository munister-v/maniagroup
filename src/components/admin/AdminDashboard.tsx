"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { SiteContent } from "@/lib/siteContent";
import { formatPrice, type Product } from "@/lib/catalog";

type Section = "content" | "products" | "settings";

const NAV: { id: Section; label: string; d: string }[] = [
  { id: "content", label: "Контент", d: "M4 6h16M4 12h10M4 18h16" },
  {
    id: "products",
    label: "Товари",
    d: "M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z",
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
            {unsaved && (
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
              {status === "saving"
                ? "Зберігаємо…"
                : status === "saved"
                ? "✓ Збережено"
                : status === "error"
                ? "Помилка"
                : "Зберегти"}
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
            />
          )}
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
        <Field
          label="Текст"
          value={content.announcement}
          onChange={(v) => update((c) => ({ ...c, announcement: v }))}
        />
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

function ProductsSection({
  products,
  loading,
  search,
  onSearch,
}: {
  products: Product[];
  loading: boolean;
  search: string;
  onSearch: (q: string) => void;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
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
                <th className="px-4 py-3 text-left">Категорія</th>
                <th className="px-4 py-3 text-right">Ціна</th>
                <th className="px-4 py-3 text-center">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {products.map((p, i) => (
                <tr key={p.id} className="group transition-colors hover:bg-[#faf8f5]">
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
                      <a href={`/product/${p.slug}`} target="_blank" className="font-medium text-[#17130f] group-hover:underline">
                        {p.name}
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#9c8f7d]">{p.brand}</td>
                  <td className="px-4 py-3 text-[12px] text-[#9c8f7d]">{p.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={p.oldPrice ? "font-medium text-[#b3392c]" : "text-[#17130f]"}>
                      {formatPrice(p.price)}
                    </span>
                    {p.oldPrice && (
                      <span className="ml-2 text-[11px] text-[#9c8f7d] line-through">{formatPrice(p.oldPrice)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      p.tag === "last" ? "bg-amber-50 text-amber-700" : p.tag === "sale" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
                    }`}>
                      {p.tag === "last" ? "Останній" : p.tag === "sale" ? "Sale" : "В наявності"}
                    </span>
                  </td>
                </tr>
              ))}
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#9c8f7d]">Товарів не знайдено</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Settings ─── */

function SettingsSection() {
  return (
    <div className="max-w-2xl space-y-6">
      <Card title="Загальна інформація">
        <div className="space-y-3">
          <InfoRow label="Staging-домен" value="maniagroup.munister.com.ua" />
          <InfoRow label="Живий магазин" value="maniagroup.com.ua (WordPress)" />
          <InfoRow label="WC Store API" value="maniagroup.com.ua/wp-json/wc/store" />
          <InfoRow label="VPS" value="173.242.49.73 · pm2 maniagroup · port 3020" />
        </div>
      </Card>

      <Card title="Пароль адміна" subtitle="Змінити — оновіть змінну ADMIN_PASSWORD в .env.local та перезапустіть">
        <div className="rounded-[3px] border border-[#e8e4de] bg-[#f7f5f2] px-4 py-3 font-mono text-[12px] text-[#9c8f7d]">
          ADMIN_PASSWORD=ваш_новий_пароль
        </div>
      </Card>

      <Card title="Деплой">
        <div className="rounded-[3px] border border-[#e8e4de] bg-[#f7f5f2] px-4 py-3 font-mono text-[12px] text-[#9c8f7d]">
          ./deploy.sh
        </div>
        <p className="mt-2 text-[12px] text-[#b9ae9b]">
          Запускається локально — git pull + npm build + pm2 restart на VPS.
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
      <span className="w-36 shrink-0 text-[11px] uppercase tracking-wider text-[#9c8f7d]">{label}</span>
      <span className="font-mono text-[12px] text-[#17130f]">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
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
