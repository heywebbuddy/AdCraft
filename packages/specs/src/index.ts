export type Platform = "meta" | "tiktok" | "google" | "youtube";
export type Ratio = "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1";
export type MediaKind = "image" | "video";

/** Pixel insets that must stay free of critical text/logos (UI overlays). */
export interface SafeZone {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TextLimits {
  headline: number;
  primaryText: number;
  description: number;
}

export interface PlacementSpec {
  id: string;
  platform: Platform;
  placement: string;
  label: string;
  ratio: Ratio;
  width: number;
  height: number;
  media: MediaKind[];
  maxFileMb: { image?: number; video?: number };
  maxDurationSec?: number;
  safeZone: SafeZone;
  text: TextLimits;
}

const META_TEXT: TextLimits = { headline: 40, primaryText: 125, description: 30 };
const TIKTOK_TEXT: TextLimits = { headline: 100, primaryText: 100, description: 0 };
const GOOGLE_TEXT: TextLimits = { headline: 40, primaryText: 90, description: 90 };
const YOUTUBE_TEXT: TextLimits = { headline: 15, primaryText: 90, description: 90 };

export const placements: PlacementSpec[] = [
  {
    id: "meta.feed.1x1",
    platform: "meta",
    placement: "feed",
    label: "Meta Feed (square)",
    ratio: "1:1",
    width: 1080,
    height: 1080,
    media: ["image", "video"],
    maxFileMb: { image: 30, video: 4096 },
    maxDurationSec: 241 * 60,
    safeZone: { top: 0, right: 0, bottom: 0, left: 0 },
    text: META_TEXT,
  },
  {
    id: "meta.feed.4x5",
    platform: "meta",
    placement: "feed",
    label: "Meta Feed (portrait)",
    ratio: "4:5",
    width: 1080,
    height: 1350,
    media: ["image", "video"],
    maxFileMb: { image: 30, video: 4096 },
    maxDurationSec: 241 * 60,
    safeZone: { top: 0, right: 0, bottom: 0, left: 0 },
    text: META_TEXT,
  },
  {
    id: "meta.stories.9x16",
    platform: "meta",
    placement: "stories_reels",
    label: "Meta Stories / Reels",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    media: ["image", "video"],
    maxFileMb: { image: 30, video: 4096 },
    maxDurationSec: 60,
    // Keep the top 14% and bottom 20% free of text (profile header + CTA/caption overlays).
    safeZone: { top: 250, right: 60, bottom: 340, left: 60 },
    text: META_TEXT,
  },
  {
    id: "tiktok.infeed.9x16",
    platform: "tiktok",
    placement: "in_feed",
    label: "TikTok In-Feed",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    media: ["video"],
    maxFileMb: { video: 500 },
    maxDurationSec: 60,
    // Right rail (like/comment/share) and bottom caption + music ticker.
    safeZone: { top: 130, right: 140, bottom: 480, left: 40 },
    text: TIKTOK_TEXT,
  },
  {
    id: "google.demandgen.1x1",
    platform: "google",
    placement: "demand_gen",
    label: "Google Demand Gen (square)",
    ratio: "1:1",
    width: 1200,
    height: 1200,
    media: ["image", "video"],
    maxFileMb: { image: 5, video: 256 },
    safeZone: { top: 0, right: 0, bottom: 0, left: 0 },
    text: GOOGLE_TEXT,
  },
  {
    id: "google.demandgen.1.91x1",
    platform: "google",
    placement: "demand_gen",
    label: "Google Demand Gen (landscape)",
    ratio: "1.91:1",
    width: 1200,
    height: 628,
    media: ["image"],
    maxFileMb: { image: 5 },
    safeZone: { top: 0, right: 0, bottom: 0, left: 0 },
    text: GOOGLE_TEXT,
  },
  {
    id: "youtube.instream.16x9",
    platform: "youtube",
    placement: "in_stream",
    label: "YouTube In-Stream",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    media: ["video"],
    maxFileMb: { video: 256 },
    maxDurationSec: 180,
    // Bottom-right skip button / bottom overlay.
    safeZone: { top: 60, right: 260, bottom: 200, left: 60 },
    text: YOUTUBE_TEXT,
  },
];

export const placementById: Record<string, PlacementSpec> = Object.fromEntries(
  placements.map((p) => [p.id, p]),
);

export function getPlacement(id: string): PlacementSpec {
  const spec = placementById[id];
  if (!spec) throw new Error(`Unknown placement: ${id}`);
  return spec;
}

export function placementsFor(platform: Platform, media?: MediaKind): PlacementSpec[] {
  return placements.filter((p) => p.platform === platform && (!media || p.media.includes(media)));
}

export function ratioToNumber(ratio: Ratio): number {
  const [w, h] = ratio.split(":").map(Number) as [number, number];
  return w / h;
}

export function validateText(spec: PlacementSpec, text: Partial<Record<keyof TextLimits, string>>) {
  const issues: Array<{ field: keyof TextLimits; length: number; max: number }> = [];
  for (const field of ["headline", "primaryText", "description"] as const) {
    const value = text[field];
    const max = spec.text[field];
    if (value && value.length > max) issues.push({ field, length: value.length, max });
  }
  return issues;
}
