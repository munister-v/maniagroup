"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SiteContent } from "@/lib/siteContent";
import { HOME_SECTIONS } from "@/lib/homeSections";
import { AdminOrders } from "./AdminOrders";
import { AdminCustomers } from "./AdminCustomers";
import { ContentStudio } from "./ContentStudio";
import { CatalogGrid } from "./CatalogGrid";
import { AdminVariants } from "./AdminVariants";
import { AdminClassifier } from "./AdminClassifier";
import { AdminProperties } from "./AdminProperties";
import { AdminSizeCharts } from "./AdminSizeCharts";
import { AdminImportTemplates } from "./AdminImportTemplates";
import { AdminBrandLogos } from "./AdminBrandLogos";
import { AdminAccounting } from "./AdminAccounting";
import { MonitoringSection } from "./MonitoringSection";
import { ErpImportTabs } from "@/components/erp/ErpImportTabs";
import { AiAssistant, AiInsights } from "./AiAssistant";

/* ─── Types ─── */

type Section = "overview" | "content" | "media" | "catalog" | "products" | "offers" | "properties" | "sizeCharts" | "classifier" | "importTemplates" | "brands" | "orders" | "customers" | "coupons" | "subscribers" | "accounting" | "monitoring" | "backup" | "settings";

type RecentOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  billing: { first_name: string; last_name: string; phone: string; email: string };
  total: string;
  currency_symbol: string;
};

type Stats = {
  products_total: number;
  in_stock: number;
  out_of_stock: number;
  no_photo_live: number;
  orders_total: number;
  pending: number;
  processing: number;
  on_hold: number;
  completed: number;
  new_orders_7d: number;
  revenue_30d: number;
  revenue_7d: number;
  avg_order: number;
  new_customers_30d: number;
  revenue_series: { day: string; total: number }[];
  top_products: { product_id: string; name: string; brand: string; qty: number; revenue: number }[];
};

type SyncState = {
  status: "idle" | "syncing" | "done" | "error";
  last_sync: string;
  total_products: number;
  error: string;
};


/* ─── Nav ─── */

/** Rail item: a plain leaf section, or an expandable group whose children are
 *  sections (Intertop's «Товари» group with a hover-flyout submenu). */
type RailItem =
  | { kind: "leaf"; id: Section; label: string; d: string }
  | { kind: "group"; key: string; label: string; d: string; children: { id: Section; label: string }[] };

const NAV_MAIN: RailItem[] = [
  {
    kind: "leaf",
    id: "overview",
    label: "Огляд",
    d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    kind: "group",
    key: "products",
    label: "Товари",
    d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    children: [
      { id: "products", label: "Список товарів" },
      { id: "offers", label: "Торгові пропозиції" },
      { id: "properties", label: "Властивості товарів" },
      { id: "catalog", label: "Імпорт" },
      { id: "importTemplates", label: "Шаблони даних" },
      { id: "sizeCharts", label: "Розмірні сітки" },
      { id: "classifier", label: "Класифікатор товарів" },
    ],
  },
  {
    kind: "leaf",
    id: "orders",
    label: "Замовлення",
    d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  },
  {
    kind: "leaf",
    id: "customers",
    label: "Клієнти",
    d: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 100-6",
  },
  {
    kind: "leaf",
    id: "coupons",
    label: "Промокоди",
    d: "M9 5H4a1 1 0 00-1 1v3a2 2 0 010 4v3a1 1 0 001 1h5m0-16h11a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H9m0-16v16",
  },
  {
    kind: "leaf",
    id: "subscribers",
    label: "Підписники",
    d: "M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  {
    kind: "leaf",
    id: "accounting",
    label: "Облік",
    d: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
];

/** Flat list of every navigable section label (leaves + group children +
 *  admin items) for topbar title resolution. */
const SECTION_LABELS: Partial<Record<Section, string>> = (() => {
  const m: Partial<Record<Section, string>> = {};
  for (const it of NAV_MAIN) {
    if (it.kind === "leaf") m[it.id] = it.label;
    else for (const c of it.children) m[c.id] = c.label;
  }
  return m;
})();

const NAV_ADMIN: { id: Section; label: string; d: string }[] = [
  {
    id: "brands",
    label: "Бренди",
    d: "M3 7h18M3 12h18M3 17h18",
  },
  {
    id: "media",
    label: "Медіа",
    d: "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm2 11l4-5 3 4 2-2 3 3M9 10a1 1 0 100-2 1 1 0 000 2z",
  },
  {
    id: "content",
    label: "Контент",
    d: "M4 6h16M4 12h10M4 18h16",
  },
  {
    id: "monitoring",
    label: "Моніторинг",
    d: "M3 12h4l3 8 4-16 3 8h4",
  },
  {
    id: "backup",
    label: "Резервні копії",
    d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  },
  {
    id: "settings",
    label: "Налаштування",
    d: "M12 15a3 3 0 100-6 3 3 0 000 6zm0 0v2.5M12 9V6.5m4.243 6.743l1.767 1.768M5.99 8.99L4.222 7.222m8.021 8.021l1.768 1.767M5.99 15.01l-1.768 1.767M18.5 12H21m-10.5 0H8",
  },
];

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending:    { label: "Очікує оплати", bg: "#fff8e1", color: "#92600a" },
  processing: { label: "В обробці",     bg: "#e3f2fd", color: "#1565c0" },
  "on-hold":  { label: "На утриманні",  bg: "#fff3e0", color: "#bf360c" },
  completed:  { label: "Виконано",      bg: "#e8f5e9", color: "#2e7d32" },
  cancelled:  { label: "Скасовано",     bg: "#ffebee", color: "#c62828" },
  refunded:   { label: "Повернуто",     bg: "#f3e5f5", color: "#6a1b9a" },
  failed:     { label: "Помилка",       bg: "#ffebee", color: "#c62828" },
};

