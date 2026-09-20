import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { GenerationResult, StructuredRequest, TextProvider, TextRequest, Usage } from "./types";
import {
  CONCEPT_ANGLES,
  ConceptsOutputSchema,
  type Concept,
  type ConceptBrief,
  type ConceptKind,
  type ConceptsOutput,
  type PlatformTextLimits,
  type OnConcept,
} from "./concepts";
import { ConceptStreamParser } from "./text/concept-stream";

export const ANTHROPIC_MODEL = "claude-opus-5";

/** Model string recorded on rows produced by the offline sample generator. */
export const SAMPLE_MODEL = "sample";

/** Claude Opus 5 list pricing, USD per 1M tokens. Cache writes bill at 1.25x, cache reads at 0.1x input. */
export const ANTHROPIC_PRICING = {
  [ANTHROPIC_MODEL]: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
} as const;

type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function estimateCostUsd(model: string, u: TokenUsage): number {
  const price = ANTHROPIC_PRICING[model as keyof typeof ANTHROPIC_PRICING] ?? ANTHROPIC_PRICING[ANTHROPIC_MODEL];
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  return (
    (u.input_tokens * price.input +
      cacheWrite * price.cacheWrite +
      cacheRead * price.cacheRead +
      u.output_tokens * price.output) /
    1_000_000
  );
}

function usageFrom(model: string, u: TokenUsage, startedAt: number): Usage {
  return {
    provider: "anthropic",
    model,
    inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens,
    costUsd: estimateCostUsd(model, u),
    durationMs: Date.now() - startedAt,
  };
}

function effortOf(req: TextRequest): "low" | "medium" | "high" | "max" {
  return req.effort ?? "high";
}

/** True when the Anthropic SDK can find credentials (API key or auth token). */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function refusalError(message: { stop_reason: string | null; stop_details?: { category?: string | null } | null }) {
  return new Error(`Claude declined the request (${message.stop_details?.category ?? "unknown"})`);
}

export class AnthropicTextProvider implements TextProvider {
  readonly name = "anthropic" as const;
  readonly capability = "text" as const;
  private client: Anthropic;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    // A bare `new Anthropic()` resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` itself.
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : new Anthropic();
    this.model = opts.model ?? ANTHROPIC_MODEL;
  }
  readonly model: string;

  /** Non-streaming convenience built on the streaming API (avoids HTTP timeouts on long outputs). */
  async generate(req: TextRequest): Promise<GenerationResult<string>> {
    const startedAt = Date.now();
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: req.maxTokens ?? 16_000,
      system: req.system,
      messages: req.messages,
      thinking: { type: "adaptive" },
      output_config: { effort: effortOf(req) },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw refusalError(message);
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { output: text, usage: usageFrom(this.model, message.usage, startedAt) };
  }

  /** Yields text deltas as they arrive. */
  async *stream(req: TextRequest): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: req.maxTokens ?? 64_000,
      system: req.system,
      messages: req.messages,
      thinking: { type: "adaptive" },
      output_config: { effort: effortOf(req) },
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }

  /**
   * Structured output via `output_config.format` with a raw JSON schema
   * (`{ type: "json_schema", schema }`). For Zod schemas prefer `zodOutputFormat`, as in `generateConcepts`.
   */
  async generateStructured<T>(req: StructuredRequest<T>): Promise<GenerationResult<T>> {
    const startedAt = Date.now();
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: req.maxTokens ?? 16_000,
      system: req.system,
      messages: req.messages,
      thinking: { type: "adaptive" },
      output_config: {
        effort: effortOf(req),
        format: { type: "json_schema", schema: req.schema },
      },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw refusalError(message);
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const raw: unknown = JSON.parse(text);
    const output = req.parse ? req.parse(raw) : (raw as T);
    return { output, usage: usageFrom(this.model, message.usage, startedAt) };
  }
}

// ---------------------------------------------------------------------------
// Concept generation
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta (Facebook)",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google (Demand Gen / Display)",
  youtube: "YouTube",
};

const FORMAT_LABELS: Record<ConceptKind, string> = {
  static: "static (single image ad)",
  video: "video (product video, 15-30 s)",
  ugc: "ugc (creator-style talking-head video, 15-30 s)",
};

/**
 * Frozen instructions: identical for every request so the prefix caches.
 * Brand + product context follow in a second cached block; the brief itself is the user turn.
 */
