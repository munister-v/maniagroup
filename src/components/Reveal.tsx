"use client";

import { useEffect, useRef, useState } from "react";

/** Fades + lifts children into view on scroll (once). Respects reduced-motion via CSS. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const show = () => setVisible(true);

    // У фоновій вкладці IntersectionObserver не звітує взагалі: людина
    // відкриває каталог у новій вкладці (Cmd+клік — звичайна річ у покупках),
    // переходить у неї — і сторінка порожня, бо жоден блок так і не отримав
    // is-visible. Тому все, що вже в кадрі на момент показу вкладки,
    // показуємо одразу, без анімації входу.
    if (document.hidden) {
      const onShow = () => {
        document.removeEventListener("visibilitychange", onShow);
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) show();
      };
      document.addEventListener("visibilitychange", onShow);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);

    // Страховка на випадок, коли спостерігач мовчить, а блок стоїть у кадрі:
    // краще показати без анімації, ніж лишити порожнє місце назавжди.
    const guard = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) show();
    }, 1200);

    return () => {
      io.disconnect();
      window.clearTimeout(guard);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
