"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountLoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          placeholder="••••••" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading}
        className="mt-2 h-11 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50">
        {loading ? "Входимо…" : "Увійти"}
      </button>
    </form>
  );
}
