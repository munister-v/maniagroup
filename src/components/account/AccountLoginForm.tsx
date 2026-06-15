"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountLoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      router.push(redirectTo);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-[11px] uppercase tracking-luxe text-muted">Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          placeholder="you@example.com" />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-luxe text-muted">Пароль</span>
        <div className="relative mt-1.5">
          <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full border border-line bg-white px-4 pr-11 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            placeholder="••••••" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
          >
            <PasswordIcon visible={showPassword} />
          </button>
        </div>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading}
        className="mt-2 h-11 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50">
        {loading ? "Входимо…" : "Увійти"}
      </button>
    </form>
  );
}

export function PasswordIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
      {visible ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6M6.5 6.6C4.4 8 2 12 2 12a17.7 17.7 0 0 0 5 5.4c1.4.9 3 1.6 5 1.6 1.1 0 2.1-.2 3-.5" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      )}
    </svg>
  );
}
