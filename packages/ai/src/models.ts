import type { AspectRatio, Capability, ProviderName } from "./types";

/**
 * The model catalog.
 *
 * Every model is a self-describing `ModelSpec`: which provider serves it, which endpoint
 * ids to call, which *input preset* shapes the request, and what it costs. The adapters
 * (`image/fal-input.ts`, `video/fal-video.ts`, `image/openai.ts`, `text/*`) read the spec
 * instead of switching on model ids, so a new model is data, not code.
 *
 * `BUILT_IN_MODELS` is the seed list. The app merges rows from the `ai_models` table
 * (platform-admin edits and additions) on top and calls `registerModels()` per request /
 * job, so pickers, pipelines and adapters all see one catalog.
 */

/** How to shape provider input. Adapters know these; specs pick one. */
export type ImagePreset = "nano-banana" | "seedream" | "flux" | "gpt-image" | "qwen" | "fal-generic" | "openai-images" | "replicate-generic" | "runway-image";
export type VideoPreset = "kling" | "veo" | "seedance" | "fal-generic" | "replicate-generic" | "runway-video";
export type TextPreset = "anthropic-messages" | "openai-chat";
export type ModelPreset = ImagePreset | VideoPreset | TextPreset;

export const IMAGE_PRESETS: Array<{ id: ImagePreset; label: string; provider: ProviderName; hint: string }> = [
  { id: "nano-banana", label: "Nano Banana (Google)", provider: "fal", hint: "aspect_ratio, resolution 1K, num_images" },
  { id: "seedream", label: "Seedream (ByteDance)", provider: "fal", hint: "image_size scaled to ≥ 1440p, num_images" },
  { id: "flux", label: "FLUX", provider: "fal", hint: "image_size, output_format png" },
  { id: "gpt-image", label: "GPT Image via fal", provider: "fal", hint: "image_size (×16), quality high" },
  { id: "qwen", label: "Qwen Image", provider: "fal", hint: "image_size, num_images" },
  { id: "fal-generic", label: "Generic fal endpoint", provider: "fal", hint: "prompt, image_size {width,height}, num_images, seed" },
  { id: "openai-images", label: "OpenAI Images API", provider: "openai", hint: "size per ratio, quality from options" },
  { id: "replicate-generic", label: "Replicate model", provider: "replicate", hint: "prompt, aspect_ratio, width/height, num_outputs, image_input for references; ref = owner/name[:version]" },
  { id: "runway-image", label: "Runway text_to_image", provider: "runway", hint: "promptText, pixel ratio per size, up to 3 referenceImages; model = gen4_image" },
];
export const VIDEO_PRESETS: Array<{ id: VideoPreset; label: string; provider: ProviderName; hint: string }> = [
  { id: "kling", label: "Kling", provider: "fal", hint: "duration string, start_image_url, generate_audio" },
  { id: "veo", label: "Veo", provider: "fal", hint: "duration \"Ns\", aspect_ratio 16:9 | 9:16, resolution 1080p" },
  { id: "seedance", label: "Seedance", provider: "fal", hint: "duration 4–15, aspect_ratio, image_url" },
  { id: "fal-generic", label: "Generic fal endpoint", provider: "fal", hint: "prompt, duration, aspect_ratio, image_url" },
  { id: "replicate-generic", label: "Replicate model", provider: "replicate", hint: "prompt, aspect_ratio, duration, image / start_image; ref = owner/name[:version]" },
  { id: "runway-video", label: "Runway image_to_video", provider: "runway", hint: "promptImage (start frame), promptText, pixel ratio, duration 5 | 10; model = gen4_turbo" },
];
export const TEXT_PRESETS: Array<{ id: TextPreset; label: string; provider: ProviderName; hint: string }> = [
  { id: "anthropic-messages", label: "Anthropic Messages API", provider: "anthropic", hint: "structured outputs, prompt caching, adaptive thinking" },
  { id: "openai-chat", label: "OpenAI-compatible chat completions", provider: "openai", hint: "response_format json_schema; works with OpenAI, Gemini, Groq, Ollama, vLLM…" },
];

