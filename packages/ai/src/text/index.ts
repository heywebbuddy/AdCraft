import type { GenerationResult } from "../types";
import { defaultModel, getModel, listModels, apiModelName, type ModelSpec } from "../models";
import { generateConcepts, isAnthropicConfigured, sampleConcepts } from "../anthropic";
import type { ConceptBrief, ConceptsOutput } from "../concepts";
import { generateConceptsOpenAI, isOpenAIChatConfigured } from "./openai-chat";

export { generateConceptsOpenAI, isOpenAIChatConfigured } from "./openai-chat";

/** Whether the provider behind a text model has credentials on this server. */
export function isTextModelConfigured(spec: ModelSpec): boolean {
  return spec.provider === "anthropic" ? isAnthropicConfigured() : isOpenAIChatConfigured(spec);
}

/**
 * Concept generation on whichever text model the catalog says (default, or an explicit
 * id). Anthropic and OpenAI-compatible providers share prompts and schema, so switching
 * the default text model in the admin panel changes nothing else.
 */
export async function generateConceptsWith(brief: ConceptBrief, modelId?: string): Promise<GenerationResult<ConceptsOutput>> {
  const spec = (modelId ? getModel(modelId) : undefined) ?? defaultModel("text");
  if (spec.kind !== "text") throw new Error(`"${spec.id}" is not a text model`);
  if (!isTextModelConfigured(spec)) {
    // Fall back to any connected text model before giving up and using samples.
    const alt = listModels("text").find((m) => m.id !== spec.id && isTextModelConfigured(m));
    if (alt) return generateConceptsWith(brief, alt.id);
    return sampleConcepts(brief);
  }
  if (spec.provider === "anthropic") return generateConcepts(brief, { model: apiModelName(spec) });
  return generateConceptsOpenAI(brief, spec);
}
