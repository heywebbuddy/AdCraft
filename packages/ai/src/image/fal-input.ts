import type { AspectRatio } from "../types";

/** Verified against fal's endpoint schemas; keep model-specific parameters here. */
export const FAL_IMAGE_ENDPOINTS: Record<string, { text: string; edit: string }> = {
  "nano-banana-pro": { text: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit" },
  "nano-banana-2": { text: "fal-ai/nano-banana-2", edit: "fal-ai/nano-banana-2/edit" },
  "seedream-4.5": { text: "fal-ai/bytedance/seedream/v4.5/text-to-image", edit: "fal-ai/bytedance/seedream/v4.5/edit" },
  "seedream-5-lite": { text: "fal-ai/bytedance/seedream/v5/lite/text-to-image", edit: "fal-ai/bytedance/seedream/v5/lite/edit" },
  "gpt-image-2": { text: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit" },
  "qwen-image-2-pro": { text: "fal-ai/qwen-image-2/pro/text-to-image", edit: "fal-ai/qwen-image-2/pro/edit" },
  "flux-2-dev": { text: "fal-ai/flux-2", edit: "fal-ai/flux-2/edit" },
  "flux-2-max": { text: "fal-ai/flux-2-max", edit: "fal-ai/flux-2-max/edit" },
};

export function falImageInput(req: { model: string; prompt: string; ratio: AspectRatio; width: number; height: number; count: number; seed?: number }, refs: string[]) {
  const endpoint = FAL_IMAGE_ENDPOINTS[req.model];
  if (!endpoint) throw new Error(`Unsupported fal image model: ${req.model}`);
  const input: Record<string, unknown> = { prompt: req.prompt, ...(refs.length ? { image_urls: refs } : {}) };
  if (req.model.startsWith("nano-banana")) {
    Object.assign(input, { aspect_ratio: req.ratio === "1.91:1" ? "16:9" : req.ratio, resolution: "1K", num_images: req.count, output_format: "png" });
  } else {
    // GPT Image 2 requires multiples of 16. Seedream's minimum total area is 1440p.
    const scale = req.model.startsWith("seedream") ? Math.max(1, Math.sqrt(3686400 / (req.width * req.height))) : 1;
    Object.assign(input, { image_size: { width: Math.round(req.width * scale / 16) * 16, height: Math.round(req.height * scale / 16) * 16 } });
    if (req.model.startsWith("seedream")) Object.assign(input, { num_images: req.count, max_images: 1 });
    else if (req.model === "gpt-image-2") Object.assign(input, { num_images: req.count, quality: "high", output_format: "png" });
    else Object.assign(input, { ...(req.model === "flux-2-max" ? {} : { num_images: req.count }), output_format: "png" });
  }
  if (req.seed !== undefined && req.model !== "gpt-image-2" && req.model !== "seedream-5-lite") input.seed = req.seed;
  return { endpoint: refs.length ? endpoint.edit : endpoint.text, input, calls: req.model === "flux-2-max" ? req.count : 1 };
}
