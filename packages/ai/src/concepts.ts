import { z } from "zod";

export type ConceptKind = "static" | "video" | "ugc";

/** Per-platform copy limits (characters). Mirrors `TextLimits` in @adcraft/specs. */
export interface PlatformTextLimits {
  headline: number;
  primaryText: number;
  description: number;
}

/** Input to concept generation — a subset of the brief + brand kit the model needs. */
export interface ConceptBrief {
  brand: {
    name: string;
    industry?: string;
    tone?: string[];
    doSay?: string[];
    dontSay?: string[];
    tagline?: string;
    ctaStyle?: string;
  };
  /** Optional: a brief can be written before a product is added to the library. */
  product?: { name: string; description?: string; price?: string; url?: string; attributes?: Record<string, unknown> };
  objective: string;
  audience: string;
  offer?: string;
  keyMessages?: string[];
  platforms: string[];
  formats: ConceptKind[];
  /** Overrides the brand-kit tone for this brief only. */
  toneOverride?: string;
  constraints?: string[];
  /**
   * Copy limits per platform the brief targets (from @adcraft/specs). When present the
   * prompt asks for copy that fits the tightest limit across the concept's `platformFit`.
   */
  platformLimits?: Record<string, PlatformTextLimits>;
  count?: number;
}

/** The persuasion angles we ask Claude to spread concepts across. */
export const CONCEPT_ANGLES = [
  "problem/solution",
  "social proof",
  "before/after",
  "founder story",
  "objection handling",
  "comparison",
  "seasonal",
] as const;

export type ConceptAngle = (typeof CONCEPT_ANGLES)[number];

/**
 * One ad concept. Kept free of string-length constraints: Anthropic structured outputs
 * do not enforce `maxLength`, so limits are stated in the prompt and checked afterwards
 * with `copyIssues()`.
 */
export const ConceptSchema = z.object({
  title: z.string().describe("Short internal name for the concept, 2-6 words"),
  kind: z.enum(["static", "video", "ugc"]),
  angle: z
    .string()
    .describe(
      "The persuasion angle. One of: problem/solution, social proof, before/after, founder story, objection handling, comparison, seasonal",
    ),
  hook: z.string().describe("First line / first 3 seconds — what stops the scroll. One sentence."),
  headline: z.string().describe("Ad headline. Must fit the tightest headline limit of the platforms in platformFit."),
  primaryText: z.string().describe("Primary text / caption. Must fit the tightest primaryText limit of the platforms in platformFit."),
  description: z
    .string()
    .describe("Optional link description. Empty string when the platform has no description field or none is needed."),
  cta: z.string().describe("Call to action button text, <= 20 characters"),
  visualDirection: z.string().describe("Scene, composition, lighting, product placement, on-screen text treatment"),
  scenePrompt: z
    .string()
    .describe(
      "Image-model prompt for the BACKGROUND SCENE ONLY: setting, surfaces, light, colours, mood, camera. The product, people holding it, text, logos and packaging are never mentioned; the product is composited on top later. Leave clear negative space.",
    ),
  script: z
    .string()
    .describe(
      "For video and ugc only: a 15-30 second scene-by-scene script, one line per scene, formatted like '0-3s: ...'. Empty string for static.",
    ),
  platformFit: z
    .array(z.string())
    .describe("Platforms this concept is written for, subset of the brief's platforms (meta, instagram, tiktok, google, youtube)"),
});

export const ConceptsOutputSchema = z.object({
  concepts: z.array(ConceptSchema).min(1),
});

export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptsOutput = z.infer<typeof ConceptsOutputSchema>;

/** Which copy fields overflow the tightest limit across the platforms a concept targets. */
export function copyIssues(concept: Concept, limits: Record<string, PlatformTextLimits> | undefined) {
  if (!limits) return [];
  const targets = concept.platformFit.map((p) => limits[p]).filter((l): l is PlatformTextLimits => Boolean(l));
  if (targets.length === 0) return [];
  const issues: Array<{ field: keyof PlatformTextLimits; length: number; max: number }> = [];
  for (const field of ["headline", "primaryText", "description"] as const) {
    const value = concept[field];
    // A limit of 0 means the platform has no such field (e.g. TikTok description) — ignore it.
    const max = Math.min(...targets.map((t) => (t[field] > 0 ? t[field] : Infinity)));
    if (value && Number.isFinite(max) && value.length > max) issues.push({ field, length: value.length, max });
  }
  return issues;
}