export interface ModelSpec {
  /** Stable id used in the DB and credit pricing (never rename). */
  id: string;
  label: string;
  kind: Capability;
  provider: ProviderName;
  /** Credits per unit: image = per image, video = per second, text = per generation. */
  creditsPerUnit: number;
  default?: boolean;
  /** Hidden from pickers and refused by pipelines when false. */
  enabled?: boolean;
  notes?: string;
  /** Input preset the adapter uses to shape the request. */
  preset?: ModelPreset;
  /**
   * Provider endpoint ids. fal: `text`/`edit` for images, `textToVideo`/`imageToVideo` for
   * video. OpenAI / Anthropic / OpenAI-compatible: `text` is the API model name when it
   * differs from our id (e.g. "claude-haiku-4-5-20251001").
   */
  endpoints?: { text?: string; edit?: string; textToVideo?: string; imageToVideo?: string };
  /** Extra provider input merged over the preset's fields (e.g. `{ "quality": "low" }`). */
  options?: Record<string, unknown>;
  /** OpenAI-compatible text models: API base URL and the env var holding its key. */
  baseUrl?: string;
  apiKeyEnv?: string;
  /** Approximate USD per unit, for the cost column in generation events. */
  approxCostUsd?: number;
  /** Some endpoints return one image per call regardless of num_images. */
  maxImagesPerCall?: number;
  /** Endpoint rejects a `seed` field. */
  noSeed?: boolean;
  /** Longest prompt the endpoint accepts; longer prompts are trimmed at a sentence boundary. */
  maxPromptChars?: number;
  /** Video-only capabilities. */
  video?: {
    durationsSec: number[];
    ratios: AspectRatio[];
    audio: boolean;
    imageToVideo: boolean;
  };
  /** Added from the admin panel (not in BUILT_IN_MODELS). */
  custom?: boolean;
}

export const BUILT_IN_VIDEO_MODELS: ModelSpec[] = [
  {
    id: "kling-3.0",
    label: "Kling 3.0",
    kind: "video",
    provider: "fal",
    preset: "kling",
    endpoints: { imageToVideo: "fal-ai/kling-video/v3/standard/image-to-video", textToVideo: "fal-ai/kling-video/v3/standard/text-to-video" },
    creditsPerUnit: 10,
    approxCostUsd: 0.07,
    default: true,
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1"], audio: true, imageToVideo: true },
  },
  {
    id: "veo-3.1",
    label: "Veo 3.1",
    kind: "video",
    provider: "fal",
    preset: "veo",
    endpoints: { imageToVideo: "fal-ai/veo3.1/image-to-video", textToVideo: "fal-ai/veo3.1" },
    creditsPerUnit: 14,
    approxCostUsd: 0.4,
    video: { durationsSec: [4, 6, 8], ratios: ["16:9", "9:16"], audio: true, imageToVideo: true },
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    kind: "video",
    provider: "fal",
    preset: "seedance",
    // Seedance 2.x live under "bytedance/…" without the "fal-ai/" prefix.
    endpoints: { imageToVideo: "bytedance/seedance-2.5/image-to-video", textToVideo: "bytedance/seedance-2.5/text-to-video" },
    creditsPerUnit: 8,
    approxCostUsd: 0.06,
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1", "4:5"], audio: false, imageToVideo: true },
  },
  {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    kind: "video",
    provider: "fal",
    preset: "seedance",
    endpoints: { imageToVideo: "bytedance/seedance-2.0/image-to-video", textToVideo: "bytedance/seedance-2.0/text-to-video" },
    creditsPerUnit: 4,
    approxCostUsd: 0.03,
    notes: "Low-cost draft option.",
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1"], audio: false, imageToVideo: true },
  },
];

