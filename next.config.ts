import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
