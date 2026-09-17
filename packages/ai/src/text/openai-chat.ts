import { z } from "zod";
import type { GenerationResult } from "../types";
import { apiModelName, type ModelSpec } from "../models";
import { ConceptsOutputSchema, type ConceptBrief, type ConceptsOutput } from "../concepts";
import { SYSTEM_RULES, brandContext, briefToPrompt } from "../anthropic";

/**
 * Concept generation over any OpenAI-compatible chat completions endpoint (OpenAI itself,
 * Gemini's compatibility endpoint, Groq, Together, Ollama, vLLM…). Uses the same prompts
 * and the same Zod schema as the Anthropic path, sent as `response_format: json_schema`.
 */
export function isOpenAIChatConfigured(spec?: Pick<ModelSpec, "apiKeyEnv">): boolean {
  return Boolean((spec?.apiKeyEnv ? process.env[spec.apiKeyEnv] : process.env.OPENAI_API_KEY)?.trim());
}

export async function generateConceptsOpenAI(brief: ConceptBrief, spec: ModelSpec): Promise<GenerationResult<ConceptsOutput>> {
  const apiKey = (spec.apiKeyEnv ? process.env[spec.apiKeyEnv] : process.env.OPENAI_API_KEY)?.trim();
  if (!apiKey) throw new Error(`${spec.label} is not connected. Add ${spec.apiKeyEnv ?? "OPENAI_API_KEY"} on the server.`);
  const baseUrl = (spec.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const startedAt = Date.now();

  const schema = z.toJSONSchema(ConceptsOutputSchema, { target: "draft-7", unrepresentable: "any" });
  const body = {
    model: apiModelName(spec),
    messages: [
      { role: "system", content: `${SYSTEM_RULES}\n\n${brandContext(brief)}` },
      { role: "user", content: briefToPrompt(brief) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "concepts", schema, strict: false } },
    ...(spec.options ?? {}),
  };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`${spec.label} request failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`${spec.label} declined the request: ${choice.message.refusal}`);
  if (choice?.finish_reason === "length") throw new Error(`${spec.label} ran out of output tokens before finishing the concept list`);
  const content = choice?.message?.content;
  if (!content) throw new Error(`${spec.label} returned no content`);
  const output = ConceptsOutputSchema.parse(JSON.parse(content));
  return {
    output,
    usage: {
      provider: spec.provider,
      model: spec.id,
      durationMs: Date.now() - startedAt,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      costUsd: spec.approxCostUsd,
    },
  };
}
