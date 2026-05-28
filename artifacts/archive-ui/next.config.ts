import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/archive",
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
