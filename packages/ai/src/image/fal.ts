import { createFalClient, type FalClient } from "@fal-ai/client";
import type { AspectRatio, GenerationResult, ImageProvider, ImageRequest, MediaRef, Usage } from "../types";
import { defaultModel, getModel } from "../models";

/**
 * fal.ai image adapter: background removal + text/reference-to-image.
 *
 * When `FAL_KEY` is unset the adapter runs in offline mode so product and studio
 * flows keep working locally: `removeBackground` returns the original image and
 * `generateImage` returns a gradient placeholder PNG rendered with sharp.
 */
export const isFalConfigured = Boolean(process.env.FAL_KEY);

import { falImageInput } from "./fal-input";

/** Background removal. `fal-ai/bria/background/remove` is the licensed alternative. */
export const FAL_BACKGROUND_REMOVAL_ENDPOINT = "fal-ai/birefnet/v2";
export const BACKGROUND_REMOVAL_MODEL = "birefnet";

/** Approximate USD per image. TODO: replace with measured costs from generation_events. */

/** Output pixel size per ratio (1K class). */
export const RATIO_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 1024, height: 1280 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1.91:1": { width: 1200, height: 628 },
};

export type GeneratedImage = MediaRef & {
  /** Raw bytes when the image was produced locally (offline placeholder) or downloaded. */
  bytes?: Buffer;
};

export type ReferenceImage = MediaRef & {
  /** Bytes for references that live in private storage (fal must be able to read the URL). */
  bytes?: Buffer | Uint8Array;
};

export interface FalImageRequest extends ImageRequest {
  references?: ReferenceImage[];
}

export type RemoveBackgroundResult = {
  png: Buffer;
  width?: number;
  height?: number;
  usage: Usage;
  /** False when fal is not configured and the original was returned unchanged. */
  removed: boolean;
};

let client: FalClient | null = null;
function fal(): FalClient {
  if (!client) client = createFalClient({ credentials: process.env.FAL_KEY });
  return client;
}

async function loadSharp() {
  // Lazy so importing @adcraft/ai never pulls the native binary into a client bundle.
  const mod = await import("sharp");
  return mod.default;
}