function SvgIcon({ d, className = "h-4 w-4 shrink-0" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

/** Placeholder for nav sections that exist in the Intertop menu but aren't a
 *  full feature yet (Властивості товарів, Розмірні сітки). */
function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="mb-4 text-[22px] font-semibold tracking-tight text-[#2b2d42]">{title}</h2>
      <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[#d5dbe0] bg-white px-6 py-20 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2f3] text-[#8a94a0]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 8v4l3 3M12 21a9 9 0 100-18 9 9 0 000 18z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <p className="text-[14px] font-medium text-[#2b2d42]">Екран у розробці</p>
        <p className="mt-1 max-w-md text-[13px] text-[#8a94a0]">{note}</p>
      </div>
    </div>
  );
}

/* ─── Root ─── */

export function AdminDashboard({
  initial,
}: {
  initial: SiteContent;
  hasWcCreds?: boolean;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [content, setContent] = useState<SiteContent>(initial);

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["products"]));
  // Bumped after an import so Overview + Catalog + facets re-read fresh data.
  const [dataVersion, setDataVersion] = useState(0);
  // One-shot filter request for the Catalog grid — e.g. the Overview's "N
  // товарів без фото" task jumps straight to that pre-filtered list instead
  // of dropping the admin on an unfiltered table they have to filter by hand.
  const [catalogFocus, setCatalogFocus] = useState<{ stock?: string; siteStatus?: string; token: number } | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function goToImport() {
    setSection("catalog");
    setNavOpen(false);
  }
  function goToCatalog() {
    setSection("products");
    setNavOpen(false);
  }
  function goToCatalogFocus(focus: { stock?: string; siteStatus?: string }) {
    setCatalogFocus({ ...focus, token: Date.now() });
    setSection("products");
    setNavOpen(false);
  }

  const router = useRouter();

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2600);
  }

  // Refetch dashboard KPIs + sync state. Called on mount, when the user opens
  // the Overview, and after an import (dataVersion bump) so nothing goes stale.
  const loadDashboard = useCallback(() => {
    fetch("/api/admin/stats").then((r) => r.json()).then((data: Stats) => setStats(data)).catch(() => {});
    fetch("/api/admin/orders?per_page=6")
      .then((r) => r.json())
      .then((d: { orders?: RecentOrder[] }) => setRecentOrders(d.orders ?? []))
      .catch(() => {});
    fetch("/api/admin/sync").then((r) => r.json()).then((s: SyncState) => setSync(s)).catch(() => {});
  }, []);

  useEffect(() => {
    if (section === "overview") loadDashboard();
  }, [section, dataVersion, loadDashboard]);

  function update(fn: (c: SiteContent) => SiteContent) {
    setContent(fn);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const navLabel = SECTION_LABELS[section] ?? NAV_ADMIN.find((n) => n.id === section)?.label ?? "";

  return (
    <div className="fixed inset-0 z-[60] flex overflow-hidden bg-[#f4f6f7] font-sans text-[#2b2d42]">
      {/* Mobile backdrop */}
      {navOpen && <div onClick={() => setNavOpen(false)} className="fixed inset-0 z-[65] bg-black/40 md:hidden" />}

      {/* Sidebar — Intertop-style wide panel with text labels + accordion groups */}
      <aside className={`fixed inset-y-0 left-0 z-[70] flex w-64 shrink-0 flex-col bg-[#2b2d42] text-white transition-transform duration-300 md:static md:z-auto md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Wordmark */}
        <div className="flex h-14 w-full shrink-0 flex-col justify-center border-b border-white/10 px-5">
          <span className="text-[15px] font-bold leading-none tracking-[0.08em] text-white">MANIA GROUP</span>
          <span className="mt-1 text-[9px] font-medium uppercase leading-none tracking-[0.16em] text-white/40">admin</span>
        </div>

        <nav className="flex w-full flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
          {NAV_MAIN.map((item) => {
            if (item.kind === "group") {
              const groupActive = item.children.some((c) => c.id === section);
              const open = openGroups.has(item.key);
              return (
                <div key={item.key}>
                  <button
                    onClick={() => setOpenGroups((s) => { const n = new Set(s); n.has(item.key) ? n.delete(item.key) : n.add(item.key); return n; })}
                    className={`flex h-10 w-full shrink-0 items-center gap-3 rounded-[8px] px-3 text-[13px] font-medium transition-colors ${
                      groupActive ? "bg-[#2f9488] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <SvgIcon d={item.d} className="h-5 w-5 shrink-0" />
                    <span className="flex-1 truncate text-left">{item.label}</span>
                    <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {open && (
                    <div className="mt-0.5 flex flex-col gap-0.5 py-0.5 pl-[34px]">
                      {item.children.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { setSection(c.id); setNavOpen(false); }}
                          className={`rounded-[6px] px-3 py-2 text-left text-[13px] transition-colors ${
                            section === c.id ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                key={item.id}
                onClick={() => { setSection(item.id); setNavOpen(false); }}
                className={`relative flex h-10 w-full shrink-0 items-center gap-3 rounded-[8px] px-3 text-[13px] font-medium transition-colors ${
                  section === item.id ? "bg-[#2f9488] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <SvgIcon d={item.d} className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate text-left">{item.label}</span>
                {item.id === "orders" && stats && stats.pending + stats.processing > 0 && (
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#e5484d] px-1 text-[9px] font-medium tabular-nums text-white">
                    {stats.pending + stats.processing}
                  </span>
                )}
              </button>
            );
          })}

          <div className="my-2 h-px w-full shrink-0 bg-white/10" />

          {NAV_ADMIN.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSection(item.id); setNavOpen(false); }}
              className={`flex h-10 w-full shrink-0 items-center gap-3 rounded-[8px] px-3 text-[13px] font-medium transition-colors ${
                section === item.id ? "bg-[#2f9488] text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              <SvgIcon d={item.d} className="h-5 w-5 shrink-0" />
              <span className="flex-1 truncate text-left">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex w-full shrink-0 flex-col gap-0.5 border-t border-white/10 px-2.5 py-3">
          <a
            href="/"
            target="_blank"
            className="flex h-10 w-full items-center gap-3 rounded-[8px] px-3 text-[13px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <SvgIcon d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate text-left">Сайт</span>
          </a>
          <button
            onClick={logout}
            className="flex h-10 w-full items-center gap-3 rounded-[8px] px-3 text-[13px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <SvgIcon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate text-left">Вийти</span>
          </button>
          <div className="mt-1 flex items-center gap-2 px-3 py-1">
            <span className="flex h-6 w-8 items-center justify-center rounded-[5px] border border-white/25 text-[11px] font-semibold tracking-wide text-white/60">UA</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e6eaec] bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setNavOpen(true)} aria-label="Меню" className="-ml-1 text-[#2b2d42] md:hidden">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
            </button>
            <h1 className="text-[19px] font-semibold tracking-tight text-[#2b2d42]">{navLabel}</h1>
          </div>
          <div className="flex items-center gap-3" />
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-7">
          {section === "overview" && (
            <OverviewSection
              stats={stats}
              recentOrders={recentOrders}
              sync={sync}
              onNavigate={setSection}
              onFocusCatalog={goToCatalogFocus}
              onImport={goToImport}
            />
          )}
          {section === "content" && (
            <ContentStudio
              content={content}
              setContent={setContent}
              showToast={showToast}
              editor={<ContentSection content={content} update={update} />}
            />
          )}
          {section === "media" && <MediaSection onToast={showToast} />}
          {section === "catalog" && (
            <ErpImportTabs
              onImported={(msg) => { showToast(msg); setDataVersion((v) => v + 1); }}
              onGoToCatalog={goToCatalog}
            />
          )}
          {section === "products" && (
            <CatalogGrid onToast={showToast} onImport={goToImport} dataVersion={dataVersion} focus={catalogFocus} />
          )}
          {section === "offers" && <AdminVariants onToast={showToast} onImport={goToImport} />}
          {section === "classifier" && <AdminClassifier />}
          {section === "properties" && <AdminProperties />}
          {section === "sizeCharts" && <AdminSizeCharts />}
          {section === "importTemplates" && <AdminImportTemplates />}
          {section === "brands" && <AdminBrandLogos onToast={showToast} />}
          {section === "orders" && <AdminOrders onToast={showToast} />}
          {section === "customers" && <AdminCustomers />}
          {section === "coupons" && <CouponsSection onToast={showToast} />}
          {section === "subscribers" && <SubscribersSection />}
          {section === "accounting" && <AdminAccounting onToast={showToast} />}
          {section === "monitoring" && <MonitoringSection />}
          {section === "backup" && <BackupSection />}
          {section === "settings" && <SettingsSection />}
        </main>
      </div>

      {/* AI floating assistant */}
      <AiAssistant />

{/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-[4px] bg-[#2b2d42] px-5 py-3 text-[12px] tracking-wide text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ─── Overview ─── */

function fmtUah(n: number) {
  return n.toLocaleString("uk-UA") + " ₴";
}

/* Intertop-style donut + legend (Головна → «Статуси замовлень» / «Товари»).
   Segments render as arcs on one SVG circle via stroke-dasharray. */
function DonutChart({ title, centerLabel, segments }: {
  title: string; centerLabel?: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const active = segments.filter((s) => s.value > 0);
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="rounded-[6px] border border-[#e6eaec] bg-white p-5">
      <h2 className="mb-4 text-[13px] font-semibold text-[#2b2d42]">{title}</h2>
      <div className="flex items-center gap-6">
        <div className="relative h-[140px] w-[140px] shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f3" strokeWidth="16" />
            {active.map((s) => {
              const len = total > 0 ? (s.value / total) * C : 0;
              const dash = <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="16" strokeLinecap="butt" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
              offset += len;
              return dash;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-semibold tabular-nums text-[#2b2d42]">{total.toLocaleString("uk-UA")}</span>
            {centerLabel && <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">{centerLabel}</span>}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {active.length > 0 ? active.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-[13px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-[#5a6472]">{s.label}</span>
              <span className="tabular-nums font-medium text-[#2b2d42]">{s.value.toLocaleString("uk-UA")}</span>
              <span className="w-10 text-right tabular-nums text-[#8a94a0]">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            </div>
          )) : <p className="text-[12px] text-[#8a94a0]">Немає даних за обраний період</p>}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({
  stats,
  recentOrders,
  sync,
  onNavigate,
  onFocusCatalog,
  onImport,
}: {
  stats: Stats | null;
  recentOrders: RecentOrder[];
  sync: SyncState | null;
  onNavigate: (s: Section) => void;
  onFocusCatalog: (focus: { stock?: string; siteStatus?: string }) => void;
  onImport: () => void;
}) {
  const loading = stats === null;
  const maxRev = stats ? Math.max(1, ...stats.revenue_series.map((d) => d.total)) : 1;
  const [requirePhoto, setRequirePhoto] = useState(true);
  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => setRequirePhoto(d.require_product_photo !== "0")).catch(() => {});
  }, []);

  return (
    <div className="space-y-7">
      {/* Today's tasks */}
      <TodayBlock stats={stats} onNavigate={onNavigate} onFocusCatalog={onFocusCatalog} />

      {/* Donut charts — Intertop «Головна» hero */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DonutChart title="Статуси замовлень" centerLabel="замовлень" segments={[
          { label: "Очікує оплати", value: stats?.pending ?? 0, color: "#d97706" },
          { label: "В обробці", value: stats?.processing ?? 0, color: "#2f9488" },
          { label: "На утриманні", value: stats?.on_hold ?? 0, color: "#2b2d42" },
          { label: "Виконано", value: stats?.completed ?? 0, color: "#2e7d32" },
        ]} />
        <DonutChart title="Товари" centerLabel="товарів" segments={[
          { label: "В наявності", value: stats?.in_stock ?? 0, color: "#2f9488" },
          { label: "Немає в наявності", value: stats?.out_of_stock ?? 0, color: "#c3ccd4" },
        ]} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Виручка · 30 днів" value={loading ? "…" : fmtUah(stats!.revenue_30d)} sub={loading ? "" : `за 7 днів ${fmtUah(stats!.revenue_7d)}`} accent />
        <KpiCard label="Замовлень всього" value={loading ? "…" : String(stats!.orders_total)} sub={loading ? "" : `+${stats!.new_orders_7d} за тиждень`} onClick={() => onNavigate("orders")} />
        <KpiCard label="Середній чек" value={loading ? "…" : fmtUah(stats!.avg_order)} sub={loading ? "" : `${stats!.completed} виконано`} />
        <KpiCard label="Очікують дій" value={loading ? "…" : String(stats!.pending + stats!.processing)} sub={loading ? "" : `${stats!.pending} нових · ${stats!.processing} в обробці`} warn={!loading && stats!.pending + stats!.processing > 0} onClick={() => onNavigate("orders")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue chart */}
        <div className="lg:col-span-2 rounded-[4px] border border-[#e6eaec] bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">Виручка · 7 днів</h2>
            <span className="text-[13px] font-medium text-[#2b2d42]">{loading ? "" : fmtUah(stats!.revenue_7d)}</span>
          </div>
          <div className="flex h-40 items-end gap-2">
            {(stats?.revenue_series ?? []).map((d) => {
              const h = Math.round((d.total / maxRev) * 100);
              const label = new Date(d.day).toLocaleDateString("uk-UA", { weekday: "short" });
              return (
                <div key={d.day} className="group flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-[#aab4bf] opacity-0 group-hover:opacity-100">{d.total > 0 ? Math.round(d.total / 1000) + "k" : ""}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-[2px] bg-[#2b2d42] transition-all" style={{ height: `${Math.max(2, h)}%` }} title={fmtUah(d.total)} />
                  </div>
                  <span className="text-[10px] uppercase text-[#aab4bf]">{label}</span>
                </div>
              );
            })}
            {loading && <div className="flex-1 animate-pulse rounded bg-[#eef2f3]" />}
          </div>
        </div>

        {/* Catalog funnel — where products actually leak before reaching the site */}
        <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">Шлях товару до сайту</h2>
          {(() => {
            const total = stats?.products_total ?? 0;
            const withStock = stats?.in_stock ?? 0;
            const withPhoto = Math.max(0, withStock - (stats?.no_photo_live ?? 0));
            const live = requirePhoto ? withPhoto : withStock;
            const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
            const rows: { label: string; value: number; color: string; focus: { stock?: string; siteStatus?: string } }[] = [
              { label: "Всього", value: total, color: "bg-[#d5dbe0]", focus: {} },
              { label: "Зі залишком", value: withStock, color: "bg-[#aab4bf]", focus: { stock: "in" } },
              { label: "З фото", value: withPhoto, color: "bg-amber-400", focus: { siteStatus: "live" } },
              { label: "LIVE на сайті", value: live, color: "bg-emerald-500", focus: requirePhoto ? { siteStatus: "live" } : { stock: "in" } },
            ];
            return (
              <div className="space-y-2.5">
                {rows.map((r) => (
                  <button key={r.label} onClick={() => onFocusCatalog(r.focus)} className="block w-full text-left">
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[#5a6472]">{r.label}</span>
                      <span className="tabular-nums text-[#2b2d42]">{loading ? "—" : r.value.toLocaleString("uk-UA")}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef2f3]">
                      <div className={`h-full rounded-full ${r.color} transition-all`} style={{ width: `${loading ? 0 : pct(r.value)}%` }} />
                    </div>
                  </button>
                ))}
                <div className="flex items-center justify-between border-t border-[#eef2f3] pt-2 text-[12px]">
                  <span className="text-[#8a94a0]">Нових клієнтів · 30 днів</span>
                  <span className="tabular-nums text-[#2b2d42]">{loading ? "—" : stats!.new_customers_30d}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top products */}
        <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">Топ товарів</h2>
          {stats && stats.top_products.length > 0 ? (
            <div className="space-y-2.5">
              {stats.top_products.map((p, i) => (
                <div key={p.product_id} className="flex items-center gap-3">
                  <span className="w-4 text-[12px] tabular-nums text-[#aab4bf]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[#2b2d42]">{p.name}</p>
                    <p className="text-[11px] text-[#8a94a0]">{p.brand}</p>
                  </div>
                  <span className="text-[12px] tabular-nums text-[#8a94a0]">{p.qty} шт</span>
                  <span className="w-20 text-right text-[12px] font-medium tabular-nums text-[#2b2d42]">{fmtUah(p.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[12px] text-[#8a94a0]">{loading ? "Завантаження…" : "Поки немає продажів"}</p>
          )}
        </div>

        {/* Recent orders */}
        <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">Останні замовлення</h2>
            <button onClick={() => onNavigate("orders")} className="text-[11px] uppercase tracking-wider text-[#8a94a0] underline underline-offset-2 hover:text-[#2b2d42]">Всі</button>
          </div>
          {recentOrders.length > 0 ? (
            <div className="space-y-2.5">
              {recentOrders.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, bg: "#f5f5f5", color: "#555" };
                return (
                  <div key={o.id} className="flex items-center gap-3">
                    <span className="font-mono text-[12px] text-[#8a94a0]">{o.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#2b2d42]">{o.billing.first_name} {o.billing.last_name}</span>
                    <span className="text-[12px] font-medium tabular-nums text-[#2b2d42]">{Number(o.total).toLocaleString("uk-UA")} ₴</span>
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-[12px] text-[#8a94a0]">{loading ? "Завантаження…" : "Замовлень ще немає"}</p>
          )}
        </div>
      </div>

      {/* AI digest */}
      <AiInsights />

      {/* Windowed revenue analytics */}
      <AnalyticsCard />

      {/* Catalog source status (Postgres, fed by the XLS import) */}
      <SyncCard sync={sync} onNavigate={onNavigate} onImport={onImport} />
    </div>
  );
}

type ErpSnapshot = { low_stock: { id: string; name: string; brand: string; size: string; qty: number }[]; reconciliation: { drift: number } };

function TodayBlock({ stats, onNavigate, onFocusCatalog }: { stats: Stats | null; onNavigate: (s: Section) => void; onFocusCatalog: (focus: { stock?: string; siteStatus?: string }) => void }) {
  const [erp, setErp] = useState<ErpSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/erp/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setErp({ low_stock: d.low_stock ?? [], reconciliation: d.reconciliation ?? { drift: 0 } }))
      .catch(() => null);
  }, []);

  const pendingOrders = stats ? stats.pending + stats.processing : 0;
  const lowStockCount = erp?.low_stock.length ?? 0;
  const driftCount = erp?.reconciliation.drift ?? 0;
  const noPhotoCount = stats?.no_photo_live ?? 0;
  const hasAnyTask = pendingOrders > 0 || lowStockCount > 0 || driftCount > 0 || noPhotoCount > 0;

  return (
    <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">Що зробити сьогодні</h2>
        {hasAnyTask && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e5484d] px-1.5 text-[10px] tabular-nums text-white">{pendingOrders + lowStockCount + driftCount + noPhotoCount}</span>}
      </div>
      {!hasAnyTask && stats !== null && erp !== null ? (
        <p className="py-2 text-[13px] text-[#8a94a0]">✓ Все гаразд — термінових задач немає</p>
      ) : (
        <div className="space-y-2">
          {pendingOrders > 0 && (
            <button onClick={() => onNavigate("orders")} className="flex w-full items-center gap-3 rounded-[3px] border border-[#e6eaec] px-4 py-2.5 text-left transition-colors hover:border-[#2b2d42]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fdf0ee] text-[14px]">📦</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#2b2d42]">{pendingOrders} замовлень чекають обробки</p>
                <p className="text-[11px] text-[#8a94a0]">{stats!.pending} нових · {stats!.processing} в обробці</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-[#aab4bf]"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {lowStockCount > 0 && (
            <button onClick={() => onNavigate("products")} className="flex w-full items-center gap-3 rounded-[3px] border border-[#e6eaec] px-4 py-2.5 text-left transition-colors hover:border-[#2b2d42]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff8e6] text-[14px]">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#2b2d42]">{lowStockCount} варіантів на межі запасу</p>
                <p className="text-[11px] text-[#8a94a0]">Залишок ≤ порогу — потрібне поповнення</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-[#aab4bf]"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {driftCount > 0 && (
            <button onClick={() => onNavigate("products")} className="flex w-full items-center gap-3 rounded-[3px] border border-[#e6eaec] px-4 py-2.5 text-left transition-colors hover:border-[#2b2d42]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-[14px]">🔄</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#2b2d42]">{driftCount} позицій — розбіжність залишків</p>
                <p className="text-[11px] text-[#8a94a0]">Дані магазину розходяться з ERP — потрібна звірка</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-[#aab4bf]"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {noPhotoCount > 0 && (
            <button onClick={() => onFocusCatalog({ siteStatus: "no_photo" })} className="flex w-full items-center gap-3 rounded-[3px] border border-[#e6eaec] px-4 py-2.5 text-left transition-colors hover:border-[#2b2d42]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff3e0] text-[14px]">🖼️</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#2b2d42]">{noPhotoCount} товарів не на сайті — немає фото</p>
                <p className="text-[11px] text-[#8a94a0]">Є в наявності, але вітрина ховає товари без фото — Каталог → «Фото масово»</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-[#aab4bf]"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {(stats === null || erp === null) && !hasAnyTask && (
            <p className="py-2 text-[13px] text-[#aab4bf]">Завантаження…</p>
          )}
        </div>
      )}
    </div>
  );
}

type Analytics = {
  days: number;
  revenue: number;
  orders: number;
  avg: number;
  series: { day: string; total: number }[];
  by_brand: { name: string; qty: number; revenue: number }[];
  by_category: { name: string; qty: number; revenue: number }[];
};

const RANGES = [7, 30, 90] as const;

function AnalyticsCard() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stats/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d: Analytics) => setData(d))
      .finally(() => setLoading(false));
  }, [days]);

  const maxRev = data ? Math.max(1, ...data.series.map((d) => d.total)) : 1;
  const maxBrand = data ? Math.max(1, ...data.by_brand.map((b) => b.revenue)) : 1;
  const maxCat = data ? Math.max(1, ...data.by_category.map((c) => c.revenue)) : 1;

  return (
    <div className="rounded-[4px] border border-[#e6eaec] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">Аналітика продажів</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-[3px] border border-[#e6eaec] p-0.5">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)}
                className={`rounded-[2px] px-3 py-1 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                  days === r ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"
                }`}>
                {r} дн
              </button>
            ))}
          </div>
          <a href="/api/admin/orders/export" download
            className="flex h-7 items-center gap-1.5 rounded-[3px] border border-[#e6eaec] px-3 text-[11px] uppercase tracking-[0.1em] text-[#2b2d42] hover:border-[#2b2d42]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </a>
        </div>
      </div>

      {/* Windowed KPIs */}
      <div className="mb-5 grid grid-cols-3 gap-4">
        <div>
          <p className="text-[20px] font-light tabular-nums text-[#2b2d42]">{loading ? "…" : fmtUah(data!.revenue)}</p>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Виручка</p>
        </div>
        <div>
          <p className="text-[20px] font-light tabular-nums text-[#2b2d42]">{loading ? "…" : data!.orders}</p>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Замовлень</p>
        </div>
        <div>
          <p className="text-[20px] font-light tabular-nums text-[#2b2d42]">{loading ? "…" : fmtUah(data!.avg)}</p>
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Середній чек</p>
        </div>
      </div>

      {data && data.revenue === 0 ? (
        <p className="py-6 text-center text-[12px] text-[#8a94a0]">За обраний період продажів не було</p>
      ) : (
        <>
          {/* Sparkline */}
          <div className="mb-5 flex h-24 items-end gap-px">
            {(data?.series ?? []).map((d) => (
              <div key={d.day} className="flex-1 rounded-t-[1px] bg-[#d8c7a8] transition-all hover:bg-[#2b2d42]"
                style={{ height: `${Math.max(2, Math.round((d.total / maxRev) * 100))}%` }}
                title={`${new Date(d.day).toLocaleDateString("uk-UA")}: ${fmtUah(d.total)}`} />
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Breakdown title="За брендами" rows={data?.by_brand ?? []} max={maxBrand} loading={loading} />
            <Breakdown title="За категоріями" rows={data?.by_category ?? []} max={maxCat} loading={loading} />
          </div>
        </>
      )}
    </div>
  );
}

function Breakdown({ title, rows, max, loading }: {
  title: string; rows: { name: string; qty: number; revenue: number }[]; max: number; loading: boolean;
}) {
  return (
    <div>
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.14em] text-[#aab4bf]">{title}</h3>
      {loading ? (
        <p className="text-[12px] text-[#8a94a0]">Завантаження…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-[#8a94a0]">Немає даних</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#2b2d42]">{r.name}</span>
                <span className="text-[12px] tabular-nums text-[#8a94a0]">{fmtUah(r.revenue)}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#eef2f3]">
                <div className="h-full rounded-full bg-[#2b2d42]" style={{ width: `${Math.max(3, Math.round((r.revenue / max) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, accent, warn, onClick }: {
  label: string; value: string; sub?: string; accent?: boolean; warn?: boolean; onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button onClick={onClick} className={`flex flex-col gap-1 rounded-[4px] border bg-white p-5 text-left transition-shadow hover:shadow-sm ${accent ? "border-[#2b2d42]" : "border-[#e6eaec]"}`}>
        <span className={`text-[26px] font-light leading-none tabular-nums ${warn ? "text-[#e5484d]" : "text-[#2b2d42]"}`}>{value}</span>
        <span className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">{label}</span>
        {sub && <span className="text-[11px] text-[#aab4bf]">{sub}</span>}
      </button>
    );
  }
  return (
    <div className={`flex flex-col gap-1 rounded-[4px] border bg-white p-5 ${accent ? "border-[#2b2d42]" : "border-[#e6eaec]"}`}>
      <span className={`text-[26px] font-light leading-none tabular-nums ${warn ? "text-[#e5484d]" : "text-[#2b2d42]"}`}>{value}</span>
      <span className="mt-1 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">{label}</span>
      {sub && <span className="text-[11px] text-[#aab4bf]">{sub}</span>}
    </div>
  );
}

function SyncCard({ sync, onNavigate, onImport }: { sync: SyncState | null; onNavigate: (s: Section) => void; onImport: () => void }) {
  const lastSync = sync?.last_sync
    ? new Date(sync.last_sync).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-[#e6eaec] bg-white px-6 py-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${sync?.total_products ? "bg-emerald-500" : "bg-[#c3ccd4]"}`} />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#2b2d42]">
            {sync?.total_products
              ? `PostgreSQL · ${sync.total_products.toLocaleString("uk-UA")} товарів`
              : "Каталог порожній"}
          </span>
        </div>
        <p className="ml-4 text-[11px] text-[#8a94a0]">
          {lastSync ? `Останній імпорт: ${lastSync}` : "Каталог ще не імпортувався"}
        </p>
      </div>

      <button
        onClick={onImport}
        className="flex h-8 items-center gap-2 rounded-[3px] border border-[#e6eaec] bg-white px-4 text-[11px] uppercase tracking-[0.12em] text-[#2b2d42] transition-colors hover:border-[#2b2d42]"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v4H4V4zm0 6h16v10H4V10zm4 3h8" />
        </svg>
        Оновити каталог
      </button>
    </div>
  );
}

/* ─── Content helpers ──────────────────────────────────────────────────────── */

function CharCounter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  const over = n > max;
  const warn = !over && n > max * 0.85;
  return (
    <span className={`text-[10px] tabular-nums ${over ? "text-red-500 font-medium" : warn ? "text-amber-500" : "text-[#aab4bf]"}`}>
      {n}/{max}
    </span>
  );
}

function AnnouncementPreview({ text, color }: { text: string; color?: string }) {
  if (!text.trim()) return null;
  return (
    <div
      className="mt-3 rounded-[3px] px-4 py-2.5 text-center text-[11px] tracking-[0.1em] text-white shadow-sm"
      style={{ background: color || "#2b2d42" }}
    >
      {text}
    </div>
  );
}

function SeoGooglePreview({ title, desc, url = "maniagroup.munister.com.ua" }: { title: string; desc: string; url?: string }) {
  return (
    <div className="rounded-[4px] border border-[#e6eaec] bg-white p-4 shadow-sm">
      <p className="mb-2.5 text-[10px] uppercase tracking-wider text-[#aab4bf]">Вигляд у Google</p>
      <div className="font-sans">
        <p className="text-[14px] leading-snug text-[#1a0dab]">{title || "Заголовок сторінки"}</p>
        <p className="mt-0.5 text-[12px] text-[#006621]">{url}</p>
        <p className="mt-1 text-[12px] leading-snug text-[#545454] line-clamp-2">
          {desc || "Опис сторінки у пошуковій видачі."}
        </p>
      </div>
    </div>
  );
}

function AiField({
  label, value, onChange, textarea, placeholder, max, aiContext, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  textarea?: boolean; placeholder?: string; max?: number; aiContext?: string; hint?: string;
}) {
  const [improving, setImproving] = useState(false);

  async function improve() {
    if (!value.trim()) return;
    setImproving(true);
    try {
      const r = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "content-improve", field: label, text: value, context: aiContext }),
      });
      const d = await r.json();
      if (d.text) onChange(d.text);
    } catch {}
    setImproving(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]">
          {label}
          {hint && <span className="ml-1.5 font-normal lowercase tracking-normal text-[#aab4bf]">· {hint}</span>}
        </span>
        <div className="flex items-center gap-2">
          {max !== undefined && <CharCounter value={value} max={max} />}
          {value.trim() && (
            <button
              onClick={improve}
              disabled={improving}
              className="flex items-center gap-1 rounded-[2px] border border-[#e6eaec] px-2 py-0.5 text-[10px] text-[#8a94a0] transition-colors hover:border-[#7c6f5e] hover:text-[#2b2d42] disabled:opacity-40"
            >
              {improving ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[#8a94a0] border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-2.5 w-2.5">
                  <path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              ИИ покращити
            </button>
          )}
        </div>
      </div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
        />
      )}
    </div>
  );
}

