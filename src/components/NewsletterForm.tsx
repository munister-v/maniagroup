"use client";

import { useState } from "react";

export function NewsletterForm({ source = "home", tone = "light" }: { source?: string; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Не вдалося підписатися");
        return;
      }
      setStatus("done");
      setMessage(data.status === "exists" ? "Ви вже з нами — дякуємо!" : "Готово! Перевірте пошту.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Помилка з'єднання");
    }
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={submit} className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status !== "idle") setStatus("idle"); }}
          placeholder="Ваш e-mail"
          className={`h-12 w-full px-4 text-sm focus:outline-none sm:flex-1 ${
            dark
              ? "border border-paper/25 bg-transparent text-paper placeholder:text-paper/40 focus:border-paper"
              : "border border-line bg-white text-ink placeholder:text-muted focus:border-ink"
          }`}
        />
        <button
          type="submit"
          disabled={status === "saving" || status === "done"}
          className={`h-12 shrink-0 px-6 text-[12px] uppercase tracking-luxe transition-opacity hover:opacity-85 disabled:opacity-50 ${
            dark ? "bg-paper text-ink" : "bg-ink text-paper"
          }`}
        >
          {status === "saving" ? "…" : status === "done" ? "✓" : "Підписатись"}
        </button>
      </form>
      <p className={`mt-3 text-xs ${
        status === "error" ? "text-[#e8a59c]" : status === "done" ? (dark ? "text-emerald-300" : "text-emerald-700") : (dark ? "text-paper/40" : "text-muted")
      }`}>
        {message || "Підписуючись, ви погоджуєтесь з політикою конфіденційності."}
      </p>
    </div>
  );
}
