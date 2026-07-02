"use client";

import { useCallback, useEffect, useState } from "react";

/* ── types (mirror /api/admin/monitoring) ── */
type ActivityRow = { id: string; action: string; summary: string; count: number | null; author: string; created_at: string };
type ImportEntry = { filename: string; productsCreated: number; productsUpdated: number; stockMovements: number; unmatchedRows: number; at: string };
type Monitoring = {
  db: { ok: boolean; products: number; orders: number; variants: number };
  backups: { count: number; latestName: string | null; latestAt: string | null; latestSize: number | null; totalSize: number };
  disk: { totalBytes: number; freeBytes: number; usedPct: number } | null;
  lastImport: ImportEntry | null;
  activity: ActivityRow[];
  secretConfigured: boolean;
  dbUrlConfigured: boolean;
  now: string;
};

/* ── helpers ── */
function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} МБ`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
}
function ago(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв тому`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}
function dt(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ACTION_META: Record<string, { label: string; color: string }> = {
  import:     { label: "Імпорт",      color: "bg-blue-50 text-blue-700 border-blue-200" },
  export:     { label: "Експорт",     color: "bg-violet-50 text-violet-700 border-violet-200" },
  save:       { label: "Збереження",  color: "bg-amber-50 text-amber-700 border-amber-200" },
  delete:     { label: "Видалення",   color: "bg-red-50 text-red-700 border-red-200" },
  backup:     { label: "Бекап",       color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  photos:     { label: "Фото",        color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  settings:   { label: "Налаштування",color: "bg-[#f3efe8] text-[#6b6253] border-[#e5ded3]" },
  login:      { label: "Вхід",        color: "bg-[#f3efe8] text-[#6b6253] border-[#e5ded3]" },
  login_fail: { label: "Невдалий вхід", color: "bg-red-50 text-red-700 border-red-200" },
};

/* ── card ── */
function HealthCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const dot = tone === "bad" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : tone === "ok" ? "bg-emerald-500" : "bg-[#c9bdab]";
  return (
    <div className="rounded-[5px] border border-[#e8e4de] bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-[10px] uppercase tracking-[0.1em] text-[#9c8f7d]">{label}</p>
      </div>
      <p className="mt-1.5 text-[20px] font-medium tabular-nums text-[#17130f]">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[#9c8f7d]">{sub}</p>}
    </div>
  );
}

const FILTERS: { v: string; l: string }[] = [
  { v: "", l: "Всі" },
  { v: "import", l: "Імпорт" },
  { v: "export", l: "Експорт" },
  { v: "save", l: "Збереження" },
  { v: "delete", l: "Видалення" },
  { v: "photos", l: "Фото" },
  { v: "backup", l: "Бекап" },
  { v: "login,login_fail", l: "Входи" },
];

export function MonitoringSection() {
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/monitoring")
      .then((r) => r.json())
      .then((d) => setData(d as Monitoring))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // live-ish: refresh every 30s
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <p className="text-[13px] text-[#9c8f7d]">Завантаження стану системи…</p>;
  if (!data) return <p className="text-[13px] text-red-600">Не вдалося отримати стан системи.</p>;

  const backupAgeH = data.backups.latestAt ? (Date.now() - new Date(data.backups.latestAt).getTime()) / 3600000 : Infinity;
  const backupTone: "ok" | "warn" | "bad" = data.backups.count === 0 ? "bad" : backupAgeH > 26 ? "warn" : "ok";
  const diskTone: "ok" | "warn" | "bad" = !data.disk ? "ok" : data.disk.usedPct >= 90 ? "bad" : data.disk.usedPct >= 80 ? "warn" : "ok";

  return (
    <div className="max-w-4xl space-y-6">
      {/* config warnings */}
      {(!data.secretConfigured || !data.dbUrlConfigured) && (
        <div className="rounded-[5px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">
          {!data.dbUrlConfigured && <p>⚠ DATABASE_URL не налаштовано в оточенні.</p>}
          {!data.secretConfigured && <p>⚠ ADMIN_SECRET не налаштовано — сесії вразливі. Задайте його в .env.local.</p>}
        </div>
      )}

      {/* health grid */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Стан системи</h2>
          <button onClick={load} className="text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">↻ Оновити</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HealthCard label="База даних" value={data.db.ok ? "OK" : "Помилка"} sub={data.db.ok ? "PostgreSQL" : undefined} tone={data.db.ok ? "ok" : "bad"} />
          <HealthCard label="Товарів" value={data.db.products.toLocaleString("uk-UA")} sub={`${data.db.variants.toLocaleString("uk-UA")} розмірів`} />
          <HealthCard label="Замовлень" value={data.db.orders.toLocaleString("uk-UA")} />
          <HealthCard
            label="Диск"
            value={data.disk ? `${data.disk.usedPct}%` : "—"}
            sub={data.disk ? `вільно ${fmtBytes(data.disk.freeBytes)}` : undefined}
            tone={diskTone}
          />
          <HealthCard
            label="Останній бекап"
            value={data.backups.latestAt ? ago(data.backups.latestAt) : "немає"}
            sub={data.backups.count > 0 ? `${data.backups.count} копій · ${fmtBytes(data.backups.latestSize)}` : "щоночі о 03:00"}
            tone={backupTone}
          />
          <HealthCard
            label="Останній імпорт"
            value={data.lastImport ? ago(data.lastImport.at) : "немає"}
            sub={data.lastImport ? `+${data.lastImport.productsCreated} · ${data.lastImport.stockMovements} рухів` : undefined}
          />
          <HealthCard label="Всього бекапів" value={fmtBytes(data.backups.totalSize)} sub={`${data.backups.count} файлів`} />
          <HealthCard label="Сесії" value={data.secretConfigured ? "Захищено" : "Вразливо"} tone={data.secretConfigured ? "ok" : "bad"} />
        </div>
      </div>

      {/* activity feed */}
      <div>
        <h2 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]">Журнал активності</h2>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={`rounded-[3px] px-2.5 py-1 text-[11px] transition-colors ${
                filter === f.v ? "bg-[#17130f] text-white" : "border border-[#e8e4de] bg-white text-[#6b6253] hover:border-[#17130f]"
              }`}>{f.l}</button>
          ))}
        </div>
        {(() => {
          const allowed = filter ? new Set(filter.split(",")) : null;
          const rows = allowed ? data.activity.filter((a) => allowed.has(a.action)) : data.activity;
          return rows.length === 0 ? (
            <p className="rounded-[5px] border border-[#e8e4de] bg-white px-4 py-6 text-center text-[12px] text-[#b9ae9b]">Немає записів для цього фільтра.</p>
          ) : (
          <div className="divide-y divide-[#f0ece6] rounded-[5px] border border-[#e8e4de] bg-white">
            {rows.map((a) => {
              const meta = ACTION_META[a.action] ?? { label: a.action, color: "bg-[#f3efe8] text-[#6b6253] border-[#e5ded3]" };
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12px]">
                  <span className={`shrink-0 rounded-[3px] border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] ${meta.color}`}>{meta.label}</span>
                  <span className="min-w-0 flex-1 text-[#3a3a3a]">{a.summary}</span>
                  <span className="shrink-0 text-[11px] text-[#b9ae9b]" title={dt(a.created_at)}>{ago(a.created_at)}</span>
                </div>
              );
            })}
          </div>
          );
        })()}
        <p className="mt-2 text-[11px] text-[#b9ae9b]">Оновлюється автоматично кожні 30 секунд. Зберігаються останні 500 подій.</p>
      </div>
    </div>
  );
}
