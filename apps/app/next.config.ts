import type { NextConfig } from "next";
import path from "node:path";
import fs from "node:fs";

// The monorepo keeps one .env at the repo root; load it for the app process.
for (const file of [".env", ".env.local"]) {
  const p = path.resolve(__dirname, "../../", file);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const nextConfig: NextConfig = {
  transpilePackages: ["@adcraft/ui", "@adcraft/db", "@adcraft/ai", "@adcraft/storage", "@adcraft/specs", "@adcraft/render"],
  serverExternalPackages: ["postgres", "@electric-sql/pglite", "@resvg/resvg-js", "sharp", "@remotion/renderer", "@remotion/bundler", "ffmpeg-static", "fluent-ffmpeg"],
};

export default nextConfig;
