import type { AspectRatio, GenerationResult } from "../types";
import type { PresenterClip } from "./heygen";

/** Animate our saved synthetic portrait, preserving the selected image and voice track. */
export async function generatePhotoPresenter(req: { image: Buffer; audio: Buffer; ratio: AspectRatio; durationSec: number }, opts: { pollMs?: number; timeoutMs?: number } = {}): Promise<GenerationResult<PresenterClip>> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HeyGen is not connected. Add HEYGEN_API_KEY to animate a character.");
  const base = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com";
  const headers = { "x-api-key": key };
  const started = Date.now();
  async function upload(bytes: Buffer, type: string, filename: string) {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(bytes)], { type }), filename);
    const res = await fetch(`${base}/v3/assets`, { method: "POST", headers, body: form, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HeyGen asset upload failed (${res.status}).`);
    const body = await res.json() as { data?: { asset_id?: string } };
    if (!body.data?.asset_id) throw new Error("HeyGen returned no asset ID.");
    return body.data.asset_id;
  }
  const [imageId, audioId] = await Promise.all([upload(req.image, "image/png", "character.png"), upload(req.audio, "audio/mpeg", "voice.mp3")]);
  const response = await fetch(`${base}/v3/videos`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ type: "image", image: { type: "asset_id", asset_id: imageId }, audio_asset_id: audioId, aspect_ratio: req.ratio, resolution: "1080p", title: "Adcraft character ad" }), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HeyGen character generation failed (${response.status}). Check API access and available credits.`);
  const created = await response.json() as { data?: { video_id?: string } };
  if (!created.data?.video_id) throw new Error("HeyGen returned no video ID.");
  const deadline = Date.now() + (opts.timeoutMs ?? 20 * 60_000);
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/v3/videos/${encodeURIComponent(created.data.video_id)}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HeyGen status check failed (${res.status}).`);
    const { data } = await res.json() as { data?: { status?: string; video_url?: string; duration?: number; failure_message?: string } };
    if (data?.status === "failed") throw new Error(`HeyGen could not animate this character: ${data.failure_message ?? "Please try another portrait."}`);
    if (data?.status === "completed" && data.video_url) return { output: { url: data.video_url, mimeType: "video/mp4", durationSec: data.duration ?? req.durationSec }, usage: { provider: "heygen", model: "heygen-photo-v3", durationMs: Date.now() - started, units: data.duration ?? req.durationSec } };
    await new Promise(resolve => setTimeout(resolve, opts.pollMs ?? 5000));
  }
  throw new Error("Character animation timed out. Check the provider job before starting a new generation.");
}
