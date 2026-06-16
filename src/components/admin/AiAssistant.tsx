"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Скільки замовлень очікують відправки?",
  "Які бренди продаються найкраще?",
  "Які товари закінчуються на складі?",
  "Яка виручка за останні 7 днів?",
  "Хто останні покупці?",
  "Що порадиш зробити сьогодні?",
];

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v1m0 16v1M4.22 4.22l.707.707m12.728 12.728.707.707M3 12h1m16 0h1M4.927 19.073l.707-.707M18.364 5.636l.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#9c8f7d] animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

// Format AI response: bold **text**, line breaks, bullet •
function Formatted({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return (
    <span>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return <strong key={i} className="font-semibold text-[#17130f]">{p.slice(2, -2)}</strong>;
        }
        if (p === "\n") return <br key={i} />;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

export function AiAssistant() {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // auto-scroll
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  // focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMsgs((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          message: text.trim(),
          history: msgs.slice(-8),
        }),
      });
      const d = await res.json();
      const aiMsg: Msg = {
        role: "assistant",
        content: d.text ?? (d.error ? `Помилка: ${d.error}` : "Вибачте, сталася помилка."),
      };
      setMsgs((prev) => [...prev, aiMsg]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Невідома помилка";
      setMsgs((prev) => [...prev, { role: "assistant", content: `Помилка мережі: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }, [loading, msgs]);

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const empty = msgs.length === 0;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="AI-асистент"
        className={`fixed bottom-8 right-6 z-[80] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
          open ? "bg-[#9c8f7d] text-white" : "bg-[#17130f] text-white hover:opacity-85"
        }`}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      <div className={`fixed bottom-24 right-6 z-[80] flex flex-col overflow-hidden rounded-[8px] border border-[#e8e4de] bg-white shadow-2xl transition-all duration-300 ${
        open ? "h-[520px] w-[360px] opacity-100" : "pointer-events-none h-0 w-[360px] opacity-0"
      }`}>
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[#f0ece6] bg-[#17130f] px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white">
            <Sparkle />
          </div>
          <div>
            <p className="text-[12px] font-medium tracking-wide text-white">AI-асистент</p>
            <p className="text-[10px] text-white/50">Питай про магазин — відповідаю по даним</p>
          </div>
          <button onClick={() => setMsgs([])} title="Очистити чат"
            className="ml-auto text-[10px] uppercase tracking-wider text-white/30 hover:text-white/60">
            Очистити
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {empty && (
            <div className="space-y-3">
              <p className="text-[12px] text-[#9c8f7d]">Привіт! Я знаю все про ваш магазин. Запитайте що завгодно:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="rounded-full border border-[#e8e4de] px-3 py-1.5 text-[11px] text-[#17130f] hover:border-[#17130f] hover:bg-[#f7f5f2] transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#17130f] text-white">
                  <Sparkle />
                </div>
              )}
              <div className={`max-w-[82%] rounded-[10px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-tr-[3px] bg-[#17130f] text-white"
                  : "rounded-tl-[3px] bg-[#f7f5f2] text-[#17130f]"
              }`}>
                {m.role === "assistant" ? <Formatted text={m.content} /> : m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#17130f] text-white">
                <Sparkle />
              </div>
              <div className="rounded-[10px] rounded-tl-[3px] bg-[#f7f5f2] px-3.5 py-2.5">
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-[#f0ece6] p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Запитайте про магазин…"
              className="flex-1 resize-none rounded-[6px] border border-[#e8e4de] bg-[#fafaf8] px-3 py-2 text-[13px] text-[#17130f] placeholder:text-[#b9ae9b] focus:border-[#17130f] focus:outline-none"
              style={{ maxHeight: 80, overflowY: "auto" }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[#17130f] text-white transition-opacity hover:opacity-80 disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[#b9ae9b]">Enter — надіслати · Shift+Enter — новий рядок</p>
        </div>
      </div>
    </>
  );
}

// ── AiInsights card for Overview ─────────────────────────────────────────────

export function AiInsights() {
  const [text, setText]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "insights" }),
      });
      const d = await r.json();
      setText(d.text ?? null);
      setLoaded(true);
    } catch {
      setText("Не вдалося отримати аналіз. Перевірте OPENROUTER_API_KEY.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[4px] border border-[#17130f]/20 bg-[#17130f] text-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
            <Sparkle />
          </div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-white/60">AI-дайджест</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-7 items-center gap-1.5 rounded-[3px] border border-white/15 px-3 text-[11px] uppercase tracking-[0.1em] text-white/60 hover:border-white/30 hover:text-white/90 disabled:opacity-40 transition-colors"
        >
          {loading ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
              Аналізую…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0 1 20 12M20 20l-1.5-1.5A9 9 0 0 1 4 12" />
              </svg>
              {loaded ? "Оновити" : "Отримати аналіз"}
            </>
          )}
        </button>
      </div>

      {!loaded && !loading && (
        <p className="text-[13px] text-white/40">Натисніть «Отримати аналіз» — AI проаналізує поточний стан магазину та дасть рекомендації.</p>
      )}
      {loading && (
        <div className="space-y-2">
          {[1,2,3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/10" style={{ width: `${75 + i * 8}%` }} />
          ))}
        </div>
      )}
      {text && !loading && (
        <div className="space-y-1.5 text-[13px] leading-relaxed text-white/80">
          {text.split("\n").filter(Boolean).map((line, i) => (
            <p key={i} className={line.startsWith("•") || line.startsWith("-") || line.startsWith("*") ? "flex gap-2" : ""}>
              {(line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) && (
                <span className="mt-0.5 h-4 w-1 shrink-0 rounded-full bg-white/30" />
              )}
              <Formatted text={line.replace(/^[•\-\*]\s*/, "")} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Social post generator button ─────────────────────────────────────────────

type ProductInfo = {
  name: string; brand: string; category: string; color?: string;
  season?: string; composition?: string; price: string; oldPrice?: string; inStock: string;
};

export function SocialPostButton({ product, onToast }: { product: ProductInfo; onToast?: (m: string) => void }) {
  const [open, setOpen]       = useState(false);
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode]       = useState<"post" | "desc">("post");

  async function generate(action: "social-post" | "product-desc") {
    setLoading(true);
    setText("");
    try {
      const r = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, product }),
      });
      const d = await r.json();
      setText(d.text ?? "Помилка генерації");
    } finally { setLoading(false); }
  }

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    onToast?.("Скопійовано!");
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setMode("post"); setText(""); }}
        title="AI: пост для соцмереж"
        className="flex items-center gap-1 rounded-[3px] border border-[#e8e4de] px-2.5 py-1.5 text-[11px] text-[#17130f] hover:border-[#17130f] transition-colors"
      >
        <Sparkle /> AI
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/30" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-[110] w-[520px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-white shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#f0ece6] px-5 py-4">
              <div>
                <p className="text-[13px] font-medium text-[#17130f]">{product.brand} · {product.name}</p>
                <p className="text-[11px] text-[#9c8f7d]">AI-генератор контенту</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#9c8f7d] hover:text-[#17130f]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 border-b border-[#f0ece6] px-5 pt-3">
              {([["post","📣 Пост для соцмереж"],["desc","📝 Опис товару"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => { setMode(id); setText(""); }}
                  className={`mb-[-1px] rounded-t-[4px] border border-b-white px-4 py-2 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                    mode === id ? "border-[#e8e4de] bg-white text-[#17130f]" : "border-transparent text-[#9c8f7d] hover:text-[#17130f]"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <button
                onClick={() => generate(mode === "post" ? "social-post" : "product-desc")}
                disabled={loading}
                className="flex h-10 w-full items-center justify-center gap-2 bg-[#17130f] text-[11px] uppercase tracking-wider text-white hover:opacity-85 disabled:opacity-50 rounded-[4px]"
              >
                {loading ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Генерую…</>
                ) : (
                  <><Sparkle /> {text ? "Перегенерувати" : "Згенерувати"}</>
                )}
              </button>

              {text && (
                <div className="relative rounded-[4px] border border-[#e8e4de] bg-[#fafaf8] p-4">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#17130f]">{text}</p>
                  <button onClick={copy}
                    className="mt-3 flex h-8 items-center gap-1.5 rounded-[3px] border border-[#e8e4de] px-3 text-[11px] uppercase tracking-[0.1em] text-[#17130f] hover:border-[#17130f]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Скопіювати
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
