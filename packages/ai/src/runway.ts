import type { AspectRatio, GenerationResult, VideoJob } from "./types";
import { getModel, type ModelSpec } from "./models";
import type { FalImageRequest, GeneratedImage } from "./image/fal";
import type { FalVideoRequest, GeneratedVideo } from "./video/fal-video";
import { RATIO_SIZES } from "./image/fal";
import { VIDEO_RATIO_SIZES, supportedDuration } from "./video/fal-video";

/**
 * Runway adapter (Gen-4 image and video) behind the same request/result shapes as fal.
 *
 * Spec routing: `endpoints.text` is the Runway image model (e.g. `gen4_image`),
 * `endpoints.imageToVideo` / `textToVideo` the video models (e.g. `gen4_turbo`). Runway's
 * API is task-based: create a task, poll `/v1/tasks/{id}` until SUCCEEDED. Private reference
 * and start-frame bytes are sent as data URIs, which the API accepts directly.
 */
export const isRunwayConfigured = () => Boolean(process.env.RUNWAYML_API_SECRET?.trim());

const API = process.env.RUNWAY_API_BASE ?? "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";

function headers(): Record<string, string> {
  const key = process.env.RUNWAYML_API_SECRET?.trim();
  if (!key) throw new Error("Runway is not connected. Add RUNWAYML_API_SECRET on the server.");
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": VERSION, "Content-Type": "application/json" };
}

type Task = { id: string; status: "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"; output?: string[]; failure?: string; failureCode?: string };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, signal: init.signal ?? AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    let detail = body;
    try {
      const j = JSON.parse(body) as { error?: string; message?: string };
      detail = j.error ?? j.message ?? body;
    } catch {
      /* plain text */
    }
    throw new Error(`Runway request failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

async function toUri(ref: { url: string; bytes?: Buffer | Uint8Array; mimeType?: string }): Promise<string> {
  if (/^https?:\/\//.test(ref.url) && !/localhost|127\.0\.0\.1/.test(ref.url) && !ref.bytes) return ref.url;
  if (ref.url.startsWith("data:") && !ref.bytes) return ref.url;
  const bytes = ref.bytes ?? Buffer.from(await (await fetch(ref.url)).arrayBuffer());
  return `data:${ref.mimeType ?? "image/png"};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function waitForTask(id: string, opts: { pollMs?: number; timeoutMs?: number } = {}): Promise<Task> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  for (;;) {
    const t = await api<Task>(`/tasks/${id}`);
    if (t.status === "SUCCEEDED" || t.status === "FAILED" || t.status === "CANCELLED") return t;
    if (Date.now() > deadline) throw new Error(`Runway task ${id} timed out`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 4000));
  }
}

/** Runway wants explicit pixel ratios per model family. */
export const RUNWAY_IMAGE_RATIOS: Record<AspectRatio, string> = { "1:1": "1024:1024", "4:5": "1080:1440", "9:16": "1080:1920", "16:9": "1920:1080", "1.91:1": "1808:768" };
export const RUNWAY_VIDEO_RATIOS: Record<AspectRatio, string> = { "1:1": "960:960", "4:5": "832:1104", "9:16": "720:1280", "16:9": "1280:720", "1.91:1": "1584:672" };

// ---------- Images ----------

export function runwayImageInput(spec: ModelSpec, req: { prompt: string; ratio: AspectRatio; seed?: number }, refs: string[]): Record<string, unknown> {
  const prompt = spec.maxPromptChars && req.prompt.length > spec.maxPromptChars ? req.prompt.slice(0, spec.maxPromptChars) : req.prompt;
  return {
    model: spec.endpoints?.text ?? "gen4_image",
    promptText: prompt,
    ratio: RUNWAY_IMAGE_RATIOS[req.ratio] ?? "1024:1024",
    ...(refs.length ? { referenceImages: refs.slice(0, 3).map((uri, i) => ({ uri, tag: `ref${i + 1}` })) } : {}),
    ...(req.seed !== undefined && !spec.noSeed ? { seed: req.seed } : {}),
    ...(spec.options ?? {}),
  };
}

