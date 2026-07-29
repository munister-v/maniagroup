import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The VPS also has /opt/package-lock.json. Without an explicit root, Next can
  // trace from /opt instead of this app and produce fragile standalone output.
  outputFileTracingRoot: process.cwd(),
  // Lets the deploy build into a side directory (NEXT_DIST_DIR=.next-build) while
  // the live server keeps serving the intact .next, then swap atomically.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
