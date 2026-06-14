"use client";

import { useState } from "react";
import Image from "next/image";
import { Grain } from "./Grain";

type GalleryImage = { id: number; src: string; thumbnail: string; alt: string };

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [active, setActive] = useState(0);
  const shown = images.slice(0, 6);

  if (!shown.length) {
    return (
      <div className="relative aspect-[3/4] overflow-hidden bg-cloud">
        <Grain variant="strong" />
      </div>
    );
  }

  const prev = () => setActive((i) => (i - 1 + shown.length) % shown.length);
  const next = () => setActive((i) => (i + 1) % shown.length);

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row md:gap-4">
      {/* Thumbnails — horizontal strip on mobile, left column on desktop */}
      {shown.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 md:w-[72px] md:flex-col md:overflow-x-visible">
          {shown.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setActive(i)}
              aria-label={`Фото ${i + 1}`}
              className={`relative aspect-[3/4] w-14 shrink-0 overflow-hidden transition-all duration-200 md:w-full ${
                i === active
                  ? "ring-1 ring-ink ring-offset-2"
                  : "opacity-45 hover:opacity-75"
              }`}
            >
              <Image
                src={img.thumbnail || img.src}
                alt=""
                fill
                className="object-cover"
                sizes="72px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Main image */}
      <div className="flex-1">
        <div className="relative aspect-[3/4] overflow-hidden bg-cloud">
          <Image
            key={shown[active]?.src}
            src={shown[active]?.src ?? ""}
            alt={`${name} — фото ${active + 1}`}
            fill
            priority={active === 0}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover transition-opacity duration-200"
          />

          {/* Mobile arrow navigation */}
          {shown.length > 1 && (
            <>
              <button
                onClick={prev}
                aria-label="Попереднє фото"
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center bg-paper/80 text-ink backdrop-blur-sm transition-opacity hover:opacity-90 md:hidden"
              >
                <ChevronIcon dir="left" />
              </button>
              <button
                onClick={next}
                aria-label="Наступне фото"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center bg-paper/80 text-ink backdrop-blur-sm transition-opacity hover:opacity-90 md:hidden"
              >
                <ChevronIcon dir="right" />
              </button>

              {/* Dots on mobile */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 md:hidden">
                {shown.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`h-1 rounded-full transition-all ${
                      i === active ? "w-5 bg-ink" : "w-1.5 bg-ink/25"
                    }`}
                  />
                ))}
              </div>

              {/* Counter badge */}
              <span className="absolute right-3 top-3 bg-paper/75 px-2 py-0.5 text-[10px] tabular-nums text-ink backdrop-blur-sm md:hidden">
                {active + 1} / {shown.length}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
