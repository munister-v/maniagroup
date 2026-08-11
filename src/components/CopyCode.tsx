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

  // Таймер живе довше за клік: без прибирання React лається на setState у
  // розмонтованому компоненті, коли покупець пішов зі сторінки одразу після
  // копіювання.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // HTTP-контекст або заборонений дозвіл — тоді нехай лишається як звичайний
      // текст, який можна виділити; мовчазна відмова краща за помилку в консолі.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Скопіювати"
      aria-label={`Скопіювати ${label ? `${label}: ` : ""}${value}`}
      className="group/copy inline-flex items-center gap-1.5 text-left text-ink underline-offset-4 transition-colors hover:text-ink/70 focus-visible:underline"
    >
      <span className="tabular-nums">{label ? `${label}: ` : ""}{value}</span>
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
