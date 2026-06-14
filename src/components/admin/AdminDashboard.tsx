"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteContent } from "@/lib/siteContent";

export function AdminDashboard({ initial }: { initial: SiteContent }) {
  const [content, setContent] = useState<SiteContent>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const router = useRouter();

  async function save() {
    setStatus("saving");
    await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function updateJournal(i: number, field: keyof SiteContent["journal"][number], value: string) {
    setContent((c) => ({
      ...c,
      journal: c.journal.map((j, idx) => (idx === i ? { ...j, [field]: value } : j)),
    }));
  }

  return (
    <section className="wrap py-12 md:py-16">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-luxe text-muted">Адмін-панель</p>
          <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Контент сайту</h1>
        </div>
        <button
          onClick={logout}
          className="link-underline text-[12px] uppercase tracking-luxe text-ink"
        >
          Вийти
        </button>
      </div>

      {/* Hero */}
      <div className="mt-10 border border-line p-6">
        <h2 className="text-[12px] uppercase tracking-luxe text-muted">Hero-блок головної</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label="Підпис над заголовком"
            value={content.hero.eyebrow}
            onChange={(v) => setContent((c) => ({ ...c, hero: { ...c.hero, eyebrow: v } }))}
          />
          <Field
            label="Заголовок — рядок 1"
            value={content.hero.titleLine1}
            onChange={(v) => setContent((c) => ({ ...c, hero: { ...c.hero, titleLine1: v } }))}
          />
          <Field
            label="Заголовок — акцент (курсив)"
            value={content.hero.titleAccent}
            onChange={(v) => setContent((c) => ({ ...c, hero: { ...c.hero, titleAccent: v } }))}
          />
          <Field
            label="Підзаголовок"
            value={content.hero.subtitle}
            onChange={(v) => setContent((c) => ({ ...c, hero: { ...c.hero, subtitle: v } }))}
            textarea
          />
        </div>
      </div>

      {/* Journal */}
      <div className="mt-8 border border-line p-6">
        <h2 className="text-[12px] uppercase tracking-luxe text-muted">Журнал — статті</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {content.journal.map((j, i) => (
            <div key={j.id} className="space-y-3 border border-line p-4">
              <Field label="Рубрика" value={j.kicker} onChange={(v) => updateJournal(i, "kicker", v)} />
              <Field label="Заголовок" value={j.title} onChange={(v) => updateJournal(i, "title", v)} textarea />
              <Field label="Час читання" value={j.read} onChange={(v) => updateJournal(i, "read", v)} />
              <Field label="Колір тону (hex)" value={j.tone} onChange={(v) => updateJournal(i, "tone", v)} />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={status === "saving"}
        className="mt-8 h-12 px-8 bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {status === "saving" ? "Зберігаємо…" : status === "saved" ? "Збережено ✓" : "Зберегти зміни"}
      </button>
    </section>
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
      <span className="text-[11px] uppercase tracking-luxe text-muted">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-2 w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 h-10 w-full border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none"
        />
      )}
    </label>
  );
}