export const SYSTEM_RULES = `You are Adcraft's creative director. You write paid-social ad concepts that are specific to the brand, honest about the product, and built to stop the scroll.

How to work:
- Every concept takes a different persuasion angle. Spread the set across these angles and name the one you used in "angle": ${CONCEPT_ANGLES.join(", ")}. Never repeat an angle until every angle has been used once.
- Spread concepts evenly across the requested formats. Video and UGC concepts need a scene-by-scene script of 15-30 seconds, one line per scene in the form "0-3s: ..." with the hook in the first 3 seconds and the CTA in the last scene. Static concepts leave "script" empty.
- Write copy for the platforms in "platformFit" and keep every field within the tightest limit among them. Copy limits are given in the brief as character counts; a limit of 0 means the platform has no such field, so leave it empty.
- The hook is one sentence a person would actually say or read, not a slogan. The headline and primary text must be usable as-is.
- Visual direction describes one frame (or the opening frame for video): setting, subject, product placement, light, on-screen text treatment. Concrete enough to brief a photographer.
- Scene prompt is what an image model paints as the BACKGROUND: setting, surfaces, light, colour palette, mood, lens. It must not mention the product, packaging, bottles, hands, text, logos or typography, because the real product photo and the copy are layered on afterwards. Ask for generous empty space where a headline and a product can sit.
- Match the brand voice. Use the "do say" phrases where natural and never use "don't say" phrases.
- Never invent product claims, statistics, awards or testimonials that are not in the brief. Social-proof angles must use only what the brief provides, or use clearly generic framing ("customers tell us...").
- No emojis in headlines. Sentence case. No ALL CAPS.`;

export function brandContext(brief: ConceptBrief): string {
  const b = brief.brand;
  const p = brief.product;
  return [
    `BRAND: ${b.name}${b.industry ? ` (${b.industry})` : ""}`,
    b.tagline ? `Tagline: ${b.tagline}` : "",
    b.tone?.length ? `Tone of voice: ${b.tone.join(", ")}` : "",
    b.doSay?.length ? `Do say: ${b.doSay.join("; ")}` : "",
    b.dontSay?.length ? `Don't say: ${b.dontSay.join("; ")}` : "",
    b.ctaStyle ? `CTA style: ${b.ctaStyle}` : "",
    ``,
    p ? `PRODUCT: ${p.name}` : `PRODUCT: not specified — write for the brand as a whole.`,
    p?.description ? `Description: ${p.description}` : "",
    p?.price ? `Price: ${p.price}` : "",
    p?.url ? `URL: ${p.url}` : "",
    p?.attributes && Object.keys(p.attributes).length ? `Attributes: ${JSON.stringify(p.attributes)}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function limitsBlock(brief: ConceptBrief): string {
  if (!brief.platformLimits) return "";
  const lines = brief.platforms
    .map((p) => {
      const l = brief.platformLimits?.[p];
      if (!l) return "";
      return `- ${p}: headline ${l.headline}, primaryText ${l.primaryText}, description ${l.description}, cta 20`;
    })
    .filter(Boolean);
  return lines.length ? `COPY LIMITS (characters):\n${lines.join("\n")}` : "";
}

export function briefToPrompt(brief: ConceptBrief): string {
  const n = brief.count ?? 8;
  return [
    `Generate exactly ${n} distinct ad concepts.`,
    `Formats: ${brief.formats.map((f) => FORMAT_LABELS[f]).join("; ")}.`,
    `Platforms: ${brief.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")}.`,
    ``,
    `OBJECTIVE: ${brief.objective}`,
    `AUDIENCE: ${brief.audience}`,
    brief.offer ? `OFFER / KEY MESSAGE: ${brief.offer}` : "",
    brief.keyMessages?.length ? `KEY MESSAGES: ${brief.keyMessages.join("; ")}` : "",
    brief.toneOverride ? `TONE FOR THIS BRIEF (overrides brand tone): ${brief.toneOverride}` : "",
    brief.constraints?.length ? `CONSTRAINTS: ${brief.constraints.join("; ")}` : "",
    ``,
    limitsBlock(brief),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Concept generation with structured outputs (Zod -> JSON schema via `betaZodOutputFormat`).
 *
 * - Streams under the hood so long outputs never hit request timeouts.
 * - Brand kit + product context sit in a cached system block; the brief is the user turn.
 * - Server-side refusal fallbacks are on (`fallbacks: "default"`), so a policy decline on
 *   Opus 5 is re-run on a fallback model inside the same call.
 * - Without credentials it returns deterministic, clearly labelled sample concepts so the
 *   product flow can be exercised offline; `usage.model` is then "sample".
 */
export async function generateConcepts(
  brief: ConceptBrief,
  opts: { client?: Anthropic; model?: string; onConcept?: OnConcept } = {},
): Promise<GenerationResult<ConceptsOutput>> {
  if (!opts.client && !isAnthropicConfigured()) {
    const result = sampleConcepts(brief);
    for (const [index, concept] of result.output.concepts.entries()) await opts.onConcept?.(concept, index, result.usage.model);
    return result;
  }

  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? ANTHROPIC_MODEL;
  const startedAt = Date.now();

  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      { type: "text", text: SYSTEM_RULES },
      { type: "text", text: brandContext(brief), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: briefToPrompt(brief) }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: betaZodOutputFormat(ConceptsOutputSchema),
    },
  });
  let published = 0;
  if (opts.onConcept) {
    const parser = new ConceptStreamParser();
    let servingModel = model;
    for await (const event of stream) {
      if (event.type === "message_start") servingModel = event.message.model;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        for (const concept of parser.push(event.delta.text)) await opts.onConcept(concept, published++, servingModel);
      }
    }
  }
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw refusalError(message);
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude ran out of output tokens before finishing the concept list");
  }

  const output =
    message.parsed_output ??
    ConceptsOutputSchema.parse(
      JSON.parse(
        message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join(""),
      ),
    );

  const usage = usageFrom(model, message.usage, startedAt);
  // A fallback model may have served the request; record what actually ran.
  usage.model = message.model ?? model;
  // A compatible response can still be valid JSON without the expected streaming
  // prefix. Ensure those concepts are saved when the final response is available.
  for (let index = published; opts.onConcept && index < output.concepts.length; index++) {
    await opts.onConcept(output.concepts[index]!, index, usage.model);
  }
  return { output, usage };
}

