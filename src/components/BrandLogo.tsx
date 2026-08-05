"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a brand logo image with a graceful text-wordmark fallback.
 * Used on the homepage strip and the header brands menu. Plain <img> (not
 * next/image) so external CDN logos work without remotePatterns and a 404
 * cleanly falls back to text via onError.
 */
export function BrandLogo({
  name,
  src,
  imgClass = "",
  textClass = "",
}: {
  name: string;
  src?: string | null;
  imgClass?: string;
  textClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // onError самого по собі не досить. Розмітка приходить із сервера вже з
  // <img>, тож для мертвого URL браузер отримує 404 ЩЕ ДО гідратації — React
  // вішає onError на елемент, який уже впав, і подія не прилітає ніколи. Саме
  // тому замість запасного напису показувалась іконка розбитої картинки
  // (GALLIANO). Після монтування питаємо в браузера прямо: завантаження
  // скінчилось, а ширини немає — отже, картинки немає.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) {
    return <span className={textClass}>{name}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={imgClass}
    />
  );
}
