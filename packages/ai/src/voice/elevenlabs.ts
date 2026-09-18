import type { GenerationResult, MediaRef, Usage, VoiceProvider, VoiceRequest } from "../types";
import { probeBufferDurationSec, silenceMp3 } from "../video/ffmpeg";

/**
 * ElevenLabs text-to-speech over plain REST (no SDK).
 *
 * Offline mode: when `ELEVENLABS_API_KEY` is unset, `synthesize()` returns a silent MP3
 * whose length matches the estimated speaking time of the script, so timing-dependent
 * assembly (captions, B-roll cut-ins) can be exercised without a key.
 *
 * Voice cloning is deliberately not exposed here: PLAN.md §4 requires an explicit consent
 * flow before any cloned voice is created.
 */
export const isElevenLabsConfigured = Boolean(process.env.ELEVENLABS_API_KEY);

const API_BASE = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";

/** Model ids. TODO(verify): confirm the current default multilingual model id and pricing tier. */
export const ELEVENLABS_MODEL = "eleven_multilingual_v2";
export const ELEVENLABS_MODEL_FAST = "eleven_flash_v2_5";

/** Approximate USD per 1k characters on the Creator tier. TODO: replace with measured costs. */
const APPROX_COST_PER_1K_CHARS_USD = 0.3;

/** Stock voices used when the account list cannot be fetched (ids are ElevenLabs' public premade voices). */
export const STOCK_VOICES: Array<{ id: string; label: string; previewUrl?: string }> = [
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah · warm, conversational" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel · calm, clear" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam · energetic" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam · deep, confident" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte · bright, friendly" },
];

/** ~150 words per minute plus a short pause per sentence. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  return Math.max(1, Math.round((words / 2.5 + sentences * 0.35) * 10) / 10);
}

export type SynthesizedVoice = MediaRef & { bytes: Buffer };

function headers() {
  return { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json" };
}

export type VoiceOption = { id: string; label: string; previewUrl?: string; gender?: "male" | "female"; accent?: string };

let voiceCache: { at: number; list: VoiceOption[] } | null = null;

/** The account's voices (ElevenLabs premade + cloned), cached for an hour. */
export async function listVoices(): Promise<VoiceOption[]> {
  if (voiceCache && Date.now() - voiceCache.at < 60 * 60_000) return voiceCache.list;
  if (!isElevenLabsConfigured) return STOCK_VOICES;
  try {
    const res = await fetch(`${API_BASE}/v1/voices`, { headers: headers() });
    if (!res.ok) throw new Error(`ElevenLabs /v1/voices ${res.status}`);
    const data = (await res.json()) as { voices?: Array<{ voice_id: string; name: string; preview_url?: string; category?: string; labels?: Record<string, string> }> };
    const voices: VoiceOption[] = (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      label: v.category ? `${v.name} · ${v.category}` : v.name,
      previewUrl: v.preview_url,
      gender: v.labels?.gender === "male" || v.labels?.gender === "female" ? v.labels.gender : undefined,
      accent: v.labels?.accent,
    }));
    if (!voices.length) return STOCK_VOICES;
    voiceCache = { at: Date.now(), list: voices };
    return voices;
  } catch (err) {
    console.warn("[elevenlabs] listVoices failed, using stock voices:", err instanceof Error ? err.message : err);
    return STOCK_VOICES;
  }
}

/** Synthesize `text` to MP3. Returns bytes plus the measured duration. */
export async function synthesizeVoice(req: VoiceRequest): Promise<GenerationResult<SynthesizedVoice>> {
  const startedAt = Date.now();
  const model = req.model || ELEVENLABS_MODEL;
  const voiceId = req.voiceId || STOCK_VOICES[0]!.id;
  const chars = req.text.length;

  let bytes: Buffer;
  let offline = false;
  if (!isElevenLabsConfigured) {
    offline = true;
    bytes = await silenceMp3(estimateSpeechSeconds(req.text) / (req.speed ?? 1));
  } else {
    const url = `${API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    const res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        text: req.text,
        model_id: model,
        ...(req.language ? { language_code: req.language } : {}),
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, ...(req.speed ? { speed: req.speed } : {}) },
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs text-to-speech failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }

  const durationSec = (await probeBufferDurationSec(bytes, "mp3")) ?? estimateSpeechSeconds(req.text);
  const usage: Usage = {
    provider: "elevenlabs",
    model: offline ? `${model} (offline)` : model,
    durationMs: Date.now() - startedAt,
    costUsd: offline ? 0 : (chars / 1000) * APPROX_COST_PER_1K_CHARS_USD,
    units: chars,
  };
  return {
    output: { url: `data:audio/mpeg;base64,${bytes.toString("base64")}`, mimeType: "audio/mpeg", durationSec, bytes },
    usage,
  };
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = "elevenlabs" as const;
  readonly capability = "voice" as const;
  listVoices() {
    return listVoices();
  }
  async synthesize(req: VoiceRequest): Promise<GenerationResult<MediaRef>> {
    return synthesizeVoice(req);
  }
}