// ---------------------------------------------------------------------------
// Offline sample generator
// ---------------------------------------------------------------------------

function clip(s: string, max: number): string {
  if (!Number.isFinite(max) || s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, "").trimEnd() + "…";
}

function tightest(brief: ConceptBrief, field: keyof PlatformTextLimits): number {
  const values = brief.platforms
    .map((p) => brief.platformLimits?.[p]?.[field])
    .filter((n): n is number => typeof n === "number" && n > 0);
  return values.length ? Math.min(...values) : Infinity;
}

const SAMPLE_CTAS: Record<string, string> = {
  awareness: "Learn more",
  consideration: "See how it works",
  conversion: "Shop now",
  retention: "Come back for more",
};

/**
 * Deterministic sample concepts derived from the brief text. Used when no Anthropic
 * credentials are configured so the brief -> concepts -> creative flow runs offline.
 */
export function sampleConcepts(brief: ConceptBrief): GenerationResult<ConceptsOutput> {
  const startedAt = Date.now();
  const count = Math.max(1, brief.count ?? 6);
  const formats = brief.formats.length ? brief.formats : (["static"] as ConceptKind[]);
  const product = brief.product?.name ?? brief.brand.name;
  const brand = brief.brand.name;
  const audience = brief.audience.trim() || "people like you";
  const offer = brief.offer?.trim() || brief.keyMessages?.[0] || `${product} from ${brand}`;
  const cta = clip(SAMPLE_CTAS[brief.objective] ?? "Learn more", 20);
  const tone = brief.toneOverride ?? brief.brand.tone?.join(", ");
  const platforms = brief.platforms.length ? brief.platforms : ["meta"];

  const templates: Array<{
    angle: (typeof CONCEPT_ANGLES)[number];
    title: string;
    hook: string;
    headline: string;
    primary: string;
    visual: string;
  }> = [
    {
      angle: "problem/solution",
      title: "The fix",
      hook: `Still putting up with the usual? ${product} was made for ${audience}.`,
      headline: `${product}, minus the hassle`,
      primary: `${offer}. Built for ${audience}, without the compromises.`,
      visual: `Clean product-on-surface shot of ${product}, soft daylight from the left, muted background in brand colours, headline set top-left.`,
    },
    {
      angle: "social proof",
      title: "Word of mouth",
      hook: `Customers keep telling us the same thing about ${product}.`,
      headline: `Why people switch to ${brand}`,
      primary: `${offer}. Join the ${audience} who already made the switch.`,
      visual: `Product held in hand at arm's length, real setting (kitchen counter or bathroom shelf), quote card overlaid in serif italic.`,
    },
    {
      angle: "before/after",
      title: "Then and now",
      hook: `Before ${product}. After ${product}. You will notice.`,
      headline: `See the difference`,
      primary: `${offer}. A simple change that ${audience} notice within days.`,
      visual: `Split frame, left desaturated "before", right warm and bright "after", product centred on the divider line.`,
    },
    {
      angle: "founder story",
      title: "Why we started",
      hook: `We built ${product} because nothing on the shelf worked for us.`,
      headline: `Made by people who needed it`,
      primary: `${brand} started with one problem and one honest fix: ${offer}.`,
      visual: `Founder at a workbench or desk with early prototypes, documentary lighting, product in the foreground, handwritten-style caption.`,
    },
    {
      angle: "objection handling",
      title: "But does it work?",
      hook: `"Is it worth it?" Fair question. Here is the honest answer.`,
      headline: `The honest case for ${product}`,
      primary: `${offer}. No gimmicks, no fine print, and easy to return if it is not for you.`,
      visual: `Product on plain paper background, three short proof points stacked to the right, generous white space.`,
    },
    {
      angle: "comparison",
      title: "Side by side",
      hook: `${product} next to the usual option. Same job, very different result.`,
      headline: `${brand} vs. the usual`,
      primary: `${offer}. Compare and decide for yourself.`,
      visual: `Two products side by side on a neutral surface, ours lit warmly, the alternative in shadow, small comparison table below.`,
    },
    {
      angle: "seasonal",
      title: "This season",
      hook: `New season, new routine. ${product} is the easy first step.`,
      headline: `Ready for the season`,
      primary: `${offer}. A timely reason for ${audience} to try ${product} now.`,
      visual: `Product styled with seasonal props (leaves, linen, citrus), overhead flat lay, warm colour grade, headline bottom-centre.`,
    },
    {
      angle: "problem/solution",
      title: "Morning routine",
      hook: `The two-minute routine ${audience} actually stick with.`,
      headline: `Two minutes, every morning`,
      primary: `${offer}. Fits a real morning, not an ideal one.`,
      visual: `Bathroom mirror scene at dawn, product on the sink edge, steam and soft backlight, on-screen timer graphic.`,
    },
  ];

  const hMax = tightest(brief, "headline");
  const pMax = tightest(brief, "primaryText");
  const dMax = tightest(brief, "description");

  const concepts: Concept[] = Array.from({ length: count }, (_, i) => {
    const t = templates[i % templates.length]!;
    const kind = formats[i % formats.length]!;
    const script =
      kind === "static"
        ? ""
        : [
            `0-3s: Hook on screen and spoken: "${t.hook}"`,
            `3-8s: ${kind === "ugc" ? "Creator holds up" : "Close-up of"} ${product}, shows it in use.`,
            `8-15s: The angle, ${t.angle}: ${t.primary}`,
            `15-22s: Quick proof or demo shot; on-screen text "${t.headline}".`,
            `22-27s: Offer card: "${offer}".`,
            `27-30s: End card with ${brand} logo and CTA "${cta}".`,
          ].join("\n");
    return {
      title: `[Sample] ${t.title}`,
      kind,
      angle: t.angle,
      hook: t.hook,
      headline: clip(t.headline, hMax),
      primaryText: clip(t.primary, pMax),
      description: Number.isFinite(dMax) ? clip(offer, dMax) : "",
      cta,
      visualDirection: `${t.visual}${tone ? ` Tone: ${tone}.` : ""}`,
      scenePrompt: sceneOnly(t.visual),
      script,
      platformFit: platforms,
    };
  });

  return {
    output: { concepts },
    usage: {
      provider: "anthropic",
      model: SAMPLE_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: Date.now() - startedAt,
    },
  };
}

/** Strip product/text mentions from a visual direction so it reads as a background-only prompt (sample mode). */
function sceneOnly(visual: string): string {
  const cleaned = visual
    .split(/(?<=[.;])\s+/)
    .filter((sentence) => !/\b(text|headline|logo|typograph|graphic|caption|label|product|bottle|jar|tube|hand|holding|held)\b/i.test(sentence))
    .join(" ")
    .trim();
  return `${cleaned || "Soft, minimal studio backdrop with a warm gradient and a clean surface."} Generous empty space, nothing in the foreground.`;
}
