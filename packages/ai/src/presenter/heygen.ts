import type { AspectRatio, GenerationResult, MediaRef, PresenterProvider, PresenterRequest, Usage } from "../types";
import { probeBufferDurationSec, slideshowMp4, type SlideFrame } from "../video/ffmpeg";
import { estimateSpeechSeconds } from "../voice/elevenlabs";

/**
 * HeyGen v2 avatar videos over plain REST (no SDK).
 *
 * Only licensed stock avatars are listed (PLAN.md §4: "licensed stock avatars only;
 * users can upload their own with consent"). Offline mode (no `HEYGEN_API_KEY`) returns a
 * "presenter card": a brand-coloured video with the script captions burned in, muxed with
 * the supplied voice track, so UGC assembly can be tested end to end.
 */
export const isHeyGenConfigured = Boolean(process.env.HEYGEN_API_KEY);

const API_BASE = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com";
const UPLOAD_BASE = process.env.HEYGEN_UPLOAD_BASE ?? "https://upload.heygen.com";

export const HEYGEN_MODEL = "heygen-avatar-v2";

/** Approximate USD per minute of avatar video on the API plan. TODO: replace with measured costs. */
const APPROX_COST_PER_MIN_USD = 1.0;

export const VIDEO_RATIO_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1.91:1": { width: 1920, height: 1005 },
};

export type Avatar = { id: string; label: string; previewUrl?: string; licensed: boolean };

/**
 * Stock avatars shown when HeyGen cannot be reached. Ids are HeyGen public avatar ids.
 * TODO(verify): refresh against GET /v2/avatars once a key is available.
 */
export const STOCK_AVATARS: Avatar[] = [
  { id: "Abigail_expressive_2024112501", label: "Abigail · expressive", licensed: true },
  { id: "Anna_public_3_20240108", label: "Anna · studio", licensed: true },
  { id: "Daisy-inskirt-20220818", label: "Daisy · casual", licensed: true },
  { id: "Josh_lite3_20230714", label: "Josh · lifestyle", licensed: true },
  { id: "Wayne_20240711", label: "Wayne · confident", licensed: true },
];

export type PresenterClip = MediaRef & { bytes?: Buffer };

export interface HeyGenPresenterRequest extends PresenterRequest {
  /** Voice track bytes when the URL is not publicly reachable (uploaded to HeyGen assets). */
  audio?: MediaRef & { bytes?: Buffer };
  /** Caption segments for the offline presenter card. Defaults to sentence-splitting `script`. */
  captions?: Array<{ text: string; durationSec: number }>;
  /** Colours for the offline card. */
  brand?: { background?: string; text?: string; accent?: string; name?: string; font?: string };
}

function headers() {
  return { "x-api-key": process.env.HEYGEN_API_KEY ?? "", accept: "application/json", "content-type": "application/json" };
}

export async function listAvatars(): Promise<Avatar[]> {
  if (!isHeyGenConfigured) return STOCK_AVATARS;
  try {
    const res = await fetch(`${API_BASE}/v2/avatars`, { headers: headers() });
    if (!res.ok) throw new Error(`HeyGen /v2/avatars ${res.status}`);
    const data = (await res.json()) as {
      data?: { avatars?: Array<{ avatar_id: string; avatar_name: string; preview_image_url?: string; premium?: boolean; type?: string }> };
    };
    // Public/stock avatars only: anything HeyGen flags as premium or user-uploaded is skipped.
    const avatars = (data.data?.avatars ?? [])
      .filter((a) => !a.premium && (a.type ?? "public") !== "private")
      .map((a) => ({ id: a.avatar_id, label: a.avatar_name, previewUrl: a.preview_image_url, licensed: true }));
    return avatars.length ? avatars : STOCK_AVATARS;
  } catch (err) {
    console.warn("[heygen] listAvatars failed, using stock list:", err instanceof Error ? err.message : err);
    return STOCK_AVATARS;
  }
}

