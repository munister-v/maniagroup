"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Код товару, який можна забрати одним кліком.
 *
 * Коди тут існують саме для того, щоб їх кудись перенести — в пошук, у
 * повідомлення менеджеру, в замовлення постачальнику. Виділяти мишею рядок
 * на кшталт «40: 18768-40 · 42: 18768-42» незручно, а на телефоні майже
 * неможливо, тож даємо клік.
 *
 * Копіюємо `value` (справжній код), а не текст із розміткою — на екрані може
 * стояти підпис розміру, а в буфер має лягти сам код.
 */
export function CopyCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);

  // Таймер живе довше за клік: без прибирання React лається на setState у
  // розмонтованому компоненті, коли покупець пішов зі сторінки одразу після
  // копіювання.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /**
   * Запасний шлях для випадків, коли clipboard API недоступний: HTTP-контекст,
   * заборонений дозвіл «clipboard-write», старий Safari. Кладемо код у
   * прихований textarea і копіюємо старим execCommand — він працює без
   * асинхронного дозволу.
   */
  function copyFallback(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Поза екраном, але не display:none — з невидимого елемента виділення не
    // працює, а разом з ним і копіювання.
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      ok = copyFallback(value);
    }
    // Якщо не вийшло жодним способом — виділяємо код на екрані, щоб лишався
    // хоча б ручний Ctrl+C. Мовчазна бездіяльність тут гірша за все: людина
    // тицяє й не розуміє, чому нічого не сталося.
    if (!ok) {
      const el = btn.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el.querySelector("[data-code]") ?? el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      ref={btn}
      type="button"
      onClick={copy}
      title="Скопіювати"
      aria-label={`Скопіювати ${label ? `${label}: ` : ""}${value}`}
      className="group/copy inline-flex items-center gap-1.5 text-left text-ink underline-offset-4 transition-colors hover:text-ink/70 focus-visible:underline"
    >
      <span className="tabular-nums">
        {label ? `${label}: ` : ""}
        {/* Позначка для ручного виділення: беремо сам код, без підпису розміру. */}
        <span data-code>{value}</span>
      </span>
      <span
        aria-hidden
        className={`text-[10px] uppercase tracking-luxe transition-opacity ${
          copied ? "text-[#4a7c59] opacity-100" : "text-muted opacity-0 group-hover/copy:opacity-100"
        }`}
      >
        {copied ? "скопійовано" : "копіювати"}
      </span>
    </button>
  );
}
