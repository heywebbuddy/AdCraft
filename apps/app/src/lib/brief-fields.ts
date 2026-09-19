/** Shared brief option lists — safe for client and server. */

export const OBJECTIVES = [
  { id: "awareness", label: "Awareness", hint: "Reach new people" },
  { id: "consideration", label: "Consideration", hint: "Explain and compare" },
  { id: "conversion", label: "Conversion", hint: "Drive purchases" },
  { id: "retention", label: "Retention", hint: "Bring customers back" },
] as const;

export const PLATFORMS = [
  { id: "meta", label: "Meta" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google" },
  { id: "youtube", label: "YouTube" },
] as const;

export const FORMATS = [
  { id: "static", label: "Static ads" },
  { id: "video", label: "Product video" },
  { id: "ugc", label: "UGC video" },
] as const;

export type Objective = (typeof OBJECTIVES)[number]["id"];
export type FormatId = (typeof FORMATS)[number]["id"];
