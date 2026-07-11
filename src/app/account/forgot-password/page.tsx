"use client";

import { useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Always show the same confirmation, whether or not the email exists
      // or the send actually succeeded — see the route for why.
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <Reveal className="w-full max-w-sm">
        <div className="border border-line bg-white px-6 py-10 sm:px-10">
          <p className="text-center text-[11px] uppercase tracking-luxe text-muted">Mania Group</p>
          <h1 className="mt-3 text-center font-display text-3xl text-ink">Відновлення паролю</h1>

          {sent ? (
            <div className="mt-8 text-center">
              <div className="mb-4 text-4xl">✓</div>
              <p className="text-sm text-muted">
                Якщо акаунт з адресою <b className="text-ink">{email}</b> існує — ми надіслали інструкції на вашу пошту.
              </p>
              <p className="mt-4 text-[11px] text-muted">
                Не отримали? Зверніться до нас{" "}
                <a href="https://t.me/maniagroup_ua" target="_blank" rel="noreferrer" className="link-underline text-ink">
                  через Telegram
                </a>
                {" "}або зателефонуйте.
              </p>
              <Link
                href="/account/login"
                className="mt-6 inline-block text-[11px] uppercase tracking-luxe text-muted hover:text-ink link-underline"
              >
                ← Назад до входу
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <label className="block">
                <span className="text-[11px] uppercase tracking-luxe text-muted">Ваш Email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="h-11 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {loading ? "Надсилаємо…" : "Надіслати інструкції"}
              </button>
              <p className="text-center">
                <Link href="/account/login" className="text-[11px] text-muted hover:text-ink link-underline">
                  ← Назад до входу
                </Link>
              </p>
            </form>
          )}
        </div>
      </Reveal>
    </div>
  );
}
