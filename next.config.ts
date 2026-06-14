import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
