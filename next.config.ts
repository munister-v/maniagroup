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
