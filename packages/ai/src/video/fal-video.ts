import { createFalClient, type FalClient } from "@fal-ai/client";
import type { AspectRatio, GenerationResult, MediaRef, Usage, VideoJob, VideoProvider, VideoRequest } from "../types";
import { defaultModel, getModel } from "../models";
import { kenBurnsMp4 } from "./ffmpeg";

/**
 * fal.ai video adapter (image-to-video / text-to-video) behind the `VideoProvider` interface.
 *
 * Offline mode: when `FAL_KEY` is unset, `generate()` returns a 5 s Ken Burns clip made
 * with ffmpeg from the start image (or a flat brand-coloured frame), so the whole video
 * pipeline runs end to end without any keys.
 */
export const isFalVideoConfigured = Boolean(process.env.FAL_KEY);

/** Output pixel size per ratio (1080p class). */
export const VIDEO_RATIO_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1.91:1": { width: 1920, height: 1005 },
};

export const OFFLINE_CLIP_SECONDS = 5;

export type GeneratedVideo = MediaRef & {
  /** Raw bytes when the clip was produced locally (offline placeholder). */
  bytes?: Buffer;
};

export interface FalVideoRequest extends VideoRequest {
  image?: MediaRef & { bytes?: Buffer | Uint8Array };
  endImage?: MediaRef & { bytes?: Buffer | Uint8Array };
}

let client: FalClient | null = null;
function fal(): FalClient {
  if (!client) client = createFalClient({ credentials: process.env.FAL_KEY });
  return client;
}