async function fetchBytes(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return Buffer.from(url.slice(comma + 1), "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function toBlob(bytes: Buffer | Uint8Array, type = "image/png") {
  return new Blob([new Uint8Array(bytes)], { type });
}

/** Turn a reference into a URL fal can read, uploading private bytes to fal storage. */
async function resolveReferenceUrl(ref: ReferenceImage): Promise<string> {
  if (/^https?:\/\//.test(ref.url) && !ref.bytes) return ref.url;
  const bytes = ref.bytes ?? (await fetchBytes(ref.url));
  return fal().storage.upload(toBlob(bytes, ref.mimeType ?? "image/png"));
}

// ---------- Background removal ----------

/**
 * Remove the background from a product photo. Returns a PNG with alpha.
 * Accepts a public URL, data URL or raw bytes.
 */
export async function removeBackground(input: string | Buffer | Uint8Array): Promise<RemoveBackgroundResult> {
  const startedAt = Date.now();
  const bytes = typeof input === "string" ? await fetchBytes(input) : Buffer.from(input);

  if (!isFalConfigured) {
    const sharp = await loadSharp();
    const img = sharp(bytes).rotate().png();
    const png = await img.toBuffer();
    const meta = await sharp(png).metadata();
    return {
      png,
      width: meta.width,
      height: meta.height,
      removed: false,
      usage: { provider: "fal", model: BACKGROUND_REMOVAL_MODEL, durationMs: Date.now() - startedAt, costUsd: 0, credits: 0, units: 1 },
    };
  }

  const result = await fal().subscribe(FAL_BACKGROUND_REMOVAL_ENDPOINT, {
    input: {
      image_url: typeof input === "string" && /^https?:\/\//.test(input) ? input : toBlob(bytes, "image/png"),
      model: "General Use (Heavy)",
      operating_resolution: "2048x2048",
      output_format: "png",
      refine_foreground: true,
    },
  });
  const out = result.data.image;
  const png = await fetchBytes(out.url);
  return {
    png,
    width: out.width,
    height: out.height,
    removed: true,
    usage: {
      provider: "fal",
      model: BACKGROUND_REMOVAL_MODEL,
      durationMs: Date.now() - startedAt,
      costUsd: 0.01, // birefnet, approximate
      credits: 0,
      units: 1,
    },
  };
}

// ---------- Generation ----------

function ratioSize(req: ImageRequest) {
  const base = RATIO_SIZES[req.ratio] ?? RATIO_SIZES["1:1"];
  return { width: req.width ?? base.width, height: req.height ?? base.height };
}

/** Nano Banana Pro takes named ratios; 1.91:1 has no exact match. */
function nanoBananaRatio(ratio: AspectRatio): "1:1" | "4:5" | "9:16" | "16:9" {
  return ratio === "1.91:1" ? "16:9" : ratio;
}

/** Deterministic pastel gradient so placeholders differ per prompt/seed. */
function placeholderPalette(seedText: string) {
  let h = 0;
  for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  return { from: `hsl(${hue} 55% 82%)`, via: `hsl(${hue2} 60% 62%)`, to: `hsl(${(hue2 + 30) % 360} 45% 38%)` };
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}

/** Offline placeholder: a gradient PNG at the requested size with the prompt as a caption. */
export async function placeholderImage(req: ImageRequest, index = 0): Promise<GeneratedImage> {
  const sharp = await loadSharp();
  const { width, height } = ratioSize(req);
  const pal = placeholderPalette(`${req.prompt}:${req.seed ?? 0}:${index}`);
  const caption = escapeXml(req.prompt.slice(0, 60));
  const fontSize = Math.round(Math.min(width, height) / 22);
  const svg = (withText: boolean) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${pal.from}"/>
          <stop offset="55%" stop-color="${pal.via}"/>
          <stop offset="100%" stop-color="${pal.to}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      ${
        withText
          ? `<text x="${Math.round(width * 0.06)}" y="${height - Math.round(height * 0.08)}" font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="${fontSize}" fill="#ffffff" fill-opacity="0.92">${caption}</text>`
          : ""
      }
    </svg>`;
  let bytes: Buffer;
  try {
    bytes = await sharp(Buffer.from(svg(false))).png().toBuffer();
  } catch {
    bytes = await sharp(Buffer.from(svg(false))).png().toBuffer();
  }
  return {
    url: `data:image/png;base64,${bytes.toString("base64")}`,
    mimeType: "image/png",
    width,
    height,
    bytes,
  };
}

/** fal validation errors carry the offending field in `body.detail`; surface it. */
export function describeFalError(modelId: string, endpoint: string, err: unknown): string {
  const e = err as { status?: number; message?: string; body?: { detail?: unknown } };
  const detail = e?.body?.detail;
  const fields = Array.isArray(detail)
    ? detail.map((d) => (d && typeof d === "object" && "msg" in d ? `${(d as { loc?: unknown[] }).loc?.slice(-1)[0] ?? ""}: ${(d as { msg: string }).msg}` : String(d))).join("; ")
    : typeof detail === "string"
      ? detail
      : "";
  return `${modelId} (${endpoint}) rejected the request${e?.status ? ` (${e.status})` : ""}${fields ? `: ${fields}` : e?.message ? `: ${e.message}` : ""}`;
}

/**
 * Generate images with the selected model. References (product cutout, style
 * images) route to the model's edit endpoint so the product is preserved.
 */
export async function generateImage(req: FalImageRequest): Promise<GenerationResult<GeneratedImage[]>> {
  const startedAt = Date.now();
  const modelId = req.model || defaultModel("image").id;
  const count = Math.max(1, Math.min(req.count ?? 1, 4));

  if (!isFalConfigured) {
    const output = await Promise.all(Array.from({ length: count }, (_, i) => placeholderImage(req, i)));
    return {
      output,
      usage: { provider: "fal", model: modelId, durationMs: Date.now() - startedAt, costUsd: 0, credits: 0, units: count },
    };
  }

  const spec = getModel(modelId);
  if (!spec || spec.kind !== "image" || spec.provider !== "fal") throw new Error(`"${modelId}" is not a fal image model`);
  const refs = await Promise.all((req.references ?? []).map(resolveReferenceUrl));
  const hasRefs = refs.length > 0;
  const { width, height } = ratioSize(req);
  const prompt = req.negativePrompt ? `${req.prompt}\n\nAvoid: ${req.negativePrompt}` : req.prompt;

  let images: Array<{ url: string; width?: number; height?: number; content_type?: string }> = [];

  const plan = falImageInput(spec, { prompt, ratio: req.ratio, width, height, count, seed: req.seed }, refs);
  for (let i = 0; i < plan.calls; i++) {
    const input = { ...plan.input, ...(plan.calls > 1 && req.seed !== undefined ? { seed: req.seed + i } : {}) };
    // New provider endpoints may precede the SDK's generated endpoint union.
    const res = await fal().subscribe(plan.endpoint, { input }).catch((err: unknown) => {
      throw new Error(describeFalError(spec.id, plan.endpoint, err));
    });
    const data = res.data as { images?: Array<{ url: string; width?: number; height?: number; content_type?: string }> };
    if (!data.images?.length || data.images.some((im) => !im.url)) throw new Error(`Image model "${modelId}" returned no usable image`);
    images.push(...data.images);
  }

  const output: GeneratedImage[] = images.map((im) => ({
    url: im.url,
    mimeType: im.content_type ?? "image/png",
    width: im.width ?? width,
    height: im.height ?? height,
  }));
  return {
    output,
    usage: {
      provider: "fal",
      model: modelId,
      durationMs: Date.now() - startedAt,
      costUsd: spec.approxCostUsd === undefined ? undefined : spec.approxCostUsd * output.length,
      units: output.length,
    },
  };
}

/** Download a generated image's bytes (fal-hosted or data URL) for storing in R2. */
export async function downloadImage(ref: GeneratedImage): Promise<Buffer> {
  return ref.bytes ?? fetchBytes(ref.url);
}

/** `ImageProvider` implementation over the functions above, for the studio's provider registry. */
export class FalImageProvider implements ImageProvider {
  readonly name = "fal" as const;
  readonly capability = "image" as const;

  generate(req: ImageRequest): Promise<GenerationResult<MediaRef[]>> {
    return generateImage(req);
  }

  async removeBackground(image: MediaRef): Promise<GenerationResult<MediaRef>> {
    const r = await removeBackground(image.url);
    return {
      output: { url: `data:image/png;base64,${r.png.toString("base64")}`, mimeType: "image/png", width: r.width, height: r.height },
      usage: r.usage,
    };
  }
}
