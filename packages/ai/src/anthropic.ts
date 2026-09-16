import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { GenerationResult, StructuredRequest, TextProvider, TextRequest, Usage } from "./types";
import { ConceptsOutputSchema, type ConceptBrief, type ConceptsOutput } from "./concepts";

export const ANTHROPIC_MODEL = "claude-opus-5";

// Opus 5 pricing per 1M tokens (USD). TODO: move to the credits/pricing module.
const PRICE = { input: 5, output: 25 };

function usageFrom(model: string, u: Anthropic.Usage, startedAt: number): Usage {
  return {
    provider: "anthropic",
    model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    costUsd: (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output) / 1_000_000,
    durationMs: Date.now() - startedAt,
  };
}

function effortOf(req: TextRequest): "low" | "medium" | "high" | "max" {
  return req.effort ?? "high";
}

export class AnthropicTextProvider implements TextProvider {
  readonly name = "anthropic" as const;
  readonly capability = "text" as const;
  private client: Anthropic;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
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
    if (message.stop_reason === "refusal") {
      throw new Error(`Claude declined the request (${message.stop_details?.category ?? "unknown"})`);
    }
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
   * Structured output via `output_config.format` with a raw JSON schema.
   * (For Zod schemas prefer `client.messages.parse` + `zodOutputFormat`, as in `generateConcepts`.)
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
        // TODO: verify against the installed SDK version — shape per Anthropic docs is
        // { type: "json_schema", schema: <JSON Schema object> }.
        format: { type: "json_schema", schema: req.schema },
      },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error(`Claude declined the request (${message.stop_details?.category ?? "unknown"})`);
    }
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const raw: unknown = JSON.parse(text);
    const output = req.parse ? req.parse(raw) : (raw as T);
    return { output, usage: usageFrom(this.model, message.usage, startedAt) };
  }
}

const SYSTEM = `You are Adcraft's creative director. You write paid-social ad concepts that are
specific to the brand, honest about the product, and built to stop the scroll.
Respect platform text limits: headline <= 40 chars, primary text <= 125 chars, description <= 30 chars, CTA <= 20 chars.
Never invent product claims that are not in the brief.`;

function briefToPrompt(brief: ConceptBrief): string {
  const n = brief.count ?? 5;
  return [
    `Generate ${n} distinct ad concepts.`,
    `Formats allowed: ${brief.formats.join(", ")}. Platforms: ${brief.platforms.join(", ")}.`,
    ``,
    `BRAND: ${brief.brand.name}${brief.brand.industry ? ` (${brief.brand.industry})` : ""}`,
    brief.brand.tagline ? `Tagline: ${brief.brand.tagline}` : "",
    brief.brand.tone?.length ? `Tone: ${brief.brand.tone.join(", ")}` : "",
    brief.brand.doSay?.length ? `Do say: ${brief.brand.doSay.join("; ")}` : "",
    brief.brand.dontSay?.length ? `Don't say: ${brief.brand.dontSay.join("; ")}` : "",
    ``,
    `PRODUCT: ${brief.product.name}`,
    brief.product.description ? `Description: ${brief.product.description}` : "",
    brief.product.price ? `Price: ${brief.product.price}` : "",
    brief.product.attributes ? `Attributes: ${JSON.stringify(brief.product.attributes)}` : "",
    ``,
    `OBJECTIVE: ${brief.objective}`,
    `AUDIENCE: ${brief.audience}`,
    brief.offer ? `OFFER: ${brief.offer}` : "",
    brief.keyMessages?.length ? `KEY MESSAGES: ${brief.keyMessages.join("; ")}` : "",
    brief.constraints?.length ? `CONSTRAINTS: ${brief.constraints.join("; ")}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Concept generation with structured outputs (Zod -> JSON schema via `zodOutputFormat`).
 * Uses streaming under the hood so long outputs never hit request timeouts.
 */
export async function generateConcepts(
  brief: ConceptBrief,
  opts: { client?: Anthropic; model?: string } = {},
): Promise<GenerationResult<ConceptsOutput>> {
  const client = opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = opts.model ?? ANTHROPIC_MODEL;
  const startedAt = Date.now();

  const stream = client.messages.stream({
    model,
    max_tokens: 16_000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: briefToPrompt(brief) }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(ConceptsOutputSchema),
    },
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`Claude declined the request (${message.stop_details?.category ?? "unknown"})`);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const output = ConceptsOutputSchema.parse(JSON.parse(text));

  return { output, usage: usageFrom(model, message.usage, startedAt) };
}
