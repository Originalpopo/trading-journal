import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/trading-journal",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
