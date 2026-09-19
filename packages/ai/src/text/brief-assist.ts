import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { GenerationResult } from "../types";
import { apiModelName, defaultModel, getModel, listModels, type ModelSpec } from "../models";
import { isAnthropicConfigured } from "../anthropic";
import { isOpenAIChatConfigured } from "./openai-chat";

function configured(spec: ModelSpec): boolean {
  return spec.provider === "anthropic" ? isAnthropicConfigured() : isOpenAIChatConfigured(spec);
}

export const BRIEF_OBJECTIVES = ["awareness", "consideration", "conversion", "retention"] as const;
export const BRIEF_PLATFORMS = ["meta", "instagram", "tiktok", "google", "youtube"] as const;
export const BRIEF_FORMATS = ["static", "video", "ugc"] as const;
export const BRIEF_FIELDS = [
  "all",
  "title",
  "productId",
  "objective",
  "audience",
  "offer",
  "platforms",
  "formats",
  "tone",
  "constraints",
] as const;

export type BriefField = (typeof BRIEF_FIELDS)[number];

export const BriefAssistSchema = z.object({
  title: z.string().describe("Internal brief title, 4–10 words. Specific to this campaign, not generic."),
  productId: z
    .string()
    .describe("Exact product id from the provided list, or an empty string when the brief is for the whole brand."),
  objective: z.enum(BRIEF_OBJECTIVES),
  audience: z
    .string()
    .describe("One or two sentences naming a real person, their situation, and why they would care. Not a demographic dump."),
  offer: z.string().describe("The one thing the ad must say: offer, proof, or key message. Concrete. Empty only if nothing is known."),
  platforms: z.array(z.enum(BRIEF_PLATFORMS)).min(1),
  formats: z.array(z.enum(BRIEF_FORMATS)).min(1),
  tone: z.string().describe("Short tone override for this brief, or empty to keep the brand kit."),
  constraints: z.array(z.string()).describe("Hard rules, one item each. Empty array if none."),
  note: z.string().describe("One short sentence on what you suggested or fixed."),
});

export type BriefAssist = z.infer<typeof BriefAssistSchema>;

export type BriefAssistRequest = {
  scope: BriefField;
  brand: {
    name: string;
    industry?: string;
    website?: string;
    tone?: string[];
    doSay?: string[];
    dontSay?: string[];
    tagline?: string;
  };
  products: Array<{ id: string; name: string; description?: string; price?: string }>;
  draft: {
    title: string;
    productId: string;
    objective: string;
    audience: string;
    offer: string;
    platforms: string[];
    formats: string[];
    tone: string;
    constraints: string;
  };
};

const SYSTEM = `You write paid-social briefs for Adcraft. You fill empty fields and you rewrite weak, vague, off-topic, or garbled input into a brief a media buyer could run.

Rules:
- Honour any usable intent in what the user typed. If a field is nonsense or empty, replace it with something specific to this brand and product.
- Never invent product claims, prices, discounts, awards, or testimonials that are not in the brand kit or product list.
- Name a person and a situation in the audience, not a demographic dump.
- One offer per brief. Keep the key message to one concrete idea.
- Constraints are hard rules ("no medical claims"), not adjectives.
- productId must be an id from the provided list, or an empty string.
- platforms and formats must be chosen from the allowed enums.
- Match the brand voice. Use do-say phrases where natural; never use don't-say phrases.`;

