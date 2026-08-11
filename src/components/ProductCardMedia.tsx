"use client";

import { useState } from "react";
import Image from "next/image";
import { Grain } from "./Grain";
import { brandMark } from "@/lib/catalog";

/**
 * Фото товару в картці каталогу з перегортанням.
 *
 * На десктопі кадр міняється від наведення: курсор ділить картку на стільки
 * вертикальних зон, скільки є фото — рух мишею гортає, без кліків. Зверху
 * смужки-індикатори, щоб було видно, що фото не одне.
 *
 * На тачі наведення не існує, тому там показуємо перше фото й ті самі смужки
 * як підказку «всередині є ще» — гортати можна вже на сторінці товару.
 * Спеціально не робимо свайп у картці: він конфліктує з вертикальним скролом
 * стрічки каталогу.
 */
export function ProductCardMedia({
  tone,
  brand,
  image,
  images,
  className = "aspect-[3/4]",
}: {
  tone: string;
  brand: string;
  image?: string;
  images?: string[];
  className?: string;
}) {
  const frames = (images && images.length > 0 ? images : image ? [image] : []).filter(Boolean);
  const [active, setActive] = useState(0);
  const multi = frames.length > 1;

  /**
   * Кадри для наведення довантажуємо лише тоді, коли миша реально зайшла в
   * картку.
   *
   * До цього тут стояло loading="lazy" на всіх кадрах, окрім першого — і воно
   * не працювало: усі кадри лежать один на одному в тій самій рамці, тобто
   * У ПОЛІ ЗОРУ. «Lazy» відкладає тільки те, що за межами екрана, тож браузер
   * чесно тягнув усі чотири одразу. Заміряно на каталозі: 94 запити за
   * фото на 24 картки, з них 72 — кадри, яких ніхто не просив.
   *
   * На телефоні наведення не існує в принципі, тож там другий кадр не
   * завантажиться ніколи — рівно 24 фото замість 94.
   */
  const [hovered, setHovered] = useState(false);
  const visibleFrames = hovered ? frames : frames.slice(0, 1);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!multi) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const idx = Math.min(frames.length - 1, Math.max(0, Math.floor(ratio * frames.length)));
    if (idx !== active) setActive(idx);
  };

  return (
    <div
      className={`relative overflow-hidden bg-cloud ${className}`}
      // Вхід мишею — сигнал «зараз гортатимуть», саме тут і замовляємо решту
      // кадрів. Спрацьовує раніше за перший рух, тож підміна встигає.
      onMouseEnter={() => multi && setHovered(true)}
      onMouseMove={onMove}
      onMouseLeave={() => setActive(0)}
    >
      {visibleFrames.length > 0 ? (
        visibleFrames.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={`${brand} product photo`}
            fill
            loading={i === 0 ? undefined : "eager"}
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
            className={`object-cover transition-opacity duration-300 ease-out ${
              i === active ? "opacity-100" : "opacity-0"
            }`}
          />
        ))
      ) : (
        <div
          className="absolute inset-0 transition-transform duration-[900ms] ease-out group-hover:scale-[1.035]"
          style={{
            backgroundColor: tone,
            backgroundImage:
              "radial-gradient(120% 80% at 26% 16%, rgba(255,255,255,0.6), transparent 56%), linear-gradient(165deg, rgba(255,255,255,0) 40%, rgba(23,19,15,0.22) 100%)",
          }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[3.6rem] leading-none text-ink/12">
            {brandMark(brand)}
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-paper/70 px-2.5 py-1 text-[9px] uppercase tracking-luxe text-ink/55 backdrop-blur-sm">
            фото готується
          </span>
        </div>
      )}

      {multi && (
        <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex gap-1">
          {frames.map((src, i) => (
            <span
              key={src}
              className={`h-[2px] flex-1 rounded-full transition-colors duration-200 ${
                i === active ? "bg-ink/70" : "bg-ink/15"
              }`}
            />
          ))}
        </div>
      )}

      <Grain />
    </div>
  );
}