async function fetchBytes(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Upload private audio bytes to HeyGen's asset store so the generate call can reference them. */
async function uploadAsset(bytes: Buffer, contentType: string): Promise<string> {
  const res = await fetch(`${UPLOAD_BASE}/v1/asset`, {
    method: "POST",
    headers: { "x-api-key": process.env.HEYGEN_API_KEY ?? "", "content-type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`HeyGen asset upload failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { data?: { url?: string } };
  if (!data.data?.url) throw new Error("HeyGen asset upload returned no url");
  return data.data.url;
}

/** Split a script into caption segments with durations proportional to their length. */
export function captionSegments(script: string, totalSec: number): Array<{ text: string; durationSec: number }> {
  const parts = script
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [{ text: script.trim() || "…", durationSec: totalSec }];
  const weights = parts.map((p) => estimateSpeechSeconds(p));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return parts.map((text, i) => ({ text, durationSec: Math.max(0.6, (weights[i]! / sum) * totalSec) }));
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}

/** Greedy word-wrap by an approximate character budget. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 6);
}

/** One PNG "presenter card" frame: brand background, avatar placeholder, caption. */
async function cardFrame(
  opts: { width: number; height: number; bg: string; fg: string; accent: string; name: string; font: string },
  caption: string,
  index: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { width, height } = opts;
  const portrait = height >= width;
  const fontSize = Math.round(Math.min(width, height) / (portrait ? 16 : 20));
  const lines = wrap(caption, portrait ? 22 : 34);
  const lineH = Math.round(fontSize * 1.25);
  const textTop = Math.round(height * (portrait ? 0.62 : 0.6));
  const r = Math.round(Math.min(width, height) * 0.16);
  const cx = Math.round(width / 2);
  const cy = Math.round(height * (portrait ? 0.36 : 0.32));
  const bob = Math.round(Math.sin(index * 1.3) * r * 0.05);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${opts.bg}"/>
      <circle cx="${cx}" cy="${cy + bob}" r="${r}" fill="${opts.accent}" fill-opacity="0.18"/>
      <circle cx="${cx}" cy="${cy + bob - r * 0.18}" r="${Math.round(r * 0.42)}" fill="${opts.accent}"/>
      <path d="M ${cx - r * 0.75} ${cy + bob + r * 0.95} a ${r * 0.75} ${r * 0.7} 0 0 1 ${r * 1.5} 0 z" fill="${opts.accent}"/>
      <text x="${cx}" y="${cy + r + fontSize * 1.4}" text-anchor="middle" font-family="${escapeXml(opts.font)}, Helvetica, Arial, sans-serif" font-size="${Math.round(fontSize * 0.55)}" font-weight="600" fill="${opts.fg}" fill-opacity="0.7" letter-spacing="2">AI PRESENTER · PREVIEW</text>
      ${lines
        .map(
          (l, i) =>
            `<text x="${cx}" y="${textTop + i * lineH}" text-anchor="middle" font-family="${escapeXml(opts.font)}, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${opts.fg}">${escapeXml(l)}</text>`,
        )
        .join("")}
      <text x="${cx}" y="${height - Math.round(height * 0.06)}" text-anchor="middle" font-family="${escapeXml(opts.font)}, Helvetica, Arial, sans-serif" font-size="${Math.round(fontSize * 0.6)}" fill="${opts.fg}" fill-opacity="0.6">${escapeXml(opts.name)}</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Offline presenter card video for UGC assembly tests. */
export async function placeholderPresenter(req: HeyGenPresenterRequest): Promise<PresenterClip> {
  const size = VIDEO_RATIO_SIZES[req.ratio] ?? VIDEO_RATIO_SIZES["9:16"];
  const audioBytes = req.audio ? (req.audio.bytes ?? (await fetchBytes(req.audio.url))) : undefined;
  const audioSec = audioBytes ? (await probeBufferDurationSec(audioBytes, "mp3")) ?? undefined : undefined;
  const totalSec = req.audio?.durationSec ?? audioSec ?? estimateSpeechSeconds(req.script);
  const segments = req.captions?.length ? req.captions : captionSegments(req.script, totalSec);
  const style = {
    ...size,
    bg: req.brand?.background ?? (typeof req.background === "object" && "color" in req.background ? req.background.color : "#242521"),
    fg: req.brand?.text ?? "#f8f7f3",
    accent: req.brand?.accent ?? "#e65c32",
    name: req.brand?.name ?? "",
    font: req.brand?.font ?? "DM Sans",
  };
  const frames: SlideFrame[] = [];
  for (const [i, seg] of segments.entries()) frames.push({ png: await cardFrame(style, seg.text, i), durationSec: seg.durationSec });
  const bytes = await slideshowMp4(frames, { ...size, audio: audioBytes ? { bytes: audioBytes, ext: "mp3" } : undefined });
  return { url: `data:video/mp4;base64,${bytes.toString("base64")}`, mimeType: "video/mp4", ...size, durationSec: totalSec, bytes };
}

/** Generate an avatar clip: create → poll `video_status.get` → return the hosted mp4 url. */
export async function generatePresenter(
  req: HeyGenPresenterRequest,
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<GenerationResult<PresenterClip>> {
  const startedAt = Date.now();
  if (!isHeyGenConfigured) {
    const output = await placeholderPresenter(req);
    const usage: Usage = { provider: "heygen", model: `${HEYGEN_MODEL} (offline)`, durationMs: Date.now() - startedAt, costUsd: 0, units: output.durationSec };
    return { output, usage };
  }

  const size = VIDEO_RATIO_SIZES[req.ratio] ?? VIDEO_RATIO_SIZES["9:16"];
  let voice: Record<string, unknown>;
  if (req.audio) {
    const audioUrl =
      /^https?:\/\//.test(req.audio.url) && !req.audio.bytes
        ? req.audio.url
        : await uploadAsset(req.audio.bytes ?? (await fetchBytes(req.audio.url)), req.audio.mimeType ?? "audio/mpeg");
    voice = { type: "audio", audio_url: audioUrl };
  } else {
    voice = { type: "text", input_text: req.script, ...(req.voiceId ? { voice_id: req.voiceId } : {}) };
  }
  const background =
    req.background && "color" in req.background
      ? { type: "color", value: req.background.color }
      : req.background
        ? { type: "image", url: req.background.url }
        : { type: "color", value: "#f8f7f3" };

  const create = await fetch(`${API_BASE}/v2/video/generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      caption: false,
      dimension: { width: size.width, height: size.height },
      video_inputs: [{ character: { type: "avatar", avatar_id: req.avatarId, avatar_style: "normal" }, voice, background }],
    }),
  });
  if (!create.ok) throw new Error(`HeyGen video/generate failed: ${create.status} ${(await create.text()).slice(0, 300)}`);
  const created = (await create.json()) as { data?: { video_id?: string }; error?: unknown };
  const videoId = created.data?.video_id;
  if (!videoId) throw new Error(`HeyGen returned no video_id: ${JSON.stringify(created.error ?? created).slice(0, 300)}`);

  const deadline = Date.now() + (opts.timeoutMs ?? 20 * 60_000);
  let videoUrl: string | undefined;
  let durationSec: number | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 5000));
    const st = await fetch(`${API_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers: headers() });
    if (!st.ok) throw new Error(`HeyGen video_status.get failed: ${st.status}`);
    const data = (await st.json()) as { data?: { status?: string; video_url?: string; duration?: number; error?: { message?: string } | string } };
    const status = data.data?.status;
    if (status === "completed" && data.data?.video_url) {
      videoUrl = data.data.video_url;
      durationSec = data.data.duration;
      break;
    }
    if (status === "failed") {
      const e = data.data?.error;
      throw new Error(`HeyGen video failed: ${typeof e === "string" ? e : e?.message ?? "unknown error"}`);
    }
  }
  if (!videoUrl) throw new Error(`HeyGen video ${videoId} timed out`);

  const seconds = durationSec ?? estimateSpeechSeconds(req.script);
  const usage: Usage = {
    provider: "heygen",
    model: HEYGEN_MODEL,
    durationMs: Date.now() - startedAt,
    costUsd: (seconds / 60) * APPROX_COST_PER_MIN_USD,
    units: seconds,
  };
  return { output: { url: videoUrl, mimeType: "video/mp4", ...size, durationSec: seconds }, usage };
}

/** Download a presenter clip's bytes (HeyGen-hosted or data URL) for storing in R2. */
export async function downloadPresenter(ref: PresenterClip): Promise<Buffer> {
  return ref.bytes ?? fetchBytes(ref.url);
}

export class HeyGenPresenterProvider implements PresenterProvider {
  readonly name = "heygen" as const;
  readonly capability = "presenter" as const;
  listAvatars() {
    return listAvatars();
  }
  async generate(req: PresenterRequest): Promise<GenerationResult<MediaRef>> {
    return generatePresenter(req);
  }
}