function requestToPrompt(req: BriefAssistRequest): string {
  const p = req.products
    .map((x) => `- ${x.id} · ${x.name}${x.price ? ` (${x.price})` : ""}${x.description ? ` — ${x.description}` : ""}`)
    .join("\n");
  const d = req.draft;
  return [
    `SCOPE: ${req.scope}`,
    `If SCOPE is not "all", still return every field so the brief stays consistent, but put your best work into the scoped field.`,
    ``,
    `BRAND: ${req.brand.name}${req.brand.industry ? ` (${req.brand.industry})` : ""}`,
    req.brand.website ? `Website: ${req.brand.website}` : "",
    req.brand.tagline ? `Tagline: ${req.brand.tagline}` : "",
    req.brand.tone?.length ? `Tone of voice: ${req.brand.tone.join(", ")}` : "",
    req.brand.doSay?.length ? `Do say: ${req.brand.doSay.join("; ")}` : "",
    req.brand.dontSay?.length ? `Don't say: ${req.brand.dontSay.join("; ")}` : "",
    ``,
    p ? `PRODUCTS:\n${p}` : "PRODUCTS: none in the library — leave productId empty.",
    ``,
    `CURRENT DRAFT:`,
    `title: ${d.title || "(empty)"}`,
    `productId: ${d.productId || "(empty)"}`,
    `objective: ${d.objective || "(empty)"}`,
    `audience: ${d.audience || "(empty)"}`,
    `offer: ${d.offer || "(empty)"}`,
    `platforms: ${d.platforms.join(", ") || "(empty)"}`,
    `formats: ${d.formats.join(", ") || "(empty)"}`,
    `tone: ${d.tone || "(empty)"}`,
    `constraints: ${d.constraints || "(empty)"}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Prefer Haiku for this interactive field (fast, cheap); otherwise any connected text model. */
export function briefAssistModel(preferredId?: string): ModelSpec {
  if (preferredId) {
    const spec = getModel(preferredId);
    if (spec?.kind === "text" && configured(spec)) return spec;
  }
  const haiku = listModels("text").find((m) => m.id.includes("haiku") && configured(m));
  if (haiku) return haiku;
  const def = defaultModel("text");
  if (def.kind === "text" && configured(def)) return def;
  return listModels("text").find((m) => configured(m)) ?? def;
}

export function sampleBriefAssist(req: BriefAssistRequest): GenerationResult<BriefAssist> {
  const product = req.products.find((p) => p.id === req.draft.productId) ?? req.products[0];
  const brand = req.brand.name;
  const objective = (BRIEF_OBJECTIVES as readonly string[]).includes(req.draft.objective)
    ? (req.draft.objective as BriefAssist["objective"])
    : "conversion";
  const platforms = req.draft.platforms.filter((p): p is BriefAssist["platforms"][number] =>
    (BRIEF_PLATFORMS as readonly string[]).includes(p),
  );
  const formats = req.draft.formats.filter((f): f is BriefAssist["formats"][number] =>
    (BRIEF_FORMATS as readonly string[]).includes(f),
  );
  return {
    output: {
      title: req.draft.title.trim() || `${brand}${product ? `: ${product.name}` : ""} · ${objective}`,
      productId: product?.id ?? "",
      objective,
      audience:
        req.draft.audience.trim() ||
        `People who already buy from brands like ${brand} and want a clearer everyday option, not another generic promise.`,
      offer: req.draft.offer.trim() || req.brand.tagline || `See why people switch to ${brand}.`,
      platforms: platforms.length ? platforms : ["meta", "instagram"],
      formats: formats.length ? formats : ["static"],
      tone: req.draft.tone.trim() || (req.brand.tone ?? []).join(", "),
      constraints: req.draft.constraints
        .split(/\r?\n|;/)
        .map((s) => s.trim())
        .filter(Boolean),
      note: "Sample brief — connect a text model for live suggestions.",
    },
    usage: { provider: "anthropic", model: "sample", durationMs: 0 },
  };
}

export async function generateBriefAssistAnthropic(
  req: BriefAssistRequest,
  spec: ModelSpec,
): Promise<GenerationResult<BriefAssist>> {
  const client = new Anthropic();
  const model = apiModelName(spec);
  const startedAt = Date.now();
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 2_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: requestToPrompt(req) }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(BriefAssistSchema),
    },
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error(`Claude declined the request (${message.stop_details?.category ?? "unknown"})`);
  }
  const output =
    message.parsed_output ??
    BriefAssistSchema.parse(
      JSON.parse(
        message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join(""),
      ),
    );
  return {
    output,
    usage: {
      provider: "anthropic",
      model: message.model ?? model,
      durationMs: Date.now() - startedAt,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

export async function generateBriefAssistOpenAI(
  req: BriefAssistRequest,
  spec: ModelSpec,
): Promise<GenerationResult<BriefAssist>> {
  const apiKey = (spec.apiKeyEnv ? process.env[spec.apiKeyEnv] : process.env.OPENAI_API_KEY)?.trim();
  if (!apiKey) throw new Error(`${spec.label} is not connected.`);
  const baseUrl = (spec.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const startedAt = Date.now();
  const schema = z.toJSONSchema(BriefAssistSchema, { target: "draft-7", unrepresentable: "any" });
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: apiModelName(spec),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: requestToPrompt(req) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "brief_assist", schema, strict: false } },
      ...(spec.options ?? {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`${spec.label} request failed (${res.status}): ${(await res.text()).slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`${spec.label} declined the request: ${choice.message.refusal}`);
  const content = choice?.message?.content;
  if (!content) throw new Error(`${spec.label} returned no content`);
  return {
    output: BriefAssistSchema.parse(JSON.parse(content)),
    usage: {
      provider: spec.provider,
      model: spec.id,
      durationMs: Date.now() - startedAt,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    },
  };
}

export async function generateBriefAssistWith(
  req: BriefAssistRequest,
  modelId?: string,
): Promise<GenerationResult<BriefAssist>> {
  const spec = briefAssistModel(modelId);
  if (!configured(spec)) {
    const alt = listModels("text").find((m) => m.id !== spec.id && configured(m));
    if (alt) return generateBriefAssistWith(req, alt.id);
    return sampleBriefAssist(req);
  }
  try {
    if (spec.provider === "anthropic") {
      if (!isAnthropicConfigured()) return sampleBriefAssist(req);
      return await generateBriefAssistAnthropic(req, spec);
    }
    if (!isOpenAIChatConfigured(spec)) return sampleBriefAssist(req);
    return await generateBriefAssistOpenAI(req, spec);
  } catch (err) {
    const fallback = defaultModel("text");
    if (fallback.id !== spec.id && configured(fallback)) {
      if (fallback.provider === "anthropic") return generateBriefAssistAnthropic(req, fallback);
      return generateBriefAssistOpenAI(req, fallback);
    }
    throw err;
  }
}