/* ─── Content ─── */

type ContentTab = "home" | "seo" | "contacts" | "footer" | "about" | "delivery" | "returns";

const CONTENT_TABS: { id: ContentTab; label: string }[] = [
  { id: "home",     label: "Головна" },
  { id: "seo",      label: "SEO" },
  { id: "contacts", label: "Контакти" },
  { id: "footer",   label: "Футер" },
  { id: "about",    label: "Про нас" },
  { id: "delivery", label: "Доставка" },
  { id: "returns",  label: "Повернення" },
];

function HomeSectionsEditor({
  sections,
  onChange,
}: {
  sections: { id: string; enabled: boolean }[];
  onChange: (v: { id: string; enabled: boolean }[]) => void;
}) {
  // Reconcile saved config with the canonical list: keep saved order, append any
  // sections missing from config (enabled), drop unknown ids.
  const saved = sections.filter((s) => HOME_SECTIONS.some((m) => m.id === s.id));
  const missing = HOME_SECTIONS.filter((m) => !saved.some((s) => s.id === m.id)).map((m) => ({ id: m.id, enabled: true }));
  const items = [...saved, ...missing];

  const labelOf = (id: string) => HOME_SECTIONS.find((m) => m.id === id)?.label ?? id;
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function toggle(i: number) {
    onChange(items.map((s, k) => (k === i ? { ...s, enabled: !s.enabled } : s)));
  }

  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={s.id} className="flex items-center gap-3 rounded-[3px] border border-[#eef2f3] bg-white px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <button onClick={() => move(i, -1)} disabled={i === 0}
              className="flex h-4 w-5 items-center justify-center rounded-[2px] text-[9px] text-[#8a94a0] hover:bg-[#f7f9fa] disabled:opacity-25">▲</button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1}
              className="flex h-4 w-5 items-center justify-center rounded-[2px] text-[9px] text-[#8a94a0] hover:bg-[#f7f9fa] disabled:opacity-25">▼</button>
          </div>
          <span className="w-6 text-center text-[11px] tabular-nums text-[#aab4bf]">{i + 1}</span>
          <span className={`flex-1 text-[13px] ${s.enabled ? "text-[#2b2d42]" : "text-[#aab4bf] line-through"}`}>
            {labelOf(s.id)}
          </span>
          <button onClick={() => toggle(i)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${s.enabled ? "bg-[#2b2d42]" : "bg-[#d5dbe0]"}`}
            aria-label={s.enabled ? "Сховати" : "Показати"}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${s.enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </li>
      ))}
    </ul>
  );
}

type FooterColumn = { title: string; links: { label: string; href: string }[] };

function FooterColumnsEditor({
  columns,
  onChange,
}: {
  columns: FooterColumn[];
  onChange: (v: FooterColumn[]) => void;
}) {
  const setCol = (i: number, patch: Partial<FooterColumn>) =>
    onChange(columns.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const setLink = (ci: number, li: number, patch: Partial<{ label: string; href: string }>) =>
    setCol(ci, { links: columns[ci].links.map((l, k) => (k === li ? { ...l, ...patch } : l)) });

  const inputCls = "h-9 w-full border border-[#e6eaec] bg-white px-2.5 text-[13px] focus:border-[#2b2d42] focus:outline-none";

  return (
    <div className="space-y-5">
      {columns.map((col, ci) => (
        <div key={ci} className="rounded-[3px] border border-[#eef2f3] p-4">
          <div className="mb-3 flex items-center gap-2">
            <input value={col.title} onChange={(e) => setCol(ci, { title: e.target.value })}
              placeholder="Заголовок колонки" className={`${inputCls} font-medium`} />
            <button onClick={() => onChange(columns.filter((_, k) => k !== ci))}
              className="shrink-0 px-2 text-[11px] uppercase tracking-wider text-[#c62828] hover:underline">Видалити</button>
          </div>
          <div className="space-y-2">
            {col.links.map((l, li) => (
              <div key={li} className="flex items-center gap-2">
                <input value={l.label} onChange={(e) => setLink(ci, li, { label: e.target.value })}
                  placeholder="Назва" className={inputCls} />
                <input value={l.href} onChange={(e) => setLink(ci, li, { href: e.target.value })}
                  placeholder="/catalog" className={inputCls} />
                <button onClick={() => setCol(ci, { links: col.links.filter((_, k) => k !== li) })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-[#8a94a0] hover:bg-[#fdecec] hover:text-[#c62828]" aria-label="Прибрати">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-4 w-4"><path d="M5 12h14" /></svg>
                </button>
              </div>
            ))}
            <button onClick={() => setCol(ci, { links: [...col.links, { label: "", href: "" }] })}
              className="text-[11px] uppercase tracking-wider text-[#8a94a0] hover:text-[#2b2d42]">+ Додати посилання</button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...columns, { title: "Нова колонка", links: [] }])}
        className="flex h-10 items-center gap-2 border border-[#2f9488] px-4 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white">
        + Додати колонку
      </button>
    </div>
  );
}

function ContentSection({
  content,
  update,
}: {
  content: SiteContent;
  update: (fn: (c: SiteContent) => SiteContent) => void;
}) {
  const [tab, setTab] = useState<ContentTab>("home");

  function set<K extends keyof SiteContent>(key: K, val: SiteContent[K]) {
    update((c) => ({ ...c, [key]: val }));
  }
  function hero<K extends keyof SiteContent["hero"]>(field: K, v: SiteContent["hero"][K]) {
    update((c) => ({ ...c, hero: { ...c.hero, [field]: v } }));
  }
  function contact(field: keyof SiteContent["contacts"], v: string) {
    update((c) => ({ ...c, contacts: { ...c.contacts, [field]: v } }));
  }
  function seoF<K extends keyof SiteContent["seo"]>(field: K, v: SiteContent["seo"][K]) {
    update((c) => ({ ...c, seo: { ...c.seo, [field]: v } }));
  }
  function footerF<K extends keyof SiteContent["footer"]>(field: K, v: SiteContent["footer"][K]) {
    update((c) => ({ ...c, footer: { ...c.footer, [field]: v } }));
  }
  function aboutF(field: keyof SiteContent["about"], v: unknown) {
    update((c) => ({ ...c, about: { ...c.about, [field]: v } }));
  }
  function deliveryF(field: keyof SiteContent["delivery"], v: unknown) {
    update((c) => ({ ...c, delivery: { ...c.delivery, [field]: v } }));
  }
  function returnsF(field: keyof SiteContent["returns"], v: unknown) {
    update((c) => ({ ...c, returns: { ...c.returns, [field]: v } }));
  }

  return (
    <div className="max-w-3xl">
      {/* Sub-tabs */}
      <div className="mb-6 flex gap-1 rounded-[3px] border border-[#e6eaec] bg-white p-1">
        {CONTENT_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-[2px] py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
              tab === t.id ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {/* ── Головна ── */}
        {tab === "home" && (
          <>
            <Card title="Рядок оголошень" subtitle="Темна смуга над меню на всіх сторінках">
              <AiField
                label="Текст оголошення"
                value={content.announcement}
                onChange={(v) => set("announcement", v)}
                placeholder="Безкоштовна доставка від 3 000 ₴…"
                max={120}
                aiContext="рядок оголошень у шапці сайту магазину одягу, до 120 символів, стисло та привабливо"
                hint="рядок у шапці"
              />
              <AnnouncementPreview text={content.announcement} />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Показувати з</span>
                  <input type="date" value={content.announcementFrom}
                    onChange={(e) => set("announcementFrom", e.target.value)}
                    className="mt-1.5 h-10 w-full border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Показувати до</span>
                  <input type="date" value={content.announcementTo}
                    onChange={(e) => set("announcementTo", e.target.value)}
                    className="mt-1.5 h-10 w-full border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-[#8a94a0]">Залиште дати порожніми — смуга показується завжди (поки текст не порожній).</p>
            </Card>

            <Card title="Hero-блок" subtitle="Перший екран головної сторінки">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Надпис над заголовком" value={content.hero.eyebrow} onChange={(v) => hero("eyebrow", v)} />
                <Field label="Заголовок рядок 1" value={content.hero.titleLine1} onChange={(v) => hero("titleLine1", v)} />
                <Field label="Акцент (курсив)" value={content.hero.titleAccent} onChange={(v) => hero("titleAccent", v)} />
                <AiField
                  label="Підзаголовок"
                  value={content.hero.subtitle}
                  onChange={(v) => hero("subtitle", v)}
                  textarea
                  aiContext="підзаголовок hero-блоку на головній сторінці магазину брендового одягу Mania Group"
                />
              </div>
            </Card>

            <Card title="Статистика в hero" subtitle="3 цифри під кнопками">
              <div className="grid grid-cols-3 gap-4">
                {content.hero.stats.map((s, i) => (
                  <div key={i} className="space-y-3 rounded-[3px] border border-[#eef2f3] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Цифра {i + 1}</p>
                    <Field label="Значення" value={s.value}
                      onChange={(v) => hero("stats", content.hero.stats.map((x, j) => j === i ? { ...x, value: v } : x))} />
                    <Field label="Підпис" value={s.label}
                      onChange={(v) => hero("stats", content.hero.stats.map((x, j) => j === i ? { ...x, label: v } : x))} />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Блоки переваг" subtitle="4 картки перед футером">
              <div className="grid grid-cols-2 gap-4">
                {content.services.map((s, i) => (
                  <div key={i} className="space-y-3 rounded-[3px] border border-[#eef2f3] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Блок {i + 1}</p>
                    <Field label="Заголовок" value={s.title}
                      onChange={(v) => set("services", content.services.map((x, j) => j === i ? { ...x, title: v } : x))} />
                    <Field label="Текст" value={s.text}
                      onChange={(v) => set("services", content.services.map((x, j) => j === i ? { ...x, text: v } : x))} />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Секції головної" subtitle="Порядок та видимість блоків на головній сторінці">
              <HomeSectionsEditor
                sections={content.homeSections}
                onChange={(v) => set("homeSections", v)}
              />
            </Card>
          </>
        )}

        {/* ── SEO ── */}
        {tab === "seo" && (
          <>
            <Card title="Мета-теги сайту" subtitle="Заголовок та опис у пошуковій видачі Google і соцмережах">
              <div className="space-y-5">
                <Field label="Назва сайту" value={content.seo.siteName}
                  onChange={(v) => seoF("siteName", v)} placeholder="Mania Group" />

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]">
                      Заголовок головної (title)
                      <span className="ml-1.5 font-normal lowercase tracking-normal text-[#aab4bf]">· до 60 символів</span>
                    </span>
                    <CharCounter value={content.seo.defaultTitle} max={60} />
                  </div>
                  <input
                    value={content.seo.defaultTitle}
                    onChange={(e) => seoF("defaultTitle", e.target.value)}
                    placeholder="Mania Group — брендовий одяг…"
                    className="h-9 w-full rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]">
                      Шаблон заголовка інших сторінок
                    </span>
                  </div>
                  <input
                    value={content.seo.titleTemplate}
                    onChange={(e) => seoF("titleTemplate", e.target.value)}
                    placeholder="%s — Mania Group"
                    className="h-9 w-full rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-[#8a94a0]">%s замінюється назвою сторінки (напр. «Каталог»).</p>
                </div>

                <AiField
                  label="Опис (meta description)"
                  value={content.seo.description}
                  onChange={(v) => seoF("description", v)}
                  textarea
                  max={160}
                  hint="до 160 символів"
                  aiContext="meta description для головної сторінки магазину брендового одягу Mania Group, до 160 символів, ключові слова: брендовий одяг, EA7, Armani, Emporio Armani, інтернет-магазин"
                />

                <SeoGooglePreview
                  title={content.seo.defaultTitle}
                  desc={content.seo.description}
                />

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]">OG-зображення (URL)</span>
                  </div>
                  <input
                    value={content.seo.ogImage}
                    onChange={(e) => seoF("ogImage", e.target.value)}
                    placeholder="/images/hero.webp"
                    className="h-9 w-full rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
                  />
                  {content.seo.ogImage && (
                    <div className="mt-2 overflow-hidden rounded-[3px] border border-[#e6eaec]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={content.seo.ogImage}
                        alt="OG preview"
                        className="h-32 w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Ключові слова" subtitle="Через кому — використовуються в meta keywords">
              <AiField
                label="Ключові слова"
                value={content.seo.keywords.join(", ")}
                onChange={(v) => seoF("keywords", v.split(",").map((k) => k.trim()).filter(Boolean))}
                textarea
                placeholder="брендовий одяг, інтернет-магазин, EA7…"
                aiContext="meta keywords для магазину брендового одягу Mania Group, через кому, релевантні пошуковим запитам покупців"
              />
            </Card>
          </>
        )}

        {/* ── Контакти ── */}
        {tab === "contacts" && (
          <Card title="Контактна інформація" subtitle="Відображається в шапці, футері та сторінці Контакти">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Телефон" value={content.contacts.phone} onChange={(v) => contact("phone", v)} placeholder="+38 (0__) ___-__-__" />
              <Field label="Робочі години" value={content.contacts.workingHours ?? ""} onChange={(v) => contact("workingHours", v)} placeholder="Щодня · 9:00 — 20:00" />
              <Field label="Email" value={content.contacts.email} onChange={(v) => contact("email", v)} placeholder="info@example.com" />
              <Field label="Адреса" value={content.contacts.address} onChange={(v) => contact("address", v)} placeholder="Місто, вулиця" />
              <Field label="Instagram (URL)" value={content.contacts.instagram} onChange={(v) => contact("instagram", v)} placeholder="https://instagram.com/…" />
              <Field label="Telegram (URL)" value={(content.contacts as { telegram?: string }).telegram ?? ""} onChange={(v) => contact("telegram" as keyof SiteContent["contacts"], v)} placeholder="https://t.me/…" />
              <div className="col-span-2">
                <Field label="Facebook (URL)" value={content.contacts.facebook} onChange={(v) => contact("facebook", v)} placeholder="https://facebook.com/…" />
              </div>
            </div>
          </Card>
        )}

        {/* ── Футер ── */}
        {tab === "footer" && (
          <>
            <Card title="Про магазин" subtitle="Короткий текст у лівій колонці футера">
              <AiField
                label="Текст"
                value={content.footer.about}
                onChange={(v) => footerF("about", v)}
                textarea
                aiContext="короткий опис магазину брендового одягу Mania Group у футері сайту"
              />
            </Card>
            <Card title="Колонки посилань" subtitle="Меню в футері — заголовки та посилання">
              <FooterColumnsEditor
                columns={content.footer.columns}
                onChange={(v) => footerF("columns", v)}
              />
            </Card>
          </>
        )}

        {/* ── Про нас ── */}
        {tab === "about" && (
          <>
            <Card title="Hero-секція" subtitle="Великий заголовок на сторінці «Про нас»">
              <div className="space-y-4">
                <Field label="Заголовок героя" value={content.about.heroTitle}
                  onChange={(v) => aboutF("heroTitle", v)} />
                <AiField
                  label="Підзаголовок героя"
                  value={content.about.heroSubtitle}
                  onChange={(v) => aboutF("heroSubtitle", v)}
                  textarea
                  aiContext="підзаголовок hero-секції сторінки 'Про нас' магазину брендового одягу Mania Group"
                />
              </div>
            </Card>

            <Card title="Гарантія оригіналу" subtitle="Темна секція на сторінці">
              <div className="space-y-4">
                <AiField
                  label="Основний текст"
                  value={content.about.story}
                  onChange={(v) => aboutF("story", v)}
                  textarea
                  aiContext="текст про гарантію оригінальних брендів в магазині Mania Group"
                />
                <AiField
                  label="Другий абзац"
                  value={content.about.guaranteeText}
                  onChange={(v) => aboutF("guaranteeText", v)}
                  textarea
                  aiContext="другий абзац про гарантію якості та оригінальності товарів Mania Group"
                />
              </div>
            </Card>

            <Card title="Наші принципи" subtitle="4 картки «Чому обирають нас»">
              <div className="space-y-4">
                {content.about.values.map((v, i) => (
                  <div key={i} className="rounded-[3px] border border-[#eef2f3] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Принцип {i + 1}</p>
                      <button onClick={() => aboutF("values", content.about.values.filter((_, j) => j !== i))}
                        className="text-[10px] text-red-400 hover:text-red-600">✕ Видалити</button>
                    </div>
                    <Field label="Заголовок" value={v.title}
                      onChange={(val) => aboutF("values", content.about.values.map((x, j) => j === i ? { ...x, title: val } : x))} />
                    <Field label="Текст" value={v.text}
                      onChange={(val) => aboutF("values", content.about.values.map((x, j) => j === i ? { ...x, text: val } : x))} textarea />
                  </div>
                ))}
                <button onClick={() => aboutF("values", [...content.about.values, { title: "", text: "" }])}
                  className="w-full rounded-[3px] border border-dashed border-[#d5dbe0] py-2 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
                  + Додати принцип
                </button>
              </div>
            </Card>
          </>
        )}

        {/* ── Доставка ── */}
        {tab === "delivery" && (
          <>
            <Card title="Заголовок сторінки" subtitle="Текст під назвою «Доставка та оплата»">
              <Field label="Підзаголовок" value={content.delivery.subtitle}
                onChange={(v) => deliveryF("subtitle", v)} textarea />
            </Card>

            <Card title="Інфо-картки" subtitle="4 блоки умов доставки">
              <div className="space-y-4">
                {content.delivery.cards.map((c, i) => (
                  <div key={i} className="rounded-[3px] border border-[#eef2f3] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Картка {i + 1}</p>
                      <button onClick={() => deliveryF("cards", content.delivery.cards.filter((_, j) => j !== i))}
                        className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Мітка (eyebrow)" value={c.eyebrow}
                        onChange={(v) => deliveryF("cards", content.delivery.cards.map((x, j) => j === i ? { ...x, eyebrow: v } : x))} />
                      <Field label="Заголовок" value={c.title}
                        onChange={(v) => deliveryF("cards", content.delivery.cards.map((x, j) => j === i ? { ...x, title: v } : x))} />
                    </div>
                    <Field label="Текст" value={c.text}
                      onChange={(v) => deliveryF("cards", content.delivery.cards.map((x, j) => j === i ? { ...x, text: v } : x))} textarea />
                  </div>
                ))}
                <button onClick={() => deliveryF("cards", [...content.delivery.cards, { eyebrow: "", title: "", text: "" }])}
                  className="w-full rounded-[3px] border border-dashed border-[#d5dbe0] py-2 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
                  + Додати картку
                </button>
              </div>
            </Card>

            <Card title="Оплата" subtitle="Текст блоку «Накладений платіж»">
              <Field label="Опис оплати" value={content.delivery.paymentNote}
                onChange={(v) => deliveryF("paymentNote", v)} textarea />
            </Card>

            <Card title="Часті питання (FAQ)" subtitle="Запитання та відповіді внизу сторінки">
              <div className="space-y-4">
                {content.delivery.faq.map((item, i) => (
                  <div key={i} className="rounded-[3px] border border-[#eef2f3] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Питання {i + 1}</p>
                      <button onClick={() => deliveryF("faq", content.delivery.faq.filter((_, j) => j !== i))}
                        className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                    </div>
                    <Field label="Питання" value={item.q}
                      onChange={(v) => deliveryF("faq", content.delivery.faq.map((x, j) => j === i ? { ...x, q: v } : x))} />
                    <Field label="Відповідь" value={item.a}
                      onChange={(v) => deliveryF("faq", content.delivery.faq.map((x, j) => j === i ? { ...x, a: v } : x))} textarea />
                  </div>
                ))}
                <button onClick={() => deliveryF("faq", [...content.delivery.faq, { q: "", a: "" }])}
                  className="w-full rounded-[3px] border border-dashed border-[#d5dbe0] py-2 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
                  + Додати питання
                </button>
              </div>
            </Card>

            <Card title="CTA-блок" subtitle="Нижній заклик до дії">
              <Field label="Заголовок" value={content.delivery.ctaTitle}
                onChange={(v) => deliveryF("ctaTitle", v)} />
            </Card>
          </>
        )}

        {/* ── Повернення ── */}
        {tab === "returns" && (
          <>
            <Card title="Вступ" subtitle="Текст під заголовком «Обмін і повернення»">
              <Field label="Підзаголовок" value={content.returns.subtitle}
                onChange={(v) => returnsF("subtitle", v)} textarea />
            </Card>

            <Card title="Три кроки" subtitle="Покроковий процес повернення">
              <div className="space-y-4">
                {content.returns.steps.map((s, i) => (
                  <div key={i} className="rounded-[3px] border border-[#eef2f3] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Крок {i + 1}</p>
                      <button onClick={() => returnsF("steps", content.returns.steps.filter((_, j) => j !== i))}
                        className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                    </div>
                    <Field label="Заголовок" value={s.title}
                      onChange={(v) => returnsF("steps", content.returns.steps.map((x, j) => j === i ? { ...x, title: v } : x))} />
                    <Field label="Текст" value={s.text}
                      onChange={(v) => returnsF("steps", content.returns.steps.map((x, j) => j === i ? { ...x, text: v } : x))} textarea />
                  </div>
                ))}
                <button onClick={() => returnsF("steps", [...content.returns.steps, { title: "", text: "" }])}
                  className="w-full rounded-[3px] border border-dashed border-[#d5dbe0] py-2 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
                  + Додати крок
                </button>
              </div>
            </Card>

            <Card title="Умови повернення" subtitle="Список обов'язкових умов">
              <div className="space-y-3">
                {content.returns.conditions.map((cond, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#8a94a0]" />
                    <textarea
                      value={cond}
                      onChange={(e) => returnsF("conditions", content.returns.conditions.map((x, j) => j === i ? e.target.value : x))}
                      rows={2}
                      className="flex-1 resize-none rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2 text-sm text-[#2b2d42] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
                    />
                    <button onClick={() => returnsF("conditions", content.returns.conditions.filter((_, j) => j !== i))}
                      className="mt-2 text-[11px] text-red-400 hover:text-red-600">✕</button>
                  </div>
                ))}
                <button onClick={() => returnsF("conditions", [...content.returns.conditions, ""])}
                  className="w-full rounded-[3px] border border-dashed border-[#d5dbe0] py-2 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
                  + Додати умову
                </button>
              </div>
            </Card>

            <Card title="Гарантія при браку" subtitle="Темна секція внизу сторінки">
              <div className="space-y-4">
                <Field label="Заголовок" value={content.returns.guaranteeTitle}
                  onChange={(v) => returnsF("guaranteeTitle", v)} />
                <Field label="Текст" value={content.returns.guaranteeText}
                  onChange={(v) => returnsF("guaranteeText", v)} textarea />
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}


/* ─── Subscribers ─── */

type Subscriber = { id: string; email: string; source: string; created_at: string };

/* ─── Coupons ─── */

type Coupon = {
  id: string; code: string; type: "percent" | "fixed"; value: number;
  min_subtotal: number; expires_at: string | null; usage_limit: number | null;
  used_count: number; active: boolean;
};

function CouponsSection({ onToast }: { onToast?: (m: string) => void }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", type: "percent" as "percent" | "fixed", value: "", min_subtotal: "", expires_at: "", usage_limit: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coupons");
      setCoupons((await res.json()).coupons ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.code.trim() || !Number(form.value)) { onToast?.("Вкажіть код і розмір знижки"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code, type: form.type, value: Number(form.value),
          min_subtotal: Number(form.min_subtotal) || 0,
          expires_at: form.expires_at || null,
          usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) { setForm({ code: "", type: "percent", value: "", min_subtotal: "", expires_at: "", usage_limit: "" }); onToast?.("Промокод створено"); load(); }
      else onToast?.(data.error ?? "Помилка");
    } finally { setSaving(false); }
  }

  async function toggle(c: Coupon) {
    setCoupons((cs) => cs.map((x) => x.id === c.id ? { ...x, active: !x.active } : x));
    await fetch(`/api/admin/coupons/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) });
  }
  async function remove(c: Coupon) {
    if (!confirm(`Видалити промокод «${c.code}»?`)) return;
    await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
    setCoupons((cs) => cs.filter((x) => x.id !== c.id));
    onToast?.("Видалено");
  }

  const inp = "h-9 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none";
  const uah = (v: number) => Number(v).toLocaleString("uk-UA") + " ₴";

  return (
    <div className="max-w-4xl space-y-6">
      <Card title="Новий промокод" subtitle="Знижка застосовується до суми товарів у кошику">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="КОД" className={`${inp} font-mono uppercase`} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })} className={inp}>
            <option value="percent">Відсоток %</option>
            <option value="fixed">Сума ₴</option>
          </select>
          <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} type="number" placeholder={form.type === "percent" ? "10" : "200"} className={inp} />
          <input value={form.min_subtotal} onChange={(e) => setForm({ ...form, min_subtotal: e.target.value })} type="number" placeholder="мін. сума" className={inp} />
          <input value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} type="number" placeholder="ліміт" className={inp} />
          <input value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} type="date" className={inp} />
        </div>
        <button onClick={create} disabled={saving}
          className="mt-4 h-10 rounded-[3px] border border-[#2f9488] px-6 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
          {saving ? "Створюємо…" : "Створити промокод"}
        </button>
      </Card>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-[3px] bg-[#eef2f3]" />)}</div>
      ) : coupons.length === 0 ? (
        <p className="rounded-[3px] border border-[#e6eaec] bg-white px-4 py-12 text-center text-sm text-[#8a94a0]">Промокодів ще немає</p>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-[#e6eaec] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                <th className="px-4 py-3 text-left">Код</th>
                <th className="px-4 py-3 text-left">Знижка</th>
                <th className="px-4 py-3 text-right">Мін. сума</th>
                <th className="px-4 py-3 text-right">Використано</th>
                <th className="px-4 py-3 text-left">Діє до</th>
                <th className="px-4 py-3 text-center">Активний</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {coupons.map((c) => (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-[#2b2d42]">{c.code}</td>
                  <td className="px-4 py-3 text-[13px]">{c.type === "percent" ? `${c.value}%` : uah(c.value)}</td>
                  <td className="px-4 py-3 text-right text-[12px] tabular-nums text-[#8a94a0]">{c.min_subtotal ? uah(c.min_subtotal) : "—"}</td>
                  <td className="px-4 py-3 text-right text-[12px] tabular-nums text-[#8a94a0]">{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td className="px-4 py-3 text-[12px] text-[#8a94a0]">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("uk-UA") : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggle(c)} className={`relative mx-auto block h-5 w-9 rounded-full transition-colors ${c.active ? "bg-[#2b2d42]" : "bg-[#d5dbe0]"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${c.active ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(c)} className="text-[#c62828] hover:opacity-70" aria-label="Видалити">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Media library ─── */

type MediaFile = { url: string; name: string; size: number; mtime: number };

function MediaSection({ onToast }: { onToast?: (m: string) => void }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/media");
      const data = await res.json();
      setFiles(data.files ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function upload(list: FileList | File[] | null) {
    const arr = list ? Array.from(list) : [];
    if (arr.length === 0) return;
    setUploading(true);
    // Parallel — a batch of a dozen photos no longer crawls one-at-a-time.
    const results = await Promise.all(arr.map(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (res.ok) return true;
      const d = await res.json().catch(() => ({}));
      onToast?.(d.error ?? `Не вдалося завантажити ${file.name}`);
      return false;
    }));
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    const ok = results.filter(Boolean).length;
    if (ok) onToast?.(`Завантажено: ${ok}`);
    load();
  }

  async function copy(url: string) {
    const full = `${location.origin}${url}`;
    try {
      await navigator.clipboard.writeText(full);
      onToast?.("Посилання скопійовано");
    } catch {
      onToast?.(full);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Видалити «${name}»? Якщо файл десь використовується — зображення зникне.`)) return;
    const res = await fetch(`/api/admin/media?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (res.ok) {
      setFiles((fs) => fs.filter((f) => f.name !== name));
      onToast?.("Видалено");
    } else {
      onToast?.("Не вдалося видалити");
    }
  }

  const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} КБ` : `${(b / 1024 / 1024).toFixed(1)} МБ`);

  return (
    <div
      className="max-w-4xl"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[#2b2d42]">Медіа-бібліотека</h2>
          <p className="text-[12px] text-[#8a94a0]">{files.length} зображень · jpg, png, webp, avif, gif · до 8 МБ · перетягніть файли будь-де на сторінці</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => upload(e.target.files)} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="flex h-10 items-center gap-2 border border-[#2f9488] px-5 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" />
          </svg>
          {uploading ? "Завантаження…" : "Завантажити"}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {[1,2,3,4,5,6,7,8].map((i) => <div key={i} className="aspect-square animate-pulse bg-[#f7f9fa]" />)}
        </div>
      ) : files.length === 0 ? (
        <div className={`rounded-[3px] border border-dashed px-4 py-16 text-center text-sm transition-colors ${dragOver ? "border-[#2b2d42] bg-[#f4f6f7] text-[#2b2d42]" : "border-[#d5dbe0] bg-white text-[#8a94a0]"}`}>
          {dragOver ? "Відпустіть, щоб завантажити" : "Бібліотека порожня. Перетягніть фото сюди або натисніть «Завантажити»."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f) => (
            <div key={f.name} className="group relative overflow-hidden rounded-[3px] border border-[#eef2f3] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="aspect-square w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="truncate text-[10px] text-[#8a94a0]" title={f.name}>{fmtSize(f.size)}</span>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => copy(f.url)} title="Копіювати посилання"
                    className="flex h-6 w-6 items-center justify-center rounded-[2px] text-[#8a94a0] hover:bg-[#f7f9fa] hover:text-[#2b2d42]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M8 8V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-3M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z" />
                    </svg>
                  </button>
                  <button onClick={() => remove(f.name)} title="Видалити"
                    className="flex h-6 w-6 items-center justify-center rounded-[2px] text-[#8a94a0] hover:bg-[#fdecec] hover:text-[#c62828]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a1 1 0 01-1 1H8a1 1 0 01-1-1V7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubscribersSection() {
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(q: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/subscribers?${params}`);
      const data = await res.json();
      setRows(data.subscribers ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, []);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(v), 350);
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[#2b2d42]">Підписники</h2>
          <p className="text-[12px] text-[#8a94a0]">{total.toLocaleString("uk-UA")} email у розсилці</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Пошук email…"
            className="h-10 w-56 border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
          <a href="/api/admin/subscribers?format=csv" download
            className="flex h-10 items-center gap-2 border border-[#2f9488] px-5 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </a>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-12 animate-pulse bg-[#f7f9fa]" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#8a94a0]">{search ? "Нічого не знайдено" : "Поки немає підписників"}</p>
      ) : (
        <div className="border border-[#eef2f3]">
          <div className="flex items-center gap-3 border-b border-[#eef2f3] bg-[#f7f9fa] px-4 py-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">
            <span className="flex-1">Email</span>
            <span className="w-24">Джерело</span>
            <span className="w-28 text-right">Дата</span>
          </div>
          <div className="divide-y divide-[#eef2f3]">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-[#2b2d42]">{s.email}</span>
                <span className="w-24 truncate text-[12px] text-[#8a94a0]">{s.source || "—"}</span>
                <span className="w-28 text-right text-[12px] tabular-nums text-[#8a94a0]">
                  {new Date(s.created_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Backup ─── */

type BackupFile = { name: string; size: number; mtime: string };

function fmtBackupBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
function fmtBackupDate(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AutoBackupsCard() {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/backups").then((r) => r.json()).then((d) => setFiles(d.files ?? [])).catch(() => setFiles([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/backups", { method: "POST" });
      const d = await res.json();
      if (res.ok) { setMsg("✓ Копію створено"); load(); }
      else setMsg(`✗ ${d.error ?? "Помилка"}`);
    } catch {
      setMsg("✗ Помилка мережі");
    } finally {
      setRunning(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  return (
    <Card title="Автоматичні резервні копії" subtitle="Щоночі о 03:00 — повний дамп PostgreSQL, зберігається останні 14 днів">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={runNow} disabled={running}
          className="inline-flex h-9 items-center rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] transition-opacity hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
          {running ? "Створюємо…" : "Створити копію зараз"}
        </button>
        {msg && <span className={`text-[11px] ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
      </div>

      {files === null ? (
        <p className="text-[12px] text-[#8a94a0]">Завантаження…</p>
      ) : files.length === 0 ? (
        <p className="text-[12px] text-[#aab4bf]">Ще немає жодної автоматичної копії.</p>
      ) : (
        <div className="divide-y divide-[#F5F5F5] rounded-[4px] border border-[#e6eaec] bg-white">
          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 px-4 py-2.5 text-[12px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="min-w-0 flex-1 truncate font-medium text-[#1f2733]">{f.name}</span>
              <span className="shrink-0 tabular-nums text-[#8a94a0]">{fmtBackupBytes(f.size)}</span>
              <span className="shrink-0 text-[11px] text-[#BDBDBD]">{fmtBackupDate(f.mtime)}</span>
              <a href={`/api/admin/backups/download?file=${encodeURIComponent(f.name)}`} download
                className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-[#2b2d42] hover:underline">
                ↓ Завантажити
              </a>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

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
      <AutoBackupsCard />

      <Card title="Повна копія бази даних (вручну)" subtitle="Дамп PostgreSQL: товари, замовлення, клієнти, підписники, налаштування">
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/api/admin/backup"
            download
            className="inline-flex h-9 items-center rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] transition-opacity hover:bg-[#2f9488] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 12m4 4V4" />
            </svg>
            Завантажити дамп .sql
          </a>
          <span className="text-[12px] text-[#8a94a0]">maniagroup-db-YYYY-MM-DD.sql</span>
        </div>
        <p className="mt-4 text-[11px] text-[#aab4bf]">
          Відновлення на сервері: <code className="rounded bg-[#f7f9fa] px-1.5 py-0.5 text-[#6b6052]">psql &quot;$DATABASE_URL&quot; &lt; файл.sql</code>
        </p>
      </Card>

      <Card title="Резервна копія контенту" subtitle="JSON-файл з усім редагованим вмістом сайту">
        <div className="flex items-center gap-4">
          <a
            href="/api/admin/export"
            download
            className="inline-flex h-9 items-center rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] transition-opacity hover:bg-[#2f9488] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 12m4 4V4" />
            </svg>
            Завантажити JSON
          </a>
          <span className="text-[12px] text-[#8a94a0]">maniagroup-backup-YYYY-MM-DD.json</span>
        </div>
      </Card>

      <Card title="Відновлення з файлу" subtitle="Завантажте раніше збережену копію — перезапише поточний контент">
        <div className="flex flex-wrap items-center gap-4">
          <label className={`inline-flex h-9 cursor-pointer items-center rounded-[3px] border border-[#e6eaec] bg-white px-5 text-[11px] uppercase tracking-[0.12em] text-[#2b2d42] transition-colors hover:bg-[#f4f6f7] ${importStatus === "importing" ? "pointer-events-none opacity-50" : ""}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importStatus === "importing" ? "Відновлення…" : "Обрати файл .json"}
            <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </label>
          {importStatus === "success" && <span className="text-[11px] text-emerald-600">✓ {importMsg}</span>}
          {importStatus === "error" && <span className="text-[11px] text-red-600">✗ {importMsg}</span>}
        </div>
      </Card>

      <Card title="Що входить до JSON-копії контенту">
        <ul className="space-y-2 text-[12px] text-[#8a94a0]">
          {[
            "Рядок оголошень",
            "Hero-блок (заголовки, підзаголовок)",
            "Блоки переваг (4 плашки)",
            "Контакти (телефон, email, посилання)",
            "Тексти сторінок: Про нас, Доставка, Повернення",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#aab4bf]" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-[#aab4bf]">
          Товари, замовлення та клієнти зберігаються в PostgreSQL — для них використовуйте повний дамп бази даних вище.
        </p>
      </Card>
    </div>
  );
}

/* ─── Settings ─── */

function SettingsSection() {
  const [store, setStore] = useState({ free_ship_threshold: "", store_phone: "", store_email: "", low_stock_threshold: "", require_product_photo: "1" });
  const [storeStatus, setStoreStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pwd, setPwd] = useState({ current: "", next: "", next2: "" });
  const [pwdStatus, setPwdStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pwdError, setPwdError] = useState("");
  const [tg, setTg] = useState({ telegram_enabled: "", telegram_bot_token: "", telegram_chat_id: "" });
  const [tgStatus, setTgStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [tgTest, setTgTest] = useState<{ state: "idle" | "testing"; msg: string }>({ state: "idle", msg: "" });
  const [ai, setAi] = useState({ openrouter_api_key: "" });
  const [aiStatus, setAiStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [aiTest, setAiTest] = useState<{ state: "idle" | "testing"; msg: string }>({ state: "idle", msg: "" });
  type PhotoSource = { id: number; name: string; base_url: string; enabled: boolean; sort_order: number };
  const [photoSources, setPhotoSources] = useState<PhotoSource[]>([]);
  const [newSource, setNewSource] = useState({ name: "", base_url: "" });
  const [sourceStatus, setSourceStatus] = useState<"idle" | "saving">("idle");
  const [sourceError, setSourceError] = useState("");
  const [sourceWarning, setSourceWarning] = useState("");
  const [pingState, setPingState] = useState<Record<number, "idle" | "testing" | "ok" | "fail">>({});

  function loadPhotoSources() {
    fetch("/api/admin/photo-sources").then((r) => r.json()).then((d) => setPhotoSources(d.sources ?? []));
  }

  function normalizeUrl(u: string) {
    return u.trim().replace(/\/+$/, "").toLowerCase();
  }

  function isValidUrl(u: string): boolean {
    try {
      const parsed = new URL(u.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function testPhotoSource(id: number, base_url: string): Promise<boolean> {
    setPingState((prev) => ({ ...prev, [id]: "testing" }));
    try {
      const r = await fetch("/api/admin/photo-sources/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_url }),
      });
      const d = await r.json();
      setPingState((prev) => ({ ...prev, [id]: d.reachable ? "ok" : "fail" }));
      return !!d.reachable;
    } catch {
      setPingState((prev) => ({ ...prev, [id]: "fail" }));
      return false;
    }
  }

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((d) => {
      setStore({ free_ship_threshold: d.free_ship_threshold ?? "", store_phone: d.store_phone ?? "", store_email: d.store_email ?? "", low_stock_threshold: d.low_stock_threshold ?? "", require_product_photo: d.require_product_photo ?? "1" });
      setTg({ telegram_enabled: d.telegram_enabled ?? "", telegram_bot_token: d.telegram_bot_token ?? "", telegram_chat_id: d.telegram_chat_id ?? "" });
      setAi({ openrouter_api_key: d.openrouter_api_key ?? "" });
    });
    loadPhotoSources();
  }, []);

  async function addPhotoSource() {
    setSourceError(""); setSourceWarning("");
    const url = newSource.base_url.trim();
    if (!url) { setSourceError("Вкажіть адресу сайту"); return; }
    if (!isValidUrl(url)) { setSourceError("Некоректна адреса — вкажіть повний URL (https://...)"); return; }
    if (photoSources.some((s) => normalizeUrl(s.base_url) === normalizeUrl(url))) {
      setSourceError("Це джерело вже додано"); return;
    }

    setSourceStatus("saving");
    const r = await fetch("/api/admin/photo-sources", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newSource),
    });
    const d = await r.json();
    setSourceStatus("idle");
    if (!r.ok) { setSourceError(d.error ?? "Помилка"); return; }
    setNewSource({ name: "", base_url: "" });
    loadPhotoSources();

    if (d.source) {
      const reachable = await testPhotoSource(d.source.id, url);
      if (!reachable) setSourceWarning(`⚠ «${d.source.name}» додано, але сайт не відповів на медіа-запит — перевірте адресу.`);
    }
  }

  async function togglePhotoSource(id: number, enabled: boolean) {
    setPhotoSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    await fetch(`/api/admin/photo-sources/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
    });
  }

  async function deletePhotoSource(id: number) {
    setPhotoSources((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/admin/photo-sources/${id}`, { method: "DELETE" });
  }

  async function movePhotoSource(id: number, dir: -1 | 1) {
    const idx = photoSources.findIndex((s) => s.id === id);
    const swapWith = idx + dir;
    if (idx < 0 || swapWith < 0 || swapWith >= photoSources.length) return;
    const next = [...photoSources];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setPhotoSources(next);
    await fetch("/api/admin/photo-sources", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: next.map((s) => s.id) }),
    });
  }

  async function saveAi() {
    setAiStatus("saving");
    await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ai) });
    setAiStatus("saved");
    setTimeout(() => setAiStatus("idle"), 2500);
  }

  async function testAi() {
    setAiTest({ state: "testing", msg: "" });
    // Save first — otherwise "Перевірити" would silently test whatever key
    // was saved last, not what's currently typed in the field.
    await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ai) });
    const res = await fetch("/api/admin/ai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "product-desc", product: { name: "Тестовий товар", brand: "Mania Group", category: "Тест" } }),
    });
    const data = await res.json().catch(() => ({}));
    setAiTest({ state: "idle", msg: res.ok && data.text ? "✓ Працює — ШІ відповів" : `✕ ${data.error ?? "Помилка"}` });
  }

  async function saveTg() {
    setTgStatus("saving");
    await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tg) });
    setTgStatus("saved");
    setTimeout(() => setTgStatus("idle"), 2500);
  }

  async function testTg() {
    setTgTest({ state: "testing", msg: "" });
    const res = await fetch("/api/admin/notify/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tg.telegram_bot_token, chatId: tg.telegram_chat_id }),
    });
    const data = await res.json().catch(() => ({}));
    setTgTest({ state: "idle", msg: res.ok ? "✓ Повідомлення надіслано" : `✕ ${data.error ?? "Помилка"}` });
  }

  async function saveStore() {
    setStoreStatus("saving");
    await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(store) });
    setStoreStatus("saved");
    setTimeout(() => setStoreStatus("idle"), 2500);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    if (pwd.next !== pwd.next2) { setPwdError("Паролі не співпадають"); return; }
    if (pwd.next.length < 6) { setPwdError("Мінімум 6 символів"); return; }
    setPwdStatus("saving");
    const res = await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: pwd.current, next: pwd.next }) });
    const data = await res.json();
    setPwdStatus("idle");
    if (!res.ok) { setPwdError(data.error ?? "Помилка"); return; }
    setPwd({ current: "", next: "", next2: "" });
    setPwdStatus("saved");
    setTimeout(() => setPwdStatus("idle"), 2500);
  }

  const inp = "mt-1.5 h-10 w-full rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none";
  const lbl = "text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]";
  const btn = "h-10 rounded-[3px] border border-[#2f9488] px-6 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50";

  return (
    <div className="max-w-2xl space-y-6">
      <Card title="Магазин" subtitle="Базові параметри вітрини">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={lbl}>Безкоштовна доставка від, ₴</span>
            <input type="number" className={inp} value={store.free_ship_threshold} onChange={(e) => setStore({ ...store, free_ship_threshold: e.target.value })} /></label>
          <label className="block"><span className={lbl}>Поріг залишку (ERP), шт</span>
            <input type="number" min="1" className={inp} value={store.low_stock_threshold} onChange={(e) => setStore({ ...store, low_stock_threshold: e.target.value })} placeholder="3" /></label>
          <label className="block"><span className={lbl}>Телефон магазину</span>
            <input className={inp} value={store.store_phone} onChange={(e) => setStore({ ...store, store_phone: e.target.value })} /></label>
          <label className="block"><span className={lbl}>Email магазину</span>
            <input type="email" className={inp} value={store.store_email} onChange={(e) => setStore({ ...store, store_email: e.target.value })} placeholder="hello@maniagroup.com.ua" /></label>
        </div>

        <div className="mt-5 rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] p-4">
          <label className="flex items-start gap-2.5">
            <button type="button" onClick={() => setStore({ ...store, require_product_photo: store.require_product_photo === "0" ? "1" : "0" })}
              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${store.require_product_photo !== "0" ? "bg-[#2b2d42]" : "bg-[#d5dbe0]"}`}
              aria-label="Приховувати товари без фото">
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${store.require_product_photo !== "0" ? "left-[18px]" : "left-0.5"}`} />
            </button>
            <span>
              <span className="block text-[13px] text-[#2b2d42]">Приховувати товари без фото на сайті</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-[#8a94a0]">
                Увімкнено (за замовчуванням) — вітрина показує лише сфотографовані товари.
                Вимкніть, якщо треба одразу показати щойно завантажені товари (наприклад, після імпорту), поки фото ще не додані.
              </span>
            </span>
          </label>
        </div>

        <button onClick={saveStore} disabled={storeStatus === "saving"} className={`mt-5 ${btn}`}>
          {storeStatus === "saving" ? "Зберігаємо…" : storeStatus === "saved" ? "✓ Збережено" : "Зберегти"}
        </button>
      </Card>

      <Card title="Безпека" subtitle="Зміна пароля адмін-панелі">
        <form onSubmit={savePassword} className="max-w-sm space-y-4">
          <label className="block"><span className={lbl}>Поточний пароль</span>
            <input type="password" required className={inp} value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} /></label>
          <label className="block"><span className={lbl}>Новий пароль</span>
            <input type="password" required className={inp} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} placeholder="мінімум 6 символів" /></label>
          <label className="block"><span className={lbl}>Повторіть новий пароль</span>
            <input type="password" required className={inp} value={pwd.next2} onChange={(e) => setPwd({ ...pwd, next2: e.target.value })} /></label>
          {pwdError && <p className="text-[13px] text-[#e5484d]">{pwdError}</p>}
          <button type="submit" disabled={pwdStatus === "saving"} className={btn}>
            {pwdStatus === "saving" ? "Зберігаємо…" : pwdStatus === "saved" ? "✓ Пароль змінено" : "Змінити пароль"}
          </button>
        </form>
      </Card>

      <Card title="Сповіщення · Telegram" subtitle="Миттєвий пінг у Telegram при новому замовленні та зміні статусу">
        <label className="mb-4 flex items-center gap-2.5">
          <button onClick={() => setTg({ ...tg, telegram_enabled: tg.telegram_enabled ? "" : "1" })}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${tg.telegram_enabled ? "bg-[#2b2d42]" : "bg-[#d5dbe0]"}`}
            aria-label="Увімкнути">
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${tg.telegram_enabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
          <span className="text-[13px] text-[#2b2d42]">Надсилати сповіщення</span>
        </label>
        <div className="space-y-4">
          <label className="block"><span className={lbl}>Bot Token</span>
            <input className={inp} value={tg.telegram_bot_token} onChange={(e) => setTg({ ...tg, telegram_bot_token: e.target.value })} placeholder="123456:ABC-DEF…" /></label>
          <label className="block"><span className={lbl}>Chat ID</span>
            <input className={inp} value={tg.telegram_chat_id} onChange={(e) => setTg({ ...tg, telegram_chat_id: e.target.value })} placeholder="-1001234567890 або ваш user id" /></label>
          <p className="text-[11px] leading-relaxed text-[#8a94a0]">
            Створіть бота через <span className="text-[#2b2d42]">@BotFather</span> → отримайте токен. Chat ID свого акаунта дізнайтеся у <span className="text-[#2b2d42]">@userinfobot</span>, або додайте бота в групу й візьміть її id.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={saveTg} disabled={tgStatus === "saving"} className={btn}>
            {tgStatus === "saving" ? "Зберігаємо…" : tgStatus === "saved" ? "✓ Збережено" : "Зберегти"}
          </button>
          <button onClick={testTg} disabled={tgTest.state === "testing" || !tg.telegram_bot_token || !tg.telegram_chat_id}
            className="h-10 rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
            {tgTest.state === "testing" ? "Надсилаємо…" : "Тест"}
          </button>
          {tgTest.msg && <span className={`text-[12px] ${tgTest.msg.startsWith("✓") ? "text-[#2e7d32]" : "text-[#e5484d]"}`}>{tgTest.msg}</span>}
        </div>
      </Card>

      <Card title="AI-генератор контенту" subtitle="Ключ для генерації постів, описів товарів та автозаповнення карток">
        <label className="block"><span className={lbl}>OpenRouter API Key</span>
          <input type="password" autoComplete="new-password" className={inp} value={ai.openrouter_api_key}
            onChange={(e) => setAi({ openrouter_api_key: e.target.value })} placeholder="sk-or-v1-…" /></label>
        <p className="mt-2 text-[11px] leading-relaxed text-[#8a94a0]">
          Безкоштовний ключ — зареєструйтесь на <span className="text-[#2b2d42]">openrouter.ai</span>, створіть ключ у розділі Keys і вставте сюди.
          Це замінює потребу заходити на сервер через термінал.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={saveAi} disabled={aiStatus === "saving"} className={btn}>
            {aiStatus === "saving" ? "Зберігаємо…" : aiStatus === "saved" ? "✓ Збережено" : "Зберегти"}
          </button>
          <button onClick={testAi} disabled={aiTest.state === "testing" || !ai.openrouter_api_key}
            className="h-10 rounded-[3px] border border-[#2f9488] px-5 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
            {aiTest.state === "testing" ? "Перевіряємо…" : "Перевірити"}
          </button>
          {aiTest.msg && <span className={`text-[12px] ${aiTest.msg.startsWith("✓") ? "text-[#2e7d32]" : "text-[#e5484d]"}`}>{aiTest.msg}</span>}
        </div>
      </Card>

      <Card title="Фото з WP" subtitle="Джерела для «Каталог → Фото масово → З WP» — перевіряються по черзі, поки не знайдеться фото">
        {photoSources.length > 0 && (
          <div className="mb-4 space-y-2">
            {photoSources.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 rounded-[4px] border border-[#e6eaec] px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => movePhotoSource(s.id, -1)} disabled={i === 0} className="text-[10px] text-[#8a94a0] hover:text-[#2b2d42] disabled:opacity-30">▲</button>
                  <button onClick={() => movePhotoSource(s.id, 1)} disabled={i === photoSources.length - 1} className="text-[10px] text-[#8a94a0] hover:text-[#2b2d42] disabled:opacity-30">▼</button>
                </div>
                <label className="flex items-center gap-2 shrink-0">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => togglePhotoSource(s.id, e.target.checked)} className="h-4 w-4 accent-[#2b2d42]" />
                </label>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] ${s.enabled ? "text-[#2b2d42]" : "text-[#8a94a0] line-through"}`}>{s.name || s.base_url}</div>
                  <div className="truncate text-[11px] text-[#8a94a0]">{s.base_url}</div>
                </div>
                {pingState[s.id] === "ok" && <span className="shrink-0 text-[11px] text-emerald-600">✓ доступний</span>}
                {pingState[s.id] === "fail" && <span className="shrink-0 text-[11px] text-[#e5484d]">✗ не відповідає</span>}
                <button onClick={() => testPhotoSource(s.id, s.base_url)} disabled={pingState[s.id] === "testing"}
                  className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-[#5a6472] hover:text-[#2b2d42] disabled:opacity-40">
                  {pingState[s.id] === "testing" ? "Перевіряємо…" : "Перевірити"}
                </button>
                <button onClick={() => deletePhotoSource(s.id)} className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-[#e5484d] hover:opacity-70">Видалити</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="block flex-1"><span className={lbl}>Назва</span>
            <input className={inp} value={newSource.name} onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))} placeholder="Старий сайт" /></label>
          <label className="block flex-[2]"><span className={lbl}>Адреса сайту (WordPress)</span>
            <input className={inp} value={newSource.base_url} onChange={(e) => setNewSource((s) => ({ ...s, base_url: e.target.value }))} placeholder="https://example.com" /></label>
          <button onClick={addPhotoSource} disabled={sourceStatus === "saving" || !newSource.base_url.trim()} className={btn}>
            {sourceStatus === "saving" ? "Додаємо…" : "Додати"}
          </button>
        </div>
        {sourceError && <p className="mt-2 text-[12px] text-[#e5484d]">{sourceError}</p>}
        {sourceWarning && <p className="mt-2 text-[12px] text-amber-700">{sourceWarning}</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-[#8a94a0]">
          Будь-який сайт на WordPress — фото шукаються через його публічну медіатеку за назвою файлу, що починається з артикулу/SKU товару.
          Можна додати кілька — вимкнені (без галочки) пропускаються, порядок задає чергу пошуку.
        </p>
      </Card>

      <Card title="Інфраструктура">
        <div className="space-y-3">
          <InfoRow label="Сайт" value="maniagroup.munister.com.ua" />
          <InfoRow label="База даних" value="PostgreSQL · maniagroup" />
          <InfoRow label="Сервер" value="173.242.49.73 · pm2 maniagroup" />
        </div>
      </Card>
    </div>
  );
}

/* ─── Helpers ─── */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[3px] border border-[#e6eaec] bg-white p-6">
      <div className="mb-5">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#8a94a0]">{title}</h2>
        {subtitle && <p className="mt-1 text-[12px] text-[#aab4bf]">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-wider text-[#8a94a0]">{label}</span>
      <span className="font-mono text-[12px] text-[#2b2d42]">{value}</span>
    </div>
  );
}

function Field({
  label, value, onChange, textarea, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5 h-9 w-full rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] px-3 text-sm text-[#2b2d42] placeholder:text-[#c3ccd4] focus:border-[#2b2d42] focus:bg-white focus:outline-none"
        />
      )}
    </label>
  );
}
