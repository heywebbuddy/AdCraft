import type { NextConfig } from "next";
import path from "node:path";
import fs from "node:fs";

// The monorepo keeps one .env at the repo root; load it for the app process.
for (const file of [".env", ".env.local"]) {
  const p = path.resolve(__dirname, "../../", file);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const nextConfig: NextConfig = {
  // No floating dev badge: it lands in every screenshot and covers the sidebar avatar.
  devIndicators: false,
  // Product photos and logos post through server actions; allow the same 15 MB the
  // upload validator accepts (see src/lib/uploads.ts), plus room for form fields.
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  poweredByHeader: false,
  /**
   * Baseline security headers. The app itself is same-origin only (no embedding), never sends
   * the full URL to other sites, and asks browsers to stay on HTTPS. Stored files carry their
   * own stricter headers — see server/file-headers.ts.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      // Stored files are user-supplied: sandbox them so an SVG or HTML upload cannot run as a
      // page on this origin. Listed after the blanket rule so this CSP wins for these paths.
      ...["/api/files/:path*", "/api/share/:token/:path*", "/api/v1/files/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      })),
    ];
  },
  // The marketing site (repo `dist/`) is copied into public/ by scripts/sync-site.mjs and served here.
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/showcase", destination: "/showcase/index.html" },
      { source: "/pricing", destination: "/pricing/index.html" },
    ];
  },
  transpilePackages: ["@adcraft/ui", "@adcraft/ads", "@adcraft/db", "@adcraft/ai", "@adcraft/storage", "@adcraft/specs", "@adcraft/render"],
  serverExternalPackages: ["postgres", "@electric-sql/pglite", "@resvg/resvg-js", "sharp", "@remotion/renderer", "@remotion/bundler", "ffmpeg-static", "fluent-ffmpeg"],
};

export default nextConfig;
