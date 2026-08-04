import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Не розголошуємо стек у заголовку відповіді.
  poweredByHeader: false,
  // The VPS also has /opt/package-lock.json. Without an explicit root, Next can
  // trace from /opt instead of this app and produce fragile standalone output.
  outputFileTracingRoot: process.cwd(),
  // Lets the deploy build into a side directory (NEXT_DIST_DIR=.next-build) while
  // the live server keeps serving the intact .next, then swap atomically.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Адмінка живе за нестандартним шляхом (NEXT_PUBLIC_ADMIN_PATH), а рерайт
  // віддає під ним справжні сторінки /admin. Прямий /admin ріже nginx.
  async rewrites() {
    const slug = process.env.NEXT_PUBLIC_ADMIN_PATH?.trim().replace(/^\/+|\/+$/g, "");
    if (!slug) return [];
    return [
      { source: `/${slug}`, destination: "/admin" },
      { source: `/${slug}/:path*`, destination: "/admin/:path*" },
    ];
  },
  images: {
    // На сервері одне ядро, тож кожен унікальний розмір — це реальна робота
    // sharp. Стандартний набір дає вісім ширин на кожне фото; лишаємо ті, що
    // справді трапляються в макеті (картка каталогу, плитка, hero).
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [128, 256, 384],
    // Одне значення якості замість довільних — інакше кожен q= плодить свою
    // копію в кеші.
    qualities: [75],
    formats: ["image/webp"],
    // Фото товарів не змінюються після імпорту, тому тримаємо оптимізовані
    // копії довго й не переганяємо їх заново.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maniagroup.com.ua",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
};

export default nextConfig;