export const BUILT_IN_IMAGE_MODELS: ModelSpec[] = [
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    kind: "image",
    provider: "fal",
    preset: "nano-banana",
    endpoints: { text: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit" },
    creditsPerUnit: 2,
    approxCostUsd: 0.15,
    default: true,
    notes: "Best for text-in-image and product edits.",
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    kind: "image",
    provider: "fal",
    preset: "nano-banana",
    endpoints: { text: "fal-ai/nano-banana-2", edit: "fal-ai/nano-banana-2/edit" },
    creditsPerUnit: 2,
    notes: "Fast portraits and reference-based edits.",
  },
  {
    id: "seedream-4.5",
    label: "Seedream 4.5",
    kind: "image",
    provider: "fal",
    preset: "seedream",
    endpoints: { text: "fal-ai/bytedance/seedream/v4.5/text-to-image", edit: "fal-ai/bytedance/seedream/v4.5/edit" },
    creditsPerUnit: 2,
    approxCostUsd: 0.04,
    notes: "Photoreal lifestyle scenes.",
  },
  {
    id: "seedream-5-lite",
    label: "Seedream 5 Lite",
    kind: "image",
    provider: "fal",
    preset: "seedream",
    endpoints: { text: "fal-ai/bytedance/seedream/v5/lite/text-to-image", edit: "fal-ai/bytedance/seedream/v5/lite/edit" },
    creditsPerUnit: 2,
    noSeed: true,
    notes: "Detailed portraits, outfits and lifestyle scenes.",
  },
  {
    id: "flux-2-max",
    label: "FLUX.2 Max",
    kind: "image",
    provider: "fal",
    preset: "flux",
    endpoints: { text: "fal-ai/flux-2-max", edit: "fal-ai/flux-2-max/edit" },
    creditsPerUnit: 3,
    approxCostUsd: 0.07,
    maxImagesPerCall: 1,
    notes: "Stylised backgrounds.",
  },
  {
    id: "flux-2-dev",
    label: "FLUX.2 Dev",
    kind: "image",
    provider: "fal",
    preset: "flux",
    endpoints: { text: "fal-ai/flux-2", edit: "fal-ai/flux-2/edit" },
    creditsPerUnit: 1,
    notes: "Explore character concepts and new looks.",
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    kind: "image",
    provider: "fal",
    preset: "gpt-image",
    endpoints: { text: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit" },
    creditsPerUnit: 3,
    noSeed: true,
    notes: "Detailed compositions and reference-based editing.",
  },
  {
    id: "qwen-image-2-pro",
    label: "Qwen Image 2 Pro",
    kind: "image",
    provider: "fal",
    preset: "qwen",
    endpoints: { text: "fal-ai/qwen-image-2/pro/text-to-image", edit: "fal-ai/qwen-image-2/pro/edit" },
    creditsPerUnit: 2,
    notes: "Portraits, precise prompts and image editing.",
  },
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    kind: "image",
    provider: "openai",
    preset: "openai-images",
    options: { quality: "high" },
    creditsPerUnit: 2,
    notes: "Detailed compositions and precise image editing.",
  },
  {
    id: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    kind: "image",
    provider: "openai",
    preset: "openai-images",
    options: { quality: "low" },
    creditsPerUnit: 1,
    notes: "Faster creative exploration and drafts.",
  },
];

/**
 * Replicate examples, shipped disabled: the refs are the models' public names on
 * replicate.com; enable after a successful Test in Admin → Models.
 */
export const BUILT_IN_REPLICATE_MODELS: ModelSpec[] = [
  {
    id: "imagen-4-replicate",
    label: "Imagen 4 (Replicate)",
    kind: "image",
    provider: "replicate",
    preset: "replicate-generic",
    endpoints: { text: "google/imagen-4", edit: "none" },
    creditsPerUnit: 2,
    approxCostUsd: 0.04,
    enabled: false,
    noSeed: true,
    notes: "Google Imagen 4 on Replicate. Prompt-only (no reference edits).",
  },
  {
    id: "kling-2.1-replicate",
    label: "Kling 2.1 (Replicate)",
    kind: "video",
    provider: "replicate",
    preset: "replicate-generic",
    endpoints: { imageToVideo: "kwaivgi/kling-v2.1", textToVideo: "kwaivgi/kling-v2.1" },
    creditsPerUnit: 8,
    approxCostUsd: 0.05,
    enabled: false,
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1"], audio: false, imageToVideo: true },
    notes: "Kling 2.1 on Replicate; start_image drives image-to-video.",
  },
];

/** Runway Gen-4, shipped disabled until RUNWAYML_API_SECRET is set and Test passes. */
export const BUILT_IN_RUNWAY_MODELS: ModelSpec[] = [
  {
    id: "runway-gen4-image",
    label: "Runway Gen-4 Image",
    kind: "image",
    provider: "runway",
    preset: "runway-image",
    endpoints: { text: "gen4_image" },
    creditsPerUnit: 2,
    approxCostUsd: 0.08,
    enabled: false,
    notes: "Reference-guided stills (up to 3 references).",
  },
  {
    id: "runway-gen4-turbo",
    label: "Runway Gen-4 Turbo",
    kind: "video",
    provider: "runway",
    preset: "runway-video",
    endpoints: { imageToVideo: "gen4_turbo" },
    creditsPerUnit: 8,
    approxCostUsd: 0.05,
    enabled: false,
    video: { durationsSec: [5, 10], ratios: ["16:9", "9:16", "1:1", "4:5"], audio: false, imageToVideo: true },
    notes: "Image-to-video from the scene still; 5 or 10 s.",
  },
];

