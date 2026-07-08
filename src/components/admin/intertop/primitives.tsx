"use client";

/* ─────────────────────────────────────────────────────────────────────────
   Intertop-style shared primitives for the /admin ERP reskin.
   Mirrors the partner.intertop.com component vocabulary:
   PageHeader (title + refresh + back), SubTabs (teal-underline), DetailCard
   (collapsible section with chevron), Field/ReadField (label-above / value),
   StatusDot. See memory: maniagroup-intertop-reskin.
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

const NAVY = "#2b2d42";
const TEAL = "#2f9488";
const MUTED = "#8a94a0";
const BORDER = "#e6eaec";

/** Page title bar — big bold title, optional ‹back arrow and ↻refresh, plus a
 *  right-aligned action slot. Matches Intertop's «‹ Товар 963431 ↻» header. */
export function PageHeader({
  title, subtitle, onBack, onRefresh, right,
}: {
  title: string; subtitle?: string;
  onBack?: () => void; onRefresh?: () => void; right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {onBack && (
        <button onClick={onBack} aria-label="Назад"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5a6472] transition-colors hover:bg-[#eef2f3] hover:text-[#2b2d42]">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-[#2b2d42]">
          <span className="truncate">{title}</span>
          {onRefresh && (
            <button onClick={onRefresh} aria-label="Оновити"
              className="shrink-0 text-[#aab4bf] transition-colors hover:text-[#2f9488]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#8a94a0]">{subtitle}</p>}
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Text tabs under a page title, teal underline on the active one.
 *  Matches «Товар · Торгові пропозиції · Історія статусів». */
export function SubTabs<T extends string>({
  tabs, active, onChange,
}: {
  tabs: { id: T; label: string; disabled?: boolean }[];
  active: T; onChange: (id: T) => void;
}) {
  return (
    <div className="mb-5 flex items-center gap-6 border-b border-[#e6eaec]">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 pb-2.5 text-[14px] transition-colors ${
              on ? "border-[#2f9488] font-medium text-[#2b2d42]"
                 : t.disabled ? "cursor-not-allowed border-transparent text-[#c3ccd4]"
                 : "border-transparent text-[#8a94a0] hover:text-[#2b2d42]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Collapsible section card — white, bordered, header with chevron.
 *  Matches Intertop's «Загальні дані ⌄» / «Дані про товар ⌄» panels. */
export function DetailCard({
  title, children, defaultOpen = true, right,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-4 rounded-[6px] border border-[#e6eaec] bg-white">
      <header className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <h3 className="text-[15px] font-semibold text-[#2b2d42]">{title}</h3>
        </button>
        {right}
        <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Згорнути" : "Розгорнути"}
          className="text-[#8a94a0] transition-transform hover:text-[#2b2d42]" style={{ transform: open ? "rotate(180deg)" : "none" }}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </header>
      {open && <div className="border-t border-[#eef2f3] px-5 py-5">{children}</div>}
    </section>
  );
}

/** Read-only «label above / value below» field, Intertop detail-card style. */
export function ReadField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[#8a94a0]">{label}</p>
      <p className="mt-1 truncate text-[14px] text-[#2b2d42]">{value ?? "—"}</p>
    </div>
  );
}

/** Colored dot + text status, e.g. «● На сайті», «● Чернетка». */
export function StatusDot({ color = MUTED, label }: { color?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-[13px] text-[#3a4250]">{label}</span>
    </span>
  );
}

/** Right-side slide-over drawer for editing, Intertop's «Редагувати …» panel.
 *  Header (title + ✕), scrollable body, sticky footer for actions. */
export function SlideOver({
  open, title, onClose, children, footer, width = "max-w-md",
}: {
  open: boolean; title: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className={`relative flex h-full w-full ${width} flex-col bg-white shadow-2xl`}>
        <header className="flex items-center justify-between border-b border-[#eef2f3] px-5 py-4">
          <h3 className="text-[16px] font-semibold text-[#2b2d42]">{title}</h3>
          <button onClick={onClose} aria-label="Закрити" className="text-[#8a94a0] transition-colors hover:text-[#2b2d42]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex gap-3 border-t border-[#eef2f3] px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export const IT = { NAVY, TEAL, MUTED, BORDER };
