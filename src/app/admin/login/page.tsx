"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_BASE } from "@/lib/adminPath";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember }),
      });
      if (res.ok) {
        router.push(ADMIN_BASE);
        router.refresh();
      } else if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Забагато спроб — спробуйте пізніше.");
      } else {
        setError("Невірний пароль");
      }
    } catch {
      setError("Не вдалося з'єднатися. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} method="post" className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-ink">Адмін-панель</h1>
        <p className="mt-2 text-sm text-muted">Mania Group · вхід</p>

        {/*
          Менеджери паролів (Keychain, 1Password, Chrome) зберігають пару
          «логін + пароль». Логіна в нас нема — панель одна на всіх, — тож
          віддаємо приховане стале значення: без нього браузер часто просто
          не пропонує зберегти пароль.
        */}
        <input
          type="text"
          name="username"
          value="mania-admin"
          autoComplete="username"
          readOnly
          hidden
          aria-hidden="true"
          tabIndex={-1}
        />

        <input
          type="password"
          name="password"
          id="admin-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          className="mt-6 h-12 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          autoFocus
        />

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          Запам&apos;ятати мене на 60 днів
        </label>

        {error && <p className="mt-2 text-sm text-[#b3392c]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-12 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {busy ? "Вхід…" : "Увійти"}
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Без галочки сесія живе 7 днів. На чужому чи спільному комп&apos;ютері
          не вмикайте — і не зберігайте пароль у браузері.
        </p>
      </form>
    </section>
  );
}
