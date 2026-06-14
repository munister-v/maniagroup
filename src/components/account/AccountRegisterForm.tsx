"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountRegisterForm() {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", password: "", password2: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function set(field: string, val: string) { setForm((f) => ({ ...f, [field]: val })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.password2) { setError("Паролі не співпадають"); return; }
    if (form.password.length < 6) { setError("Пароль мінімум 6 символів"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, first_name: form.first_name, last_name: form.last_name, phone: form.phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      router.push("/account/profile");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const inp = "mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none";
  const lbl = "text-[11px] uppercase tracking-luxe text-muted";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={lbl}>Ім'я</span>
          <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inp} placeholder="Олексій" />
        </label>
        <label className="block">
          <span className={lbl}>Прізвище</span>
          <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inp} placeholder="Коваль" />
        </label>
      </div>
      <label className="block">
        <span className={lbl}>Email *</span>
        <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} placeholder="you@example.com" />
      </label>
      <label className="block">
        <span className={lbl}>Телефон</span>
        <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inp} placeholder="+38 (___) ___-__-__" />
      </label>
      <label className="block">
        <span className={lbl}>Пароль *</span>
        <input type="password" required value={form.password} onChange={(e) => set("password", e.target.value)} className={inp} placeholder="Мінімум 6 символів" />
      </label>
      <label className="block">
        <span className={lbl}>Повторіть пароль *</span>
        <input type="password" required value={form.password2} onChange={(e) => set("password2", e.target.value)} className={inp} placeholder="••••••" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading}
        className="mt-2 h-11 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50">
        {loading ? "Реєструємо…" : "Створити акаунт"}
      </button>
      <p className="text-center text-xs text-muted">
        Реєструючись, ви погоджуєтесь з умовами використання сайту
      </p>
    </form>
  );
}