async function fetchBytes(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Turn a start/end frame into a URL fal can read, uploading private bytes to fal storage. */
async function resolveImageUrl(ref: MediaRef & { bytes?: Buffer | Uint8Array }): Promise<string> {
  if (/^https?:\/\//.test(ref.url) && !ref.bytes) return ref.url;
  const bytes = ref.bytes ?? (await fetchBytes(ref.url));
  return fal().storage.upload(new Blob([new Uint8Array(bytes)], { type: ref.mimeType ?? "image/png" }));
}

/** Snap a requested duration onto what the model supports. */
export function supportedDuration(modelId: string, wanted: number): number {
  const spec = getModel(modelId)?.video;
  const options = spec?.durationsSec?.length ? spec.durationsSec : [5];
  return options.reduce((best, d) => (Math.abs(d - wanted) < Math.abs(best - wanted) ? d : best), options[0]!);
}

/**
 * Build the endpoint-specific input for a request from the model spec's preset.
 * `spec.options` is merged last so an admin can add or override fields per model.
 */
export function buildFalVideoInput(modelId: string, req: FalVideoRequest, imageUrl?: string, endImageUrl?: string): Record<string, unknown> {
  const spec = getModel(modelId);
  const duration = supportedDuration(modelId, req.durationSec);
  const wantsAudio = req.audio ?? Boolean(spec?.video?.audio);
  const preset = spec?.preset ?? "fal-generic";
  let input: Record<string, unknown>;
  if (preset === "kling") {
    input = {
      prompt: req.prompt,
      duration: String(duration),
      generate_audio: wantsAudio,
      ...(imageUrl ? { start_image_url: imageUrl } : { aspect_ratio: req.ratio === "4:5" ? "9:16" : req.ratio }),
      ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
    };
  } else if (preset === "veo") {
    input = {
      prompt: req.prompt,
      duration: `${duration}s`,
      aspect_ratio: req.ratio === "9:16" || req.ratio === "4:5" ? "9:16" : "16:9",
      resolution: "1080p",
      generate_audio: wantsAudio,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    };
  } else if (preset === "seedance") {
    // Seedance 2.x: duration is a whole number of seconds (4–15); image-to-video derives
    // the aspect ratio from the start frame ("auto").
    const seedanceRatio = req.ratio === "4:5" ? "3:4" : req.ratio === "1.91:1" ? "16:9" : req.ratio;
    input = {
      prompt: req.prompt,
      duration: String(Math.min(15, Math.max(4, Math.round(duration)))),
      aspect_ratio: imageUrl ? "auto" : seedanceRatio,
      resolution: "1080p",
      generate_audio: wantsAudio,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    };
  } else {
    input = {
      prompt: req.prompt,
      duration: String(duration),
      aspect_ratio: req.ratio === "1.91:1" ? "16:9" : req.ratio,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
      ...(req.seed !== undefined && !spec?.noSeed ? { seed: req.seed } : {}),
    };
  }
  if (spec?.maxPromptChars && typeof input.prompt === "string" && input.prompt.length > spec.maxPromptChars) input.prompt = input.prompt.slice(0, spec.maxPromptChars);
  return { ...input, ...(spec?.options ?? {}) };
}

function endpointFor(modelId: string, imageToVideo: boolean) {
  const e = getModel(modelId)?.endpoints;
  const endpoint = imageToVideo ? e?.imageToVideo ?? e?.textToVideo : e?.textToVideo ?? e?.imageToVideo;
  if (!endpoint) throw new Error(`No fal endpoint configured for video model "${modelId}"`);
  return endpoint;
}

function usageFor(modelId: string, seconds: number, startedAt: number, offline: boolean): Usage {
  return {
    provider: "fal",
    model: modelId,
    durationMs: Date.now() - startedAt,
    costUsd: offline ? 0 : (getModel(modelId)?.approxCostUsd ?? 0) * seconds,
    units: seconds,
  };
}

/** Job ids carry the endpoint so `status()` can be called without extra state. */
function encodeJobId(endpoint: string, requestId: string) {
  return `${endpoint}::${requestId}`;
}
function decodeJobId(jobId: string) {
  const i = jobId.lastIndexOf("::");
  if (i < 0) throw new Error(`Malformed fal job id: ${jobId}`);
  return { endpoint: jobId.slice(0, i), requestId: jobId.slice(i + 2) };
}

function extractVideo(data: unknown): { url: string; mimeType?: string } {
  const d = data as { video?: { url?: string; content_type?: string }; videos?: Array<{ url?: string; content_type?: string }> };
  const v = d?.video ?? d?.videos?.[0];
  if (!v?.url) throw new Error("fal returned no video url");
  return { url: v.url, mimeType: v.content_type ?? "video/mp4" };
}

/** Offline placeholder: Ken Burns zoom over the start image (or a flat frame). */
export async function placeholderVideo(req: FalVideoRequest): Promise<GeneratedVideo> {
  const size = VIDEO_RATIO_SIZES[req.ratio] ?? VIDEO_RATIO_SIZES["9:16"];
  const durationSec = req.durationSec > 0 ? Math.min(req.durationSec, 10) : OFFLINE_CLIP_SECONDS;
  let image: Buffer;
  if (req.image) {
    image = req.image.bytes ? Buffer.from(req.image.bytes) : await fetchBytes(req.image.url);
  } else {
    const sharp = (await import("sharp")).default;
    image = await sharp({ create: { width: size.width, height: size.height, channels: 3, background: "#242521" } }).png().toBuffer();
  }
  const bytes = await kenBurnsMp4(image, { ...size, durationSec });
  return {
    url: `data:video/mp4;base64,${bytes.toString("base64")}`,
    mimeType: "video/mp4",
    width: size.width,
    height: size.height,
    durationSec,
    bytes,
  };
}

/** Kick off a generation on fal's queue. */
export async function submitVideo(req: FalVideoRequest): Promise<VideoJob> {
  const modelId = req.model || defaultModel("video").id;
  if (!isFalVideoConfigured) throw new Error("fal is not configured (FAL_KEY); use generateVideo() for the offline placeholder");
  const imageUrl = req.image ? await resolveImageUrl(req.image) : undefined;
  const endImageUrl = req.endImage ? await resolveImageUrl(req.endImage) : undefined;
  const endpoint = endpointFor(modelId, Boolean(imageUrl));
  const input = buildFalVideoInput(modelId, req, imageUrl, endImageUrl);
  const queued = await fal().queue.submit(endpoint, { input });
  return { id: encodeJobId(endpoint, queued.request_id), status: "queued" };
}

export async function videoStatus(jobId: string): Promise<VideoJob> {
  const { endpoint, requestId } = decodeJobId(jobId);
  const st = await fal().queue.status(endpoint, { requestId, logs: false });
  if (st.status === "IN_QUEUE") return { id: jobId, status: "queued" };
  if (st.status === "IN_PROGRESS") return { id: jobId, status: "running" };
  try {
    const res = await fal().queue.result(endpoint, { requestId });
    const v = extractVideo(res.data);
    return { id: jobId, status: "succeeded", output: { url: v.url, mimeType: v.mimeType } };
  } catch (err) {
    return { id: jobId, status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate one clip: submit + poll until done (or the offline placeholder).
 * `durationSec` is snapped to what the model supports.
 */
export async function generateVideo(
  req: FalVideoRequest,
  opts: { pollMs?: number; timeoutMs?: number; onStatus?: (job: VideoJob) => void } = {},
): Promise<GenerationResult<GeneratedVideo>> {
  const startedAt = Date.now();
  const modelId = req.model || defaultModel("video").id;

  if (!isFalVideoConfigured) {
    const output = await placeholderVideo({ ...req, model: modelId });
    return { output, usage: usageFor(modelId, output.durationSec ?? OFFLINE_CLIP_SECONDS, startedAt, true) };
  }

  const seconds = supportedDuration(modelId, req.durationSec);
  let job = await submitVideo({ ...req, model: modelId });
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  const pollMs = opts.pollMs ?? 4000;
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() > deadline) throw new Error(`fal video job ${job.id} timed out`);
    await new Promise((r) => setTimeout(r, pollMs));
    job = await videoStatus(job.id);
    opts.onStatus?.(job);
  }
  if (job.status === "failed" || !job.output) throw new Error(job.error ?? "fal video generation failed");

  const size = VIDEO_RATIO_SIZES[req.ratio] ?? VIDEO_RATIO_SIZES["9:16"];
  const output: GeneratedVideo = { ...job.output, mimeType: job.output.mimeType ?? "video/mp4", width: size.width, height: size.height, durationSec: seconds };
  return { output, usage: usageFor(modelId, seconds, startedAt, false) };
}

/** Download a generated clip's bytes (fal-hosted or data URL) for storing in R2. */
export async function downloadVideo(ref: GeneratedVideo): Promise<Buffer> {
  return ref.bytes ?? fetchBytes(ref.url);
}

/** `VideoProvider` implementation over the functions above. */
export class FalVideoProvider implements VideoProvider {
  readonly name = "fal" as const;
  readonly capability = "video" as const;

  submit(req: VideoRequest): Promise<VideoJob> {
    return submitVideo(req);
  }
  status(jobId: string): Promise<VideoJob> {
    return videoStatus(jobId);
  }
  generate(req: VideoRequest): Promise<GenerationResult<MediaRef>> {
    return generateVideo(req);
  }
}
