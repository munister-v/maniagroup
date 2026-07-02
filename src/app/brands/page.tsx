import Link from "next/link";
import { dbBrands } from "@/lib/productSource";
import { getResolvedBrandLogoMap, resolveBrandLogo } from "@/lib/brandLogos";
import { BrandLogo } from "@/components/BrandLogo";

export const metadata = {
  title: "Усі бренди — Mania Group",
  description: "Повний перелік брендів у каталозі Mania Group — оригінальний одяг, взуття та аксесуари європейських марок.",
  alternates: { canonical: "/brands" },
};

export const dynamic = "force-dynamic";

type B = { name: string; slug: string; count: number; logo: string | null };

export default async function BrandsPage() {
  let raw: { name: string; slug: string; count: number }[] = [];
  try { raw = await dbBrands(); } catch { raw = []; }
  let logos: Record<string, string> = {};
  try { logos = await getResolvedBrandLogoMap(); } catch { logos = {}; }

  // Dedupe families sharing a logo URL (keep the shortest/root name), resolve logos.
  const byLogo = new Map<string, B>();
  const seen: B[] = [];
  for (const b of raw) {
    const logo = resolveBrandLogo(b.name, logos);
    const item: B = { ...b, logo };
    if (logo) {
      const ex = byLogo.get(logo);
      if (!ex || b.name.length < ex.name.length) byLogo.set(logo, item);
    } else {
      seen.push(item);
    }
  }
  const withLogo = [...byLogo.values()].sort((a, b) => b.count - a.count);
  const textOnly = seen.sort((a, b) => a.name.localeCompare(b.name, "uk"));
  const total = withLogo.length + textOnly.length;

  return (
    <main className="wrap py-12 md:py-16">
      <nav className="mb-6 text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="hover:text-ink">Головна</Link>
        <span className="mx-2 text-line">/</span>
        <span className="text-ink">Бренди</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-luxe text-muted">Наші бренди</p>
          <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Усі бренди в одному місці</h1>
          <p className="mt-2 text-sm text-muted">{total} марок у каталозі · лише оригінал</p>
        </div>
        <Link href="/catalog" className="link-underline whitespace-nowrap text-[11px] uppercase tracking-luxe text-ink">
          Весь каталог →
        </Link>
      </div>

      {/* Logo brands — tiles */}
      {withLogo.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
          {withLogo.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/catalog?brand=${b.slug}`}
                title={`${b.name} · ${b.count}`}
                className="group relative flex h-[84px] items-center justify-center rounded-[3px] border border-line/60 bg-white px-5 transition-all hover:border-ink/25 hover:shadow-[0_4px_14px_-8px_rgba(23,19,15,0.4)]"
              >
                <BrandLogo
                  name={b.name}
                  src={b.logo}
                  imgClass="max-h-[48px] max-w-full object-contain"
                  textClass="text-center font-display text-[16px] leading-tight tracking-wide text-ink/75"
                />
                <span className="absolute bottom-1.5 right-2 text-[10px] tabular-nums text-muted/50 opacity-0 transition-opacity group-hover:opacity-100">{b.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Text-only brands — alphabetical list */}
      {textOnly.length > 0 && (
        <div className="mt-10 border-t border-line/50 pt-8">
          <p className="mb-4 text-[11px] uppercase tracking-luxe text-muted">Також у каталозі</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {textOnly.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/catalog?brand=${b.slug}`}
                  className="flex items-baseline justify-between gap-2 text-[15px] text-ink/70 transition-colors hover:text-ink"
                >
                  <span className="truncate font-display">{b.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted/60">{b.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
