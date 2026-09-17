import type { AspectRatio } from "../types";
import type { ModelSpec } from "../models";

/**
 * Shape a fal image request from the model's spec. The *preset* decides which fields the
 * endpoint family expects; `spec.options` is merged last so an admin can add or override
 * any field for a specific model without code.
 */
export type FalImagePlan = { endpoint: string; input: Record<string, unknown>; calls: number };

const roundTo16 = (n: number) => Math.round(n / 16) * 16;

/** Cut a prompt to `max` characters at the last sentence end (or word) that fits. */
export function trimPrompt(prompt: string, max?: number): string {
  if (!max || prompt.length <= max) return prompt;
  const head = prompt.slice(0, max);
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentence > max * 0.5) return head.slice(0, sentence + 1);
  const word = head.lastIndexOf(" ");
  return (word > max * 0.5 ? head.slice(0, word) : head).trim();
}

export function falImageInput(
  spec: ModelSpec,
  req: { prompt: string; ratio: AspectRatio; width: number; height: number; count: number; seed?: number },
  refs: string[],
): FalImagePlan {
  // References only go to an edit endpoint; a model without one is prompt-only, so the
  // references are dropped rather than sent to an endpoint that would reject them.
  const canEdit = Boolean(spec.endpoints?.edit);
  const useRefs = refs.length > 0 && canEdit;
  const endpoint = useRefs ? spec.endpoints!.edit! : spec.endpoints?.text;
  if (!endpoint) throw new Error(`Image model "${spec.id}" has no fal endpoint configured`);
  const preset = spec.preset ?? "fal-generic";
  const input: Record<string, unknown> = { prompt: trimPrompt(req.prompt, spec.maxPromptChars), ...(useRefs ? { image_urls: refs } : {}) };

  switch (preset) {
    case "nano-banana":
      Object.assign(input, { aspect_ratio: req.ratio === "1.91:1" ? "16:9" : req.ratio, resolution: "1K", num_images: req.count, output_format: "png" });
      break;
    case "seedream": {
      // Seedream's minimum total area is 1440p-class; scale up while keeping the ratio.
      const scale = Math.max(1, Math.sqrt(3686400 / (req.width * req.height)));
      Object.assign(input, { image_size: { width: roundTo16(req.width * scale), height: roundTo16(req.height * scale) }, num_images: req.count, max_images: 1 });
      break;
    }
    case "gpt-image":
      // GPT Image requires multiples of 16.
      Object.assign(input, { image_size: { width: roundTo16(req.width), height: roundTo16(req.height) }, num_images: req.count, quality: "high", output_format: "png" });
      break;
    case "qwen":
      Object.assign(input, { image_size: { width: roundTo16(req.width), height: roundTo16(req.height) }, num_images: req.count, output_format: "png" });
      break;
    case "flux":
      Object.assign(input, { image_size: { width: req.width, height: req.height }, output_format: "png", ...(spec.maxImagesPerCall === 1 ? {} : { num_images: req.count }) });
      break;
    default:
      Object.assign(input, { image_size: { width: req.width, height: req.height }, num_images: req.count, output_format: "png" });
  }
  if (req.seed !== undefined && !spec.noSeed) input.seed = req.seed;
  Object.assign(input, spec.options ?? {});
  const perCall = spec.maxImagesPerCall ?? req.count;
  return { endpoint, input, calls: Math.max(1, Math.ceil(req.count / Math.max(1, perCall))) };
}
