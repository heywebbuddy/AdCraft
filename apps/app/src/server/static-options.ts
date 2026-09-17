import "server-only";
import { imageModels, isFalConfigured, isOpenAIConfigured } from "@adcraft/ai";
import { getModelOverrides } from "./platform-settings";

export const BEST_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export const FAST_IMAGE_MODEL = "gpt-image-2.5-flare";
export const STATIC_PLACEMENTS = [
  "meta.feed.1x1",
  "meta.feed.4x5",
  "meta.stories.9x16",
  "youtube.instream.16x9",
] as const;

export async function staticModelChoices() {
  const overrides = await getModelOverrides();
  return imageModels.map((m) => ({
    id: m.id,
    label: m.label,
    notes: m.notes ?? "",
    isDefault: m.id === BEST_IMAGE_MODEL,
    provider: m.provider,
    enabled: overrides[m.id]?.enabled !== false,
    configured:
      m.provider === "openai" ? isOpenAIConfigured() : isFalConfigured,
    credits: Math.ceil(overrides[m.id]?.creditsPerUnit ?? m.creditsPerUnit),
  }));
}