export async function generateRunwayImage(req: FalImageRequest): Promise<GenerationResult<GeneratedImage[]>> {
  const spec = getModel(req.model);
  if (!spec || spec.kind !== "image" || spec.provider !== "runway") throw new Error(`"${req.model}" is not a Runway image model`);
  const started = Date.now();
  const count = Math.max(1, Math.min(req.count ?? 1, 4));
  const refs = spec.endpoints?.edit === "none" ? [] : await Promise.all((req.references ?? []).map(toUri));
  const prompt = req.negativePrompt ? `${req.prompt}\n\nAvoid: ${req.negativePrompt}` : req.prompt;
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const input = runwayImageInput(spec, { prompt, ratio: req.ratio, seed: req.seed === undefined ? undefined : req.seed + i }, refs);
    const created = await api<{ id: string }>("/text_to_image", { method: "POST", body: JSON.stringify(input) });
    const task = await waitForTask(created.id, { pollMs: 2500 });
    if (task.status !== "SUCCEEDED") throw new Error(`${spec.label} failed: ${task.failure ?? task.failureCode ?? task.status}`);
    urls.push(...(task.output ?? []));
  }
  if (!urls.length) throw new Error(`${spec.label} returned no image`);
  const size = RATIO_SIZES[req.ratio];
  return {
    output: urls.slice(0, count).map((url) => ({ url, mimeType: "image/png", width: size.width, height: size.height })),
    usage: { provider: "runway", model: spec.id, durationMs: Date.now() - started, costUsd: spec.approxCostUsd === undefined ? undefined : spec.approxCostUsd * urls.length, units: urls.length },
  };
}

// ---------- Video ----------

export function runwayVideoInput(spec: ModelSpec, req: FalVideoRequest, imageUri?: string): { path: string; body: Record<string, unknown> } {
  const duration = supportedDuration(spec.id, req.durationSec);
  const prompt = spec.maxPromptChars && req.prompt.length > spec.maxPromptChars ? req.prompt.slice(0, spec.maxPromptChars) : req.prompt;
  const common = { promptText: prompt, ratio: RUNWAY_VIDEO_RATIOS[req.ratio] ?? "720:1280", duration, ...(req.seed !== undefined && !spec.noSeed ? { seed: req.seed } : {}), ...(spec.options ?? {}) };
  if (imageUri) return { path: "/image_to_video", body: { model: spec.endpoints?.imageToVideo ?? spec.endpoints?.textToVideo ?? "gen4_turbo", promptImage: imageUri, ...common } };
  if (!spec.endpoints?.textToVideo) throw new Error(`${spec.label} needs a start frame (image-to-video only)`);
  return { path: "/text_to_video", body: { model: spec.endpoints.textToVideo, ...common } };
}

export async function submitRunwayVideo(req: FalVideoRequest): Promise<VideoJob> {
  const spec = getModel(req.model);
  if (!spec || spec.kind !== "video" || spec.provider !== "runway") throw new Error(`"${req.model}" is not a Runway video model`);
  const imageUri = req.image ? await toUri(req.image) : undefined;
  const { path, body } = runwayVideoInput(spec, req, imageUri);
  const created = await api<{ id: string }>(path, { method: "POST", body: JSON.stringify(body) });
  return { id: `runway::${created.id}`, status: "queued" };
}

export async function runwayVideoStatus(jobId: string): Promise<VideoJob> {
  const t = await api<Task>(`/tasks/${jobId.replace(/^runway::/, "")}`);
  if (t.status === "PENDING" || t.status === "THROTTLED") return { id: jobId, status: "queued" };
  if (t.status === "RUNNING") return { id: jobId, status: "running" };
  if (t.status === "SUCCEEDED") {
    const url = t.output?.[0];
    return url ? { id: jobId, status: "succeeded", output: { url, mimeType: "video/mp4" } } : { id: jobId, status: "failed", error: "Runway returned no video" };
  }
  return { id: jobId, status: "failed", error: t.failure ?? t.failureCode ?? t.status };
}

export async function generateRunwayVideo(req: FalVideoRequest, opts: { pollMs?: number; timeoutMs?: number; onStatus?: (job: VideoJob) => void } = {}): Promise<GenerationResult<GeneratedVideo>> {
  const started = Date.now();
  const spec = getModel(req.model);
  if (!spec) throw new Error(`Unknown video model "${req.model}"`);
  const seconds = supportedDuration(spec.id, req.durationSec);
  let job = await submitRunwayVideo(req);
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() > deadline) throw new Error(`Runway video job ${job.id} timed out`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 4000));
    job = await runwayVideoStatus(job.id);
    opts.onStatus?.(job);
  }
  if (job.status === "failed" || !job.output) throw new Error(job.error ?? "Runway video generation failed");
  const size = VIDEO_RATIO_SIZES[req.ratio] ?? VIDEO_RATIO_SIZES["9:16"];
  const output: GeneratedVideo = { ...job.output, mimeType: job.output.mimeType ?? "video/mp4", width: size.width, height: size.height, durationSec: seconds };
  return { output, usage: { provider: "runway", model: spec.id, durationMs: Date.now() - started, costUsd: (spec.approxCostUsd ?? 0) * seconds || undefined, units: seconds } };
}
