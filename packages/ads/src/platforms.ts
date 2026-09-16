import type { Platform } from "./types";

export const PLATFORMS: readonly Platform[] = ["meta", "tiktok", "google"];

export const PLATFORM_LABELS: Record<Platform, string> = { meta: "Meta", tiktok: "TikTok", google: "Google Ads" };

/** What each connection covers, for the UI ("Meta covers Instagram, Google covers YouTube"). */
export const PLATFORM_COVERS: Record<Platform, string> = {
  meta: "Facebook and Instagram",
  tiktok: "TikTok in-feed",
  google: "Demand Gen, Display and YouTube",
};

/** Spec placement prefixes that publish through each connection. */
export const PLATFORM_SPEC_PLATFORMS: Record<Platform, string[]> = {
  meta: ["meta"],
  tiktok: ["tiktok"],
  google: ["google", "youtube"],
};

export function isPlatform(v: unknown): v is Platform {
  return PLATFORMS.includes(v as Platform);
}

/** The env each real adapter needs. Missing → the platform runs in sandbox mode. */
export const PLATFORM_ENV: Record<Platform, string[]> = {
  meta: ["META_APP_ID", "META_APP_SECRET"],
  tiktok: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"],
  google: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"],
};

export function platformConfigured(platform: Platform): boolean {
  return PLATFORM_ENV[platform].every((k) => Boolean(process.env[k]));
}
