import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/trading-journal",
  images: {
    unoptimized: true,
  },
  // The local dev server opens at its root, which is outside the basePath and would be a 404.
  // Redirects don't exist in a static export, so this is dev only; the live site is unaffected.
  ...(process.env.NODE_ENV === "development" && {
    async redirects() {
      return [{ source: "/", destination: "/trading-journal", basePath: false, permanent: false }];
    },
  }),
};

export default nextConfig;
