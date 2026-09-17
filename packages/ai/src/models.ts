import type { AspectRatio, Capability, ProviderName } from "./types";

export interface ModelSpec {
  /** Stable id used in the DB and credit pricing (never rename). */
  id: string;
  label: string;
  kind: Capability;
  provider: ProviderName;
  /** Credits per unit: image = per image, video = per second. TODO: finalize with pricing (PLAN.md §5). */
  creditsPerUnit: number;
  default?: boolean;
  /** Video-only capabilities. */
  video?: {
    durationsSec: number[];
    ratios: AspectRatio[];
    audio: boolean;
    imageToVideo: boolean;
  };
  notes?: string;
}

export const videoModels: ModelSpec[] = [
  {
    id: "kling-3.0",
    label: "Kling 3.0",
    kind: "video",
    provider: "fal",
    creditsPerUnit: 10,
    default: true,
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1"], audio: true, imageToVideo: true },
  },
  {
    id: "veo-3.1",
    label: "Veo 3.1",
    kind: "video",
    provider: "fal",
    creditsPerUnit: 14,
    video: { durationsSec: [4, 6, 8], ratios: ["16:9", "9:16"], audio: true, imageToVideo: true },
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    kind: "video",
    provider: "fal",
    creditsPerUnit: 8,
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1", "4:5"], audio: false, imageToVideo: true },
  },
  {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    kind: "video",
    provider: "fal",
    creditsPerUnit: 4,
    notes: "Low-cost draft option.",
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1"], audio: false, imageToVideo: true },
  },
];

export const imageModels: ModelSpec[] = [
  { id: "nano-banana-2", label: "Nano Banana 2", kind: "image", provider: "fal", creditsPerUnit: 2, notes: "Fast portraits and reference-based edits." },
  { id: "seedream-5-lite", label: "Seedream 5 Lite", kind: "image", provider: "fal", creditsPerUnit: 2, notes: "Detailed portraits, outfits and lifestyle scenes." },
  { id: "gpt-image-2", label: "GPT Image 2", kind: "image", provider: "fal", creditsPerUnit: 3, notes: "Detailed compositions and reference-based editing." },
  { id: "qwen-image-2-pro", label: "Qwen Image 2 Pro", kind: "image", provider: "fal", creditsPerUnit: 2, notes: "Portraits, precise prompts and image editing." },
  { id: "flux-2-dev", label: "FLUX.2 Dev", kind: "image", provider: "fal", creditsPerUnit: 1, notes: "Explore character concepts and new looks." },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", kind: "image", provider: "openai", creditsPerUnit: 2, notes: "Detailed compositions and precise image editing." },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare", kind: "image", provider: "openai", creditsPerUnit: 1, notes: "Faster creative exploration and drafts." },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    kind: "image",
    provider: "fal",
    creditsPerUnit: 2,
    default: true,
    notes: "Best for text-in-image and product edits.",
  },
  {
    id: "seedream-4.5",
    label: "Seedream 4.5",
    kind: "image",
    provider: "fal",
    creditsPerUnit: 2,
    notes: "Photoreal lifestyle scenes.",
  },
  {
    id: "flux-2-max",
    label: "FLUX.2 Max",
    kind: "image",
    provider: "fal",
    creditsPerUnit: 3,
    notes: "Stylised backgrounds.",
  },
];

export const textModels: ModelSpec[] = [
  { id: "claude-opus-5", label: "Claude Opus 5", kind: "text", provider: "anthropic", creditsPerUnit: 0, default: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", kind: "text", provider: "anthropic", creditsPerUnit: 0, notes: "Cheap bulk variations." },
];

export const models: ModelSpec[] = [...textModels, ...imageModels, ...videoModels];

export function getModel(id: string): ModelSpec | undefined {
  return models.find((m) => m.id === id);
}

export function defaultModel(kind: Capability): ModelSpec {
  const m = models.find((x) => x.kind === kind && x.default) ?? models.find((x) => x.kind === kind);
  if (!m) throw new Error(`No model registered for ${kind}`);
  return m;
}
