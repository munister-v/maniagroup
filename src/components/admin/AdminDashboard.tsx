"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { SiteContent } from "@/lib/siteContent";
import { formatPrice, type Product } from "@/lib/catalog";

/* ─── Types ─── */

type Section = "overview" | "content" | "products" | "orders" | "backup" | "settings";

type WcOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  billing: { first_name: string; last_name: string; phone: string; email: string };
  line_items: { id: number; name: string; quantity: number; total: string }[];
  total: string;
  currency_symbol: string;
};

type Stats = {
  products_total: number;
  has_wc_creds: boolean;
  processing?: number;
  pending?: number;
  on_hold?: number;
};

type SyncState = {
  status: "idle" | "syncing" | "done" | "error";
  last_sync: string;
  total_products: number;
  error: string;
  has_wc_creds: boolean;
};

type EditState = { id: string; regularPrice: string; salePrice: string };
type PriceStatus = "idle" | "saving" | "saved" | "error" | "no-creds";

/* ─── Nav ─── */

const NAV: { id: Section; label: string; d: string }[] = [
  {
    id: "overview",
    label: "Огляд",
    d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    id: "content",
    label: "Контент",
    d: "M4 6h16M4 12h10M4 18h16",
  },
  {
    id: "products",
    label: "Товари",
    d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  {
    id: "orders",
    label: "Замовлення",
    d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
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

function SvgIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d={d} />
    </svg>
  );
}

/* ─── Root ─── */

export function AdminDashboard({
  initial,
  hasWcCreds,
}: {
  initial: SiteContent;
  hasWcCreds: boolean;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [content, setContent] = useState<SiteContent>(initial);
  const [contentStatus, setContentStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [unsaved, setUnsaved] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodSearch, setProdSearch] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [priceStatus, setPriceStatus] = useState<PriceStatus>("idle");

  const [orders, setOrders] = useState<WcOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [orderNoCreds, setOrderNoCreds] = useState(!hasWcCreds);

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<WcOrder[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const router = useRouter();
  const prodLoaded = useRef(false);

  // Load stats + sync state on mount
  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data: Stats) => {
        setStats(data);
        if (data.has_wc_creds) {
          fetch("/api/admin/orders?per_page=5")
            .then((r) => r.json())
            .then((o: WcOrder[]) => Array.isArray(o) && setRecentOrders(o));
        }
      });
    fetch("/api/admin/sync")
      .then((r) => r.json())
      .then((s: SyncState) => setSync(s));
  }, []);

  async function triggerSync() {
    const res = await fetch("/api/admin/sync", { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setSync((s) => s ? { ...s, status: "error", error: data.error ?? "Помилка" } : s);
      return;
    }
    setSync((s) => s ? { ...s, status: "syncing" } : s);
    // Poll every 2 s until done
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    syncPollRef.current = setInterval(async () => {
      const r = await fetch("/api/admin/sync").then((x) => x.json()) as SyncState;
      setSync(r);
      if (r.status !== "syncing") {
        clearInterval(syncPollRef.current!);
        syncPollRef.current = null;
        // Refresh stats count
        fetch("/api/admin/stats").then((x) => x.json()).then((d: Stats) => setStats(d));
      }
    }, 2000);
  }

  // Load products when navigating to that section
  useEffect(() => {
    if (section === "products" && !prodLoaded.current) {
      prodLoaded.current = true;
      loadProducts("");
    }
  }, [section]);

  // Load orders when navigating to that section or filter changes
  useEffect(() => {
    if (section === "orders") loadOrders(orderStatusFilter, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, orderStatusFilter]);

  async function loadProducts(q: string) {
    setProdLoading(true);
    try {
      const res = await fetch(`/api/admin/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (res.ok) setProducts(await res.json());
    } finally {
      setProdLoading(false);
    }
  }

  async function loadOrders(status: string, page: number) {
    setOrdersLoading(true);
    setOrderNoCreds(false);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/orders?${params}`);
      if (res.status === 503) { setOrderNoCreds(true); return; }
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
        setOrdersPage(page);
      }
    } finally {
      setOrdersLoading(false);
    }
  }

  function update(fn: (c: SiteContent) => SiteContent) {
    setContent(fn);
    setUnsaved(true);
  }

  async function saveContent() {
    setContentStatus("saving");
    const res = await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (res.ok) {
      setContentStatus("saved");
      setUnsaved(false);
      setTimeout(() => setContentStatus("idle"), 2500);
    } else {
      setContentStatus("error");
      setTimeout(() => setContentStatus("idle"), 3000);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const navLabel = NAV.find((n) => n.id === section)?.label ?? "";

  return (
    <div className="fixed inset-0 z-[60] flex overflow-hidden bg-[#f7f5f2] font-sans text-[#17130f]">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col bg-[#17130f] text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="font-display text-lg tracking-[0.14em]">MANIA GROUP</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/35">Адмін-панель</p>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-4">
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
              {item.id === "orders" && stats?.has_wc_creds && (stats.processing ?? 0) + (stats.pending ?? 0) > 0 && (
                <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c0392b] px-1 text-[9px] tabular-nums text-white">
                  {(stats.processing ?? 0) + (stats.pending ?? 0)}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-white/10 px-2 py-3">
          <a
            href="/"
            target="_blank"
            className="flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:text-white/55"
          >
            <SvgIcon d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            Сайт
          </a>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:text-white/55"
          >
            <SvgIcon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            Вийти
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e8e4de] bg-white px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium">{navLabel}</h1>
            {unsaved && section === "content" && (
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Незбережено
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {section === "content" && (
              <button
                onClick={saveContent}
                disabled={contentStatus === "saving" || (!unsaved && contentStatus === "idle")}
                className={`h-8 rounded-[3px] px-5 text-[11px] uppercase tracking-[0.12em] transition-all ${
                  contentStatus === "saved"
                    ? "bg-emerald-600 text-white"
                    : contentStatus === "error"
                    ? "bg-red-600 text-white"
                    : unsaved
                    ? "bg-[#17130f] text-white hover:opacity-85"
                    : "cursor-default bg-[#17130f]/10 text-[#17130f]/30"
                }`}
              >
                {contentStatus === "saving"
                  ? "Зберігаємо…"
                  : contentStatus === "saved"
                  ? "✓ Збережено"
                  : contentStatus === "error"
                  ? "Помилка"
                  : "Зберегти"}
              </button>
            )}
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-8 py-7">
          {section === "overview" && (
            <OverviewSection
              stats={stats}
              recentOrders={recentOrders}
              sync={sync}
              onNavigate={setSection}
              onSync={triggerSync}
            />
          )}
          {section === "content" && (
            <ContentSection content={content} update={update} />
          )}
          {section === "products" && (
            <ProductsSection
              products={products}
              loading={prodLoading}
              search={prodSearch}
              editing={editing}
              priceStatus={priceStatus}
              onSearch={(q) => { setProdSearch(q); loadProducts(q); }}
              onStartEdit={(p) => {
                setPriceStatus("idle");
                setEditing({ id: p.id, regularPrice: String(p.oldPrice ?? p.price), salePrice: p.oldPrice ? String(p.price) : "" });
              }}
              onCancelEdit={() => { setEditing(null); setPriceStatus("idle"); }}
              onSaveEdit={async () => {
                if (!editing) return;
                setPriceStatus("saving");
                const res = await fetch(`/api/admin/products/${editing.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ regular_price: editing.regularPrice, sale_price: editing.salePrice || "" }),
                });
                if (res.status === 503) { setPriceStatus("no-creds"); return; }
                if (res.ok) {
                  setPriceStatus("saved");
                  setEditing(null);
                  loadProducts(prodSearch);
                  setTimeout(() => setPriceStatus("idle"), 2500);
                } else {
                  setPriceStatus("error");
                  setTimeout(() => setPriceStatus("idle"), 3000);
                }
              }}
              onEditChange={(field, val) => setEditing((e) => e && { ...e, [field]: val })}
            />
          )}
          {section === "orders" && (
            <OrdersSection
              orders={orders}
              loading={ordersLoading}
              statusFilter={orderStatusFilter}
              page={ordersPage}
              noCreds={orderNoCreds}
              onStatusChange={(s) => { setOrderStatusFilter(s); setOrdersPage(1); }}
              onPageChange={(p) => loadOrders(orderStatusFilter, p)}
            />
          )}
          {section === "backup" && <BackupSection />}
          {section === "settings" && <SettingsSection />}
        </main>
      </div>
    </div>
  );
}

/* ─── Overview ─── */

function OverviewSection({
  stats,
  recentOrders,
  sync,
  onNavigate,
  onSync,
}: {
  stats: Stats | null;
  recentOrders: WcOrder[];
  sync: SyncState | null;
  onNavigate: (s: Section) => void;
  onSync: () => void;
}) {
  const loading = stats === null;

  return (
    <div className="space-y-7">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Товари в каталозі"
          value={loading ? "…" : String(stats!.products_total || "—")}
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          onClick={() => onNavigate("products")}
        />
        <StatCard
          label="В обробці"
          value={loading ? "…" : stats!.has_wc_creds ? String(stats!.processing ?? 0) : "—"}
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          accent={(stats?.processing ?? 0) > 0}
          onClick={() => onNavigate("orders")}
        />
        <StatCard
          label="Очікують оплати"
          value={loading ? "…" : stats!.has_wc_creds ? String(stats!.pending ?? 0) : "—"}
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          onClick={() => onNavigate("orders")}
        />
        <StatCard
          label="На утриманні"
          value={loading ? "…" : stats!.has_wc_creds ? String(stats!.on_hold ?? 0) : "—"}
          icon="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          onClick={() => onNavigate("orders")}
        />
      </div>

      {/* No WC creds hint */}
      {stats && !stats.has_wc_creds && (
        <div className="rounded-[3px] border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-[12px] text-amber-700">
            <strong>Без WooCommerce API ключів</strong> — статистика замовлень недоступна. Додайте{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">WOOCOMMERCE_KEY</code> та{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">WOOCOMMERCE_SECRET</code>{" "}
            у .env.local і перезапустіть сервер.
          </p>
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        {(
          [
            { label: "Редагувати контент", section: "content" as Section },
            { label: "Товари та ціни", section: "products" as Section },
            { label: "Замовлення", section: "orders" as Section },
            { label: "Резервна копія", section: "backup" as Section },
          ] as { label: string; section: Section }[]
        ).map(({ label, section }) => (
          <button
            key={section}
            onClick={() => onNavigate(section)}
            className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-4 text-[11px] uppercase tracking-[0.12em] text-[#17130f] transition-colors hover:border-[#17130f]"
          >
            {label}
          </button>
        ))}
        <a
          href="https://maniagroup.com.ua/wp-admin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center gap-2 rounded-[3px] border border-[#e8e4de] bg-white px-4 text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d] transition-colors hover:border-[#17130f] hover:text-[#17130f]"
        >
          WordPress Admin
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>

      {/* Sync card */}
      <SyncCard sync={sync} onSync={onSync} />

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-[#9c8f7d]">Останні замовлення</h2>
            <button onClick={() => onNavigate("orders")} className="text-[11px] uppercase tracking-wider text-[#9c8f7d] underline underline-offset-2 hover:text-[#17130f]">
              Всі
            </button>
          </div>
          <div className="overflow-hidden rounded-[3px] border border-[#e8e4de] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                  <th className="px-4 py-3 text-left">№</th>
                  <th className="px-4 py-3 text-left">Покупець</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Товари</th>
                  <th className="px-4 py-3 text-right">Сума</th>
                  <th className="px-4 py-3 text-center">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f7f4f0]">
                {recentOrders.map((o) => {
                  const st = STATUS[o.status] ?? { label: o.status, bg: "#f5f5f5", color: "#555" };
                  return (
                    <tr key={o.id} className="hover:bg-[#fdfcfb]">
                      <td className="px-4 py-3 font-mono text-[12px] text-[#9c8f7d]">#{o.number}</td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-medium">{o.billing.first_name} {o.billing.last_name}</p>
                        {o.billing.phone && <p className="text-[11px] text-[#9c8f7d]">{o.billing.phone}</p>}
                      </td>
                      <td className="hidden px-4 py-3 text-[12px] text-[#9c8f7d] sm:table-cell">
                        {o.line_items.slice(0, 2).map((li) => (
                          <p key={li.id} className="truncate max-w-[200px]">{li.name} ×{li.quantity}</p>
                        ))}
                        {o.line_items.length > 2 && <p>+{o.line_items.length - 2} ще</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {Number(o.total).toLocaleString("uk-UA")} {o.currency_symbol}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncCard({ sync, onSync }: { sync: SyncState | null; onSync: () => void }) {
  const isSyncing = sync?.status === "syncing";
  const lastSync = sync?.last_sync
    ? new Date(sync.last_sync).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-[#e8e4de] bg-white px-6 py-4">
      <div className="flex items-center gap-4">
        {/* Source indicator */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                sync?.total_products ? "bg-emerald-500" : "bg-[#d0c8be]"
              }`}
            />
            <span className="text-[11px] uppercase tracking-[0.12em] text-[#17130f]">
              {sync?.total_products
                ? `SQLite · ${sync.total_products.toLocaleString("uk-UA")} товарів`
                : "SQLite порожній — джерело: WooCommerce API"}
            </span>
          </div>
          <p className="ml-4 text-[11px] text-[#9c8f7d]">
            {isSyncing
              ? "Синхронізація…"
              : lastSync
              ? `Останнє оновлення: ${lastSync}`
              : "Ніколи не синхронізовано"}
            {sync?.status === "error" && (
              <span className="ml-2 text-red-600">{sync.error}</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {sync?.status === "done" && (
          <span className="text-[11px] text-emerald-600">✓ Готово</span>
        )}
        <button
          onClick={onSync}
          disabled={isSyncing || !sync?.has_wc_creds}
          title={!sync?.has_wc_creds ? "Потрібні WC API ключі" : undefined}
          className="flex h-8 items-center gap-2 rounded-[3px] border border-[#e8e4de] bg-white px-4 text-[11px] uppercase tracking-[0.12em] text-[#17130f] transition-colors hover:border-[#17130f] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          {isSyncing ? "Синхронізація…" : "Синхронізувати"}
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-[3px] border border-[#e8e4de] bg-white p-5 text-left transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <span className={`text-3xl font-light tabular-nums ${accent ? "text-[#c0392b]" : "text-[#17130f]"}`}>
          {value}
        </span>
        <span className="text-[#d5cfc6] transition-colors group-hover:text-[#9c8f7d]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d={icon} />
          </svg>
        </span>
      </div>
      <span className="text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">{label}</span>
    </button>
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
  function contact(field: keyof SiteContent["contacts"], value: string) {
    update((c) => ({ ...c, contacts: { ...c.contacts, [field]: value } }));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card title="Рядок оголошень" subtitle="Темна смуга над меню на всіх сторінках">
        <Field
          label="Текст оголошення"
          value={content.announcement}
          onChange={(v) => update((c) => ({ ...c, announcement: v }))}
          placeholder="Безкоштовна доставка від 3 000 ₴…"
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

      <Card title="Блоки переваг" subtitle="4 плашки перед футером головної сторінки">
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

      <Card title="Контакти" subtitle="Відображаються у футері сайту">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Телефон" value={content.contacts.phone} onChange={(v) => contact("phone", v)} placeholder="+38 (0__) ___-__-__" />
          <Field label="Email" value={content.contacts.email} onChange={(v) => contact("email", v)} placeholder="info@example.com" />
          <Field label="Instagram (URL)" value={content.contacts.instagram} onChange={(v) => contact("instagram", v)} placeholder="https://instagram.com/…" />
          <Field label="Facebook (URL)" value={content.contacts.facebook} onChange={(v) => contact("facebook", v)} placeholder="https://facebook.com/…" />
          <div className="col-span-2">
            <Field label="Адреса" value={content.contacts.address} onChange={(v) => contact("address", v)} placeholder="Місто, вулиця" />
          </div>
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
  editing,
  priceStatus,
  onSearch,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
}: {
  products: Product[];
  loading: boolean;
  search: string;
  editing: EditState | null;
  priceStatus: PriceStatus;
  onSearch: (q: string) => void;
  onStartEdit: (p: Product) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditChange: (field: "regularPrice" | "salePrice", val: string) => void;
}) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Пошук товарів…"
          className="h-9 w-72 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-sm text-[#17130f] placeholder:text-[#b9ae9b] focus:border-[#17130f] focus:outline-none"
        />
        {loading
          ? <span className="text-[11px] text-[#9c8f7d]">Завантаження…</span>
          : products.length > 0 && <span className="text-[11px] text-[#9c8f7d]">{products.length} товарів</span>
        }
        {priceStatus === "saved" && <span className="text-[11px] text-emerald-600">✓ Ціну оновлено в WooCommerce</span>}
        {priceStatus === "error" && <span className="text-[11px] text-red-600">Помилка збереження</span>}
        {priceStatus === "no-creds" && (
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
        <div className="overflow-x-auto rounded-[3px] border border-[#e8e4de] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                <th className="w-10 px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Товар</th>
                <th className="px-4 py-3 text-left">Бренд</th>
                <th className="px-4 py-3 text-right">Ціна</th>
                <th className="px-4 py-3 text-right">Акція</th>
                <th className="px-4 py-3 text-center w-28">Статус</th>
                <th className="w-24 px-4 py-3" />
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
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editing.regularPrice}
                          onChange={(e) => onEditChange("regularPrice", e.target.value)}
                          className="h-8 w-28 rounded-[3px] border border-[#17130f]/30 bg-white px-2 text-right text-sm tabular-nums focus:border-[#17130f] focus:outline-none"
                          min="0"
                        />
                      ) : (
                        <span className="tabular-nums">{formatPrice(regularPrice)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editing.salePrice}
                          onChange={(e) => onEditChange("salePrice", e.target.value)}
                          className="h-8 w-28 rounded-[3px] border border-[#17130f]/30 bg-white px-2 text-right text-sm tabular-nums focus:border-[#17130f] focus:outline-none"
                          placeholder="0 = без акції"
                          min="0"
                        />
                      ) : salePrice != null ? (
                        <span className="font-medium tabular-nums text-[#c0392b]">{formatPrice(salePrice)}</span>
                      ) : (
                        <span className="text-[#d0c8be]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing && priceStatus === "saving" ? (
                        <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Збереження…</span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
                          style={{
                            background: p.tag === "sale" ? "#fff0ee" : p.tag === "last" ? "#fff8e1" : "#edfbf0",
                            color: p.tag === "sale" ? "#c0392b" : p.tag === "last" ? "#92600a" : "#1a6b34",
                          }}
                        >
                          {p.tag === "last" ? "Останній" : p.tag === "sale" ? "Sale" : "В наявності"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={onSaveEdit}
                            disabled={priceStatus === "saving"}
                            title="Зберегти"
                            className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-[#17130f] text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M20 6L9 17l-5-5" /></svg>
                          </button>
                          <button
                            onClick={onCancelEdit}
                            title="Скасувати"
                            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-[#e8e4de] text-[#9c8f7d] transition-colors hover:text-[#17130f]"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            onClick={() => onStartEdit(p)}
                            title="Редагувати ціну"
                            className="flex h-7 w-7 items-center justify-center rounded-[3px] text-[#b9ae9b] transition-colors hover:bg-[#f0ece6] hover:text-[#17130f]"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5Z" />
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
        Редагування цін потребує WooCommerce REST API ключів у .env.local
      </p>
    </div>
  );
}

/* ─── Orders ─── */

const ORDER_STATUSES = [
  { value: "", label: "Всі" },
  { value: "pending", label: "Очікує оплати" },
  { value: "processing", label: "В обробці" },
  { value: "on-hold", label: "На утриманні" },
  { value: "completed", label: "Виконано" },
  { value: "cancelled", label: "Скасовано" },
];

function OrdersSection({
  orders,
  loading,
  statusFilter,
  page,
  noCreds,
  onStatusChange,
  onPageChange,
}: {
  orders: WcOrder[];
  loading: boolean;
  statusFilter: string;
  page: number;
  noCreds: boolean;
  onStatusChange: (s: string) => void;
  onPageChange: (p: number) => void;
}) {
  if (noCreds) {
    return (
      <div className="rounded-[3px] border border-amber-200 bg-amber-50 px-6 py-8 text-center">
        <p className="text-sm font-medium text-amber-800">Потрібні WooCommerce API ключі</p>
        <p className="mt-2 text-[12px] text-amber-600">
          Додайте <code className="rounded bg-amber-100 px-1 font-mono">WOOCOMMERCE_KEY</code> і{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">WOOCOMMERCE_SECRET</code> у .env.local
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {ORDER_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => onStatusChange(s.value)}
            className={`h-8 rounded-[3px] px-4 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              statusFilter === s.value
                ? "bg-[#17130f] text-white"
                : "border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-[3px] bg-[#ede9e3]" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-[3px] border border-[#e8e4de] bg-white px-4 py-12 text-center text-sm text-[#9c8f7d]">
          Замовлень немає
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-[#e8e4de] bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                <th className="px-4 py-3 text-left">№ Замовлення</th>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-left">Покупець</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Товари</th>
                <th className="px-4 py-3 text-right">Сума</th>
                <th className="px-4 py-3 text-center">Статус</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {orders.map((o) => {
                const st = STATUS[o.status] ?? { label: o.status, bg: "#f5f5f5", color: "#555" };
                const date = new Date(o.date_created).toLocaleDateString("uk-UA", {
                  day: "2-digit", month: "2-digit", year: "2-digit",
                });
                return (
                  <tr key={o.id} className="hover:bg-[#fdfcfb]">
                    <td className="px-4 py-3 font-mono text-[12px] font-medium text-[#17130f]">#{o.number}</td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-[#9c8f7d]">{date}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium">{o.billing.first_name} {o.billing.last_name}</p>
                      {o.billing.phone && <p className="text-[11px] text-[#9c8f7d]">{o.billing.phone}</p>}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {o.line_items.slice(0, 2).map((li) => (
                        <p key={li.id} className="max-w-[180px] truncate text-[12px] text-[#9c8f7d]">
                          {li.name} ×{li.quantity}
                        </p>
                      ))}
                      {o.line_items.length > 2 && (
                        <p className="text-[11px] text-[#b9ae9b]">+{o.line_items.length - 2} ще</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {Number(o.total).toLocaleString("uk-UA")} {o.currency_symbol}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://maniagroup.com.ua/wp-admin/post.php?post=${o.id}&action=edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Відкрити в WP"
                        className="flex h-7 w-7 items-center justify-center rounded-[3px] text-[#b9ae9b] transition-colors hover:bg-[#f0ece6] hover:text-[#17130f]"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && orders.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] transition-colors hover:border-[#17130f] hover:text-[#17130f] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="min-w-12 text-center text-[12px] text-[#9c8f7d]">Стор. {page}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={orders.length < 20}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] transition-colors hover:border-[#17130f] hover:text-[#17130f] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      )}
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
      <Card title="Резервна копія контенту" subtitle="JSON-файл з усім редагованим вмістом сайту">
        <div className="flex items-center gap-4">
          <a
            href="/api/admin/export"
            download
            className="inline-flex h-9 items-center rounded-[3px] bg-[#17130f] px-5 text-[11px] uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-85"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 12m4 4V4" />
            </svg>
            Завантажити JSON
          </a>
          <span className="text-[12px] text-[#9c8f7d]">maniagroup-backup-YYYY-MM-DD.json</span>
        </div>
      </Card>

      <Card title="Відновлення з файлу" subtitle="Завантажте раніше збережену копію — перезапише поточний контент">
        <div className="flex flex-wrap items-center gap-4">
          <label className={`inline-flex h-9 cursor-pointer items-center rounded-[3px] border border-[#e8e4de] bg-white px-5 text-[11px] uppercase tracking-[0.12em] text-[#17130f] transition-colors hover:bg-[#f7f5f2] ${importStatus === "importing" ? "pointer-events-none opacity-50" : ""}`}>
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

      <Card title="Що входить до резервної копії">
        <ul className="space-y-2 text-[12px] text-[#9c8f7d]">
          {[
            "Рядок оголошень",
            "Hero-блок (заголовки, підзаголовок)",
            "Блоки переваг (4 плашки)",
            "Контакти (телефон, email, посилання)",
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
          <InfoRow label="Сайт" value="maniagroup.com.ua" />
          <InfoRow label="WC Store API" value="maniagroup.com.ua/wp-json/wc/store" />
          <InfoRow label="VPS" value="173.242.49.73 · pm2 maniagroup · :3020" />
        </div>
      </Card>

      <Card title="WooCommerce REST API" subtitle="Потрібно для редагування цін товарів та перегляду замовлень">
        <div className="space-y-3">
          <p className="text-[12px] text-[#9c8f7d]">
            Згенеруйте ключі у WP Admin → WooCommerce → Налаштування → Додатково → REST API → «Додати ключ» (доступ: читання/запис).
          </p>
          <div className="rounded-[3px] border border-[#e8e4de] bg-[#f7f5f2] px-4 py-3 font-mono text-[12px] leading-relaxed text-[#9c8f7d]">
            WOOCOMMERCE_KEY=ck_xxxxxxxxxx<br />
            WOOCOMMERCE_SECRET=cs_xxxxxxxxxx
          </div>
          <p className="text-[11px] text-[#b9ae9b]">
            Додайте у файл .env.local на сервері і запустіть ./deploy.sh
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
          rsync → npm build → pm2 restart — запускається з локального комп'ютера.
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
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-wider text-[#9c8f7d]">{label}</span>
      <span className="font-mono text-[12px] text-[#17130f]">{value}</span>
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
      <span className="text-[10px] uppercase tracking-[0.14em] text-[#9c8f7d]">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-[3px] border border-[#e8e4de] bg-[#faf8f5] px-3 py-2 text-sm text-[#17130f] placeholder:text-[#cdc7bd] focus:border-[#17130f] focus:bg-white focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1.5 h-9 w-full rounded-[3px] border border-[#e8e4de] bg-[#faf8f5] px-3 text-sm text-[#17130f] placeholder:text-[#cdc7bd] focus:border-[#17130f] focus:bg-white focus:outline-none"
        />
      )}
    </label>
  );
}
