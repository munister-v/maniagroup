"use client";

import { useState } from "react";

export function NewsletterForm({ source = "home" }: { source?: string }) {
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
      <form onSubmit={submit} className="flex w-full items-center gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status !== "idle") setStatus("idle"); }}
          placeholder="Ваш e-mail"
          className="h-12 flex-1 border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "saving" || status === "done"}
          className="h-12 bg-ink px-6 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {status === "saving" ? "…" : status === "done" ? "✓" : "Підписатись"}
        </button>
      </form>
      <p className={`mt-3 text-xs ${status === "error" ? "text-[#b3392c]" : status === "done" ? "text-emerald-700" : "text-muted"}`}>
        {message || "Підписуючись, ви погоджуєтесь з політикою конфіденційності."}
      </p>
    </div>
  );
}
