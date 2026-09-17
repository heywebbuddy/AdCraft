import type { AspectRatio, GenerationResult, MediaRef, VideoJob } from "./types";
import { getModel, type ModelSpec } from "./models";
import type { FalImageRequest, GeneratedImage } from "./image/fal";
import type { FalVideoRequest, GeneratedVideo } from "./video/fal-video";
import { RATIO_SIZES } from "./image/fal";
import { VIDEO_RATIO_SIZES, supportedDuration } from "./video/fal-video";

/**
 * Replicate adapter (images and video) behind the same request/result shapes as fal.
 *
 * A model spec's `endpoints.text` (images) or `endpoints.textToVideo` / `imageToVideo`
 * (video) is the Replicate model ref: `owner/name` for the latest version or
 * `owner/name:version`. Input follows the `replicate-generic` preset — the fields most
 * Replicate image/video models share — with `spec.options` merged over it.
 *
 * Private reference images are uploaded through the Files API (Replicate cannot fetch
 * localhost URLs); public https URLs pass through untouched.
 */
export const isReplicateConfigured = () => Boolean(process.env.REPLICATE_API_TOKEN?.trim());

const API = "https://api.replicate.com/v1";

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN?.trim();
  if (!t) throw new Error("Replicate is not connected. Add REPLICATE_API_TOKEN on the server.");
  return t;
}

type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  metrics?: { predict_time?: number };
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    let detail = body;
    try {
      const j = JSON.parse(body) as { detail?: string; title?: string };
      detail = j.detail ?? j.title ?? body;
    } catch {
      /* plain text */
    }
    throw new Error(`Replicate request failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

/** Upload private bytes so the model can read them; returns the file's URL. */
export async function uploadReplicateFile(bytes: Buffer | Uint8Array, mimeType = "image/png"): Promise<string> {
  const form = new FormData();
  form.set("content", new Blob([new Uint8Array(bytes)], { type: mimeType }), `reference.${mimeType.split("/")[1] ?? "png"}`);
  const res = await fetch(`${API}/files`, { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: form, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Replicate file upload failed (${res.status})`);
  const data = (await res.json()) as { urls?: { get?: string } };
  if (!data.urls?.get) throw new Error("Replicate returned no file url");
  return data.urls.get;
}

async function resolveRef(ref: { url: string; bytes?: Buffer | Uint8Array; mimeType?: string }): Promise<string> {
  if (/^https?:\/\//.test(ref.url) && !/localhost|127\.0\.0\.1/.test(ref.url) && !ref.bytes) return ref.url;
  const bytes = ref.bytes ?? Buffer.from(await (await fetch(ref.url)).arrayBuffer());
  return uploadReplicateFile(bytes, ref.mimeType ?? "image/png");
}

/** `owner/name[:version]` → prediction endpoint + body shape. */
function target(ref: string): { path: string; body: Record<string, unknown> } {
  const [model, version] = ref.split(":");
  if (version) return { path: "/predictions", body: { version } };
  if (!/^[\w.-]+\/[\w.-]+$/.test(model ?? "")) throw new Error(`"${ref}" is not a Replicate model ref (owner/name or owner/name:version)`);
  return { path: `/models/${model}/predictions`, body: {} };
}

async function createPrediction(ref: string, input: Record<string, unknown>, wait: boolean): Promise<Prediction> {
  const t = target(ref);
  return api<Prediction>(t.path, {
    method: "POST",
    headers: wait ? { Prefer: "wait=60" } : {},
    body: JSON.stringify({ ...t.body, input }),
    signal: AbortSignal.timeout(wait ? 90_000 : 30_000),
  });
}

async function waitFor(p: Prediction, opts: { pollMs?: number; timeoutMs?: number } = {}): Promise<Prediction> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  let cur = p;
  while (cur.status === "starting" || cur.status === "processing") {
    if (Date.now() > deadline) throw new Error(`Replicate prediction ${cur.id} timed out`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 3000));
    cur = await api<Prediction>(`/predictions/${cur.id}`);
  }
  return cur;
}

/** Replicate outputs are a url, a list of urls, or an object with a url-ish field. */
function outputUrls(output: unknown): string[] {
  if (!output) return [];
  if (typeof output === "string") return [output];
  if (Array.isArray(output)) return output.flatMap(outputUrls);
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const k of ["url", "video", "image", "output"]) if (o[k]) return outputUrls(o[k]);
  }
  return [];
}

const aspect = (ratio: AspectRatio) => (ratio === "1.91:1" ? "16:9" : ratio);

// ---------- Images ----------

export function replicateImageInput(spec: ModelSpec, req: { prompt: string; ratio: AspectRatio; count: number; seed?: number }, refs: string[]): Record<string, unknown> {
  const size = RATIO_SIZES[req.ratio];
  const input: Record<string, unknown> = {
    prompt: spec.maxPromptChars && req.prompt.length > spec.maxPromptChars ? req.prompt.slice(0, spec.maxPromptChars) : req.prompt,
    aspect_ratio: aspect(req.ratio),
    width: size.width,
    height: size.height,
    num_outputs: req.count,
    output_format: "png",
    ...(refs.length ? { image_input: refs } : {}),
    ...(req.seed !== undefined && !spec.noSeed ? { seed: req.seed } : {}),
  };
  return { ...input, ...(spec.options ?? {}) };
}