export const BUILT_IN_TEXT_MODELS: ModelSpec[] = [
  { id: "claude-opus-5", label: "Claude Opus 5", kind: "text", provider: "anthropic", preset: "anthropic-messages", creditsPerUnit: 0, default: true },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    kind: "text",
    provider: "anthropic",
    preset: "anthropic-messages",
    endpoints: { text: "claude-haiku-4-5-20251001" },
    creditsPerUnit: 0,
    notes: "Cheap bulk variations.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    kind: "text",
    provider: "openai",
    preset: "openai-chat",
    creditsPerUnit: 0,
    notes: "OpenAI structured outputs. Needs OPENAI_API_KEY.",
  },
];

export const BUILT_IN_MODELS: ModelSpec[] = [...BUILT_IN_TEXT_MODELS, ...BUILT_IN_IMAGE_MODELS, ...BUILT_IN_VIDEO_MODELS, ...BUILT_IN_REPLICATE_MODELS, ...BUILT_IN_RUNWAY_MODELS];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ModelSpec>(BUILT_IN_MODELS.map((m) => [m.id, { ...m }]));

/**
 * Replace the catalog with `specs` (built-ins merged with admin rows). Called by the app
 * once per request / job after reading `ai_models`; safe to call repeatedly.
 */
export function registerModels(specs: ModelSpec[]) {
  registry.clear();
  for (const s of specs) registry.set(s.id, { ...s });
}

/** Every model, enabled or not, in catalog order. */
export function allModels(): ModelSpec[] {
  return Array.from(registry.values());
}

/** Enabled models of a kind, in catalog order. */
export function listModels(kind?: Capability): ModelSpec[] {
  return allModels().filter((m) => m.enabled !== false && (!kind || m.kind === kind));
}

export function getModel(id: string): ModelSpec | undefined {
  return registry.get(id);
}

export function defaultModel(kind: Capability): ModelSpec {
  const enabled = listModels(kind);
  const m = enabled.find((x) => x.default) ?? enabled[0] ?? allModels().find((x) => x.kind === kind);
  if (!m) throw new Error(`No model registered for ${kind}`);
  return m;
}

/** The API model name to send the provider (falls back to our id). */
export function apiModelName(spec: ModelSpec): string {
  return spec.endpoints?.text ?? spec.id;
}

/**
 * Merge admin rows over the built-in list. A row for a built-in id overrides its fields;
 * a row with an unknown id is a custom model and must carry a full spec.
 */
export function mergeCatalog(
  rows: Array<{ id: string; kind?: Capability; spec: Partial<ModelSpec>; enabled: boolean; isDefault: boolean }>,
): ModelSpec[] {
  const byId = new Map(BUILT_IN_MODELS.map((m) => [m.id, { ...m }]));
  const order = BUILT_IN_MODELS.map((m) => m.id);
  const defaultsTouched = new Set<Capability>();
  for (const row of rows) {
    const base = byId.get(row.id);
    const spec: ModelSpec = base
      ? { ...base, ...row.spec, id: row.id, kind: base.kind, enabled: row.enabled }
      : ({ ...row.spec, id: row.id, kind: row.kind ?? row.spec.kind, enabled: row.enabled, custom: true } as ModelSpec);
    if (!spec.kind || !spec.provider || !spec.label) continue; // malformed custom row
    if (row.isDefault) {
      defaultsTouched.add(spec.kind);
      spec.default = true;
    } else if (base && row.spec.default === undefined) {
      // keep built-in default unless another row claims it
    }
    if (!base) order.push(row.id);
    byId.set(row.id, spec);
  }
  // One default per kind: an admin choice wins over the built-in flag.
  for (const kind of defaultsTouched) {
    for (const spec of byId.values()) {
      if (spec.kind === kind && !rows.some((r) => r.id === spec.id && r.isDefault)) spec.default = false;
    }
  }
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

