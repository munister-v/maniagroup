import Image from "next/image";
import { brandMark } from "@/lib/catalog";
import { Grain } from "./Grain";

/**
 * Placeholder product visual — an editorial typographic lookbook tile: layered
 * duotone gradient, film grain, a hairline inner frame and a faint brand
 * monogram. Reads as intentional art direction until real photography lands.
 * Scales on parent `group` hover.
 */
export function ProductMedia({
  tone,
  brand,
  category,
  image,
  className = "aspect-[3/4]",
}: {
  tone: string;
  brand: string;
  category?: string;
  image?: string;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-cloud ${className}`}>
      {image ? (
        <Image
          src={image}
          alt={`${brand} ${category ?? ""}`.trim()}
          fill
          sizes="(min-width: 1024px) 25vw, 50vw"
          className="object-cover transition-transform duration-[1300ms] ease-out group-hover:scale-[1.05]"
        />
      ) : (
        <div
          className="absolute inset-0 transition-transform duration-[1300ms] ease-out group-hover:scale-[1.05]"
          style={{
            backgroundColor: tone,
            backgroundImage:
              "radial-gradient(120% 80% at 26% 16%, rgba(255,255,255,0.6), transparent 56%), linear-gradient(165deg, rgba(255,255,255,0) 40%, rgba(23,19,15,0.22) 100%)",
          }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[3.6rem] leading-none text-ink/12">
            {brandMark(brand)}
          </span>
        </div>
      )}

      <Grain />
      <div className="pointer-events-none absolute inset-3 border border-ink/10" />

      {category && (
        <span className="absolute left-4 top-4 z-10 text-[9px] uppercase tracking-luxe text-ink/40">
          {category}
        </span>
      )}
      <span className="absolute bottom-3 left-4 z-10 text-[10px] uppercase tracking-luxe text-ink/40">
        {brand}
      </span>
    </div>
  );
}
