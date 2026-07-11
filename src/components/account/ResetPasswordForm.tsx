"use client";
import { useState } from "react";
import Link from "next/link";
import { PasswordIcon } from "./AccountLoginForm";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== password2) { setError("Паролі не співпадають"); return; }
    if (password.length < 6) { setError("Пароль мінімум 6 символів"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 text-center">
        <div className="mb-4 text-4xl">✓</div>
        <p className="text-sm text-muted">Пароль змінено. Тепер можна увійти з новим паролем.</p>
        <Link href="/account/login"
          className="mt-6 inline-flex h-11 w-full items-center justify-center bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85">
          Увійти
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-[11px] uppercase tracking-luxe text-muted">Новий пароль</span>
        <div className="relative mt-1.5">
          <input
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Мінімум 6 символів"
            autoComplete="new-password"
            className="h-11 w-full border border-line bg-white px-4 pr-11 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button type="button" onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink">
            <PasswordIcon visible={showPassword} />
          </button>
        </div>
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-luxe text-muted">Повторіть пароль</span>
        <input
          type={showPassword ? "text" : "password"}
          required
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          autoComplete="new-password"
          className="mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />
      </label>
      {error && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="h-11 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {loading ? "Зберігаємо…" : "Змінити пароль"}
      </button>
      <p className="text-center">
        <Link href="/account/login" className="text-[11px] text-muted hover:text-ink link-underline">
          ← Назад до входу
        </Link>
      </p>
    </form>
  );
}