export async function generateReplicateImage(req: FalImageRequest): Promise<GenerationResult<GeneratedImage[]>> {
  const spec = getModel(req.model);
  if (!spec || spec.kind !== "image" || spec.provider !== "replicate") throw new Error(`"${req.model}" is not a Replicate image model`);
  const ref = spec.endpoints?.text;
  if (!ref) throw new Error(`Image model "${spec.id}" has no Replicate model ref configured`);
  const started = Date.now();
  const count = Math.max(1, Math.min(req.count ?? 1, 4));
  const refs = spec.endpoints?.edit === "none" ? [] : await Promise.all((req.references ?? []).map(resolveRef));
  const prompt = req.negativePrompt ? `${req.prompt}\n\nAvoid: ${req.negativePrompt}` : req.prompt;
  const input = replicateImageInput(spec, { prompt, ratio: req.ratio, count, seed: req.seed }, refs);
  const done = await waitFor(await createPrediction(ref, input, true));
  if (done.status !== "succeeded") throw new Error(`${spec.label} failed: ${done.error ?? done.status}`);
  const urls = outputUrls(done.output);
  if (!urls.length) throw new Error(`${spec.label} returned no image`);
  const size = RATIO_SIZES[req.ratio];
  return {
    output: urls.slice(0, count).map((url) => ({ url, mimeType: "image/png", width: size.width, height: size.height })),
    usage: { provider: "replicate", model: spec.id, durationMs: Date.now() - started, costUsd: spec.approxCostUsd === undefined ? undefined : spec.approxCostUsd * urls.length, units: urls.length },
  };
}

// ---------- Video ----------

export function replicateVideoInput(spec: ModelSpec, req: FalVideoRequest, imageUrl?: string, endImageUrl?: string): Record<string, unknown> {
  const duration = supportedDuration(spec.id, req.durationSec);
  const input: Record<string, unknown> = {
    prompt: spec.maxPromptChars && req.prompt.length > spec.maxPromptChars ? req.prompt.slice(0, spec.maxPromptChars) : req.prompt,
    aspect_ratio: aspect(req.ratio),
    duration,
    ...(imageUrl ? { image: imageUrl, start_image: imageUrl } : {}),
    ...(endImageUrl ? { end_image: endImageUrl } : {}),
    ...(req.seed !== undefined && !spec.noSeed ? { seed: req.seed } : {}),
  };
  return { ...input, ...(spec.options ?? {}) };
}

export async function submitReplicateVideo(req: FalVideoRequest): Promise<VideoJob> {
  const spec = getModel(req.model);
  if (!spec || spec.kind !== "video" || spec.provider !== "replicate") throw new Error(`"${req.model}" is not a Replicate video model`);
  const imageUrl = req.image ? await resolveRef(req.image) : undefined;
  const endImageUrl = req.endImage ? await resolveRef(req.endImage) : undefined;
  const ref = (imageUrl ? spec.endpoints?.imageToVideo ?? spec.endpoints?.textToVideo : spec.endpoints?.textToVideo ?? spec.endpoints?.imageToVideo) ?? "";
  if (!ref) throw new Error(`Video model "${spec.id}" has no Replicate model ref configured`);
  const p = await createPrediction(ref, replicateVideoInput(spec, req, imageUrl, endImageUrl), false);
  return { id: `replicate::${p.id}`, status: "queued" };
}

export async function replicateVideoStatus(jobId: string): Promise<VideoJob> {
  const id = jobId.replace(/^replicate::/, "");
  const p = await api<Prediction>(`/predictions/${id}`);
  if (p.status === "starting") return { id: jobId, status: "queued" };
  if (p.status === "processing") return { id: jobId, status: "running" };
  if (p.status === "succeeded") {
    const url = outputUrls(p.output)[0];
    return url ? { id: jobId, status: "succeeded", output: { url, mimeType: "video/mp4" } } : { id: jobId, status: "failed", error: "Replicate returned no video" };
  }
  return { id: jobId, status: "failed", error: p.error ?? p.status };
}

export async function generateReplicateVideo(req: FalVideoRequest, opts: { pollMs?: number; timeoutMs?: number; onStatus?: (job: VideoJob) => void } = {}): Promise<GenerationResult<GeneratedVideo>> {
  const started = Date.now();
  const spec = getModel(req.model);
  if (!spec) throw new Error(`Unknown video model "${req.model}"`);
  const seconds = supportedDuration(spec.id, req.durationSec);
  let job = await submitReplicateVideo(req);
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() > deadline) throw new Error(`Replicate video job ${job.id} timed out`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 4000));
    job = await replicateVideoStatus(job.id);
    opts.onStatus?.(job);
  }
  if (job.status === "failed" || !job.output) throw new Error(job.error ?? "Replicate video generation failed");
  const size = VIDEO_RATIO_SIZES[req.ratio] ?? VIDEO_RATIO_SIZES["9:16"];
  const output: GeneratedVideo = { ...(job.output as MediaRef), mimeType: job.output.mimeType ?? "video/mp4", width: size.width, height: size.height, durationSec: seconds };
  return { output, usage: { provider: "replicate", model: spec.id, durationMs: Date.now() - started, costUsd: (spec.approxCostUsd ?? 0) * seconds || undefined, units: seconds } };
}
