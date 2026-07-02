"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else if (res.status === 429) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "Забагато спроб — спробуйте пізніше.");
    } else {
      setError("Невірний пароль");
    }
  }

  return (
    <section className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-ink">Адмін-панель</h1>
        <p className="mt-2 text-sm text-muted">Mania Group · вхід</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          className="mt-6 h-12 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-[#b3392c]">{error}</p>}
        <button
          type="submit"
          className="mt-4 h-12 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85"
        >
          Увійти
        </button>
      </form>
    </section>
  );
}
