import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@adcraft/ui", "@adcraft/db", "@adcraft/ai"],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
