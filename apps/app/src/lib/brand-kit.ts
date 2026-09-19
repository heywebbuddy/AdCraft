import type { BrandKitData } from "@adcraft/db";

/** Fonts offered in the brand kit editor (all on Google Fonts). */
export const KIT_FONTS = ["DM Sans", "Inter", "Instrument Serif", "Playfair Display", "Space Grotesk", "Poppins", "Montserrat", "Lora"] as const;
export type KitFont = (typeof KIT_FONTS)[number];

export const SERIF_FONTS: ReadonlySet<string> = new Set(["Instrument Serif", "Playfair Display", "Lora"]);

export const KIT_TONES = ["warm", "bold", "playful", "luxurious", "minimal", "honest", "energetic", "calm"] as const;
export type KitTone = (typeof KIT_TONES)[number];

export const CTA_STYLES = [
  { id: "pill", label: "Pill" },
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "outline", label: "Outline" },
] as const;
export type CtaStyle = (typeof CTA_STYLES)[number]["id"];

export const COLOR_FIELDS = [
  { key: "primary", label: "Primary", hint: "Headlines, logo marks" },
  { key: "secondary", label: "Secondary", hint: "Supporting text, panels" },
  { key: "accent", label: "Accent", hint: "Buttons and highlights" },
  { key: "background", label: "Background", hint: "Canvas behind the ad" },
  { key: "text", label: "Text", hint: "Body copy" },
] as const;
export type ColorKey = (typeof COLOR_FIELDS)[number]["key"];

export const DEFAULT_KIT: BrandKitData = {
  colors: { primary: "#242521", secondary: "#75756d", accent: "#e65c32", background: "#f8f7f3", text: "#242521" },
  fonts: { heading: "DM Sans", body: "DM Sans" },
  voice: { tone: ["warm", "honest"], doSay: [], dontSay: [] },
  tagline: "",
  ctaStyle: "pill",
};

/** Google Fonts stylesheet covering every kit font, for the live preview. */
export const KIT_FONTS_STYLESHEET =
  "https://fonts.googleapis.com/css2?" +
  KIT_FONTS.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,400;0,600;1,400`).join("&") +
  "&display=swap";

export function fontStack(font: string) {
  return `"${font}", ${SERIF_FONTS.has(font) ? "Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}`;
}

export function isHex(s: string) {
  return /^#[0-9a-f]{6}$/i.test(s);
}

/** Normalises user-typed colour to #rrggbb, or returns the fallback. */
export function normalizeHex(input: string | null | undefined, fallback: string) {
  if (!input) return fallback;
  let s = input.trim().toLowerCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return isHex(s) ? s : fallback;
}

/** Fill in any missing fields of a stored kit with defaults. */
export function withDefaults(kit: Partial<BrandKitData> | null | undefined): BrandKitData {
  return {
    colors: { ...DEFAULT_KIT.colors, ...(kit?.colors ?? {}) },
    fonts: { ...DEFAULT_KIT.fonts, ...(kit?.fonts ?? {}) },
    logoUrl: kit?.logoUrl,
    logoDarkUrl: kit?.logoDarkUrl,
    voice: { tone: kit?.voice?.tone ?? DEFAULT_KIT.voice!.tone, doSay: kit?.voice?.doSay ?? [], dontSay: kit?.voice?.dontSay ?? [] },
    tagline: kit?.tagline ?? "",
    ctaStyle: kit?.ctaStyle ?? "pill",
    site: kit?.site,
  };
}
