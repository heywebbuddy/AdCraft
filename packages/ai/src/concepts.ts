import { z } from "zod";

/** Input to concept generation — a subset of the brief + brand kit the model needs. */
export interface ConceptBrief {
  brand: {
    name: string;
    industry?: string;
    tone?: string[];
    doSay?: string[];
    dontSay?: string[];
    tagline?: string;
  };
  product: { name: string; description?: string; price?: string; attributes?: Record<string, unknown> };
  objective: string;
  audience: string;
  offer?: string;
  keyMessages?: string[];
  platforms: string[];
  formats: Array<"static" | "video" | "ugc">;
  constraints?: string[];
  count?: number;
}

export const ConceptSchema = z.object({
  title: z.string().describe("Short internal name for the concept"),
  kind: z.enum(["static", "video", "ugc"]),
  hook: z.string().describe("First 3 seconds / first line — what stops the scroll"),
  angle: z.string().describe("The persuasion angle, e.g. social proof, problem/solution, urgency"),
  headline: z.string().max(40),
  primaryText: z.string().max(125),
  description: z.string().max(30).optional(),
  cta: z.string().max(20),
  visualDirection: z.string().describe("Scene, composition, lighting, product placement"),
  script: z.string().optional().describe("Voiceover / on-screen script for video and UGC"),
});

export const ConceptsOutputSchema = z.object({
  concepts: z.array(ConceptSchema).min(1),
});

export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptsOutput = z.infer<typeof ConceptsOutputSchema>;
