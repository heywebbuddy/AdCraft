import { listVoices as listElevenLabsVoices, isElevenLabsConfigured } from "./elevenlabs";

/**
 * One voice catalogue across providers.
 *
 * - ElevenLabs voices are synthesised by us into an mp3 that HeyGen lip-syncs to.
 * - HeyGen voices (≈3,000 across ~60 languages) are spoken by HeyGen itself: the presenter
 *   request carries `script` + `voice_id` instead of an audio asset.
 *
 * Both are cached in memory for six hours. The catalogue is large, so callers page /
 * filter server-side (`searchVoices`) rather than shipping it to the browser.
 */

export type VoiceSource = "elevenlabs" | "heygen";

export type CatalogVoice = {
  id: string;
  provider: VoiceSource;
  name: string;
  /** "Thoughtful & Clear", "premade" — whatever the provider says after the name. */
  style?: string;
  gender?: "male" | "female";
  language?: string;
  accent?: string;
  previewUrl?: string;
  /** HeyGen: voice can express emotion tags in the script. */
  emotion?: boolean;
};

const API = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com";
const SIX_HOURS = 6 * 60 * 60_000;
let heygenCache: { at: number; list: CatalogVoice[] } | null = null;

type RawHeyGenVoice = { voice_id: string; name: string; gender?: string; language?: string; preview_audio?: string | null; emotion_support?: boolean };

/** HeyGen's voice library (public voices), cached. Empty without a key. */
export async function listHeyGenVoices(): Promise<CatalogVoice[]> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return [];
  if (heygenCache && Date.now() - heygenCache.at < SIX_HOURS) return heygenCache.list;
  try {
    const res = await fetch(`${API}/v2/voices`, { headers: { "x-api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HeyGen /v2/voices ${res.status}`);
    const data = (await res.json()) as { data?: { voices?: RawHeyGenVoice[] } };
    const list: CatalogVoice[] = (data.data?.voices ?? []).map((v) => {
      const [name, ...rest] = v.name.split(/\s+[-–]\s+/);
      const g = v.gender?.toLowerCase();
      return {
        id: v.voice_id,
        provider: "heygen",
        name: (name ?? v.name).trim(),
        style: rest.join(" - ").trim() || undefined,
        gender: g === "male" || g === "female" ? g : undefined,
        language: v.language?.trim() || undefined,
        previewUrl: v.preview_audio ?? undefined,
        emotion: Boolean(v.emotion_support),
      };
    });
    heygenCache = { at: Date.now(), list };
    return list;
  } catch (err) {
    console.warn("[heygen] listVoices failed", err instanceof Error ? err.message : err);
    return heygenCache?.list ?? [];
  }
}

/** ElevenLabs voices in catalogue shape. */
export async function listElevenLabsCatalog(): Promise<CatalogVoice[]> {
  const list = await listElevenLabsVoices();
  return list.map((v) => {
    const [name, ...rest] = v.label.split(/\s+[-–·]\s+/);
    // "premade" / "cloned" is ElevenLabs' category, not a style — keep only the descriptive part.
    const style = rest.filter((r) => !/^(premade|cloned|generated|professional)$/i.test(r.trim())).join(" · ").trim() || undefined;
    return { id: v.id, provider: "elevenlabs" as const, name: (name ?? v.label).trim(), style, gender: v.gender, accent: v.accent, language: "English", previewUrl: v.previewUrl };
  });
}

/** Everything, ElevenLabs first (they are the account's curated set). */
export async function listAllVoices(): Promise<CatalogVoice[]> {
  const [eleven, heygen] = await Promise.all([isElevenLabsConfigured ? listElevenLabsCatalog() : Promise.resolve([] as CatalogVoice[]), listHeyGenVoices()]);
  return [...eleven, ...heygen];
}

/** Resolve a stored voice id to its provider and details. */
export async function findVoice(id: string): Promise<CatalogVoice | null> {
  if (!id) return null;
  const eleven = isElevenLabsConfigured ? await listElevenLabsCatalog() : [];
  const hit = eleven.find((v) => v.id === id);
  if (hit) return hit;
  return (await listHeyGenVoices()).find((v) => v.id === id) ?? null;
}

export type VoiceQuery = { query?: string; gender?: "male" | "female"; language?: string; provider?: VoiceSource; offset?: number; limit?: number };

/** Server-side search over the catalogue, paged. */
export async function searchVoices(q: VoiceQuery): Promise<{ items: CatalogVoice[]; total: number; languages: string[] }> {
  const all = await listAllVoices();
  const needle = q.query?.trim().toLowerCase();
  const filtered = all.filter(
    (v) =>
      (!q.provider || v.provider === q.provider) &&
      (!q.gender || v.gender === q.gender) &&
      (!q.language || v.language === q.language) &&
      (!needle || `${v.name} ${v.style ?? ""} ${v.language ?? ""} ${v.accent ?? ""}`.toLowerCase().includes(needle)),
  );
  const languages = Array.from(new Set(all.map((v) => v.language).filter((l): l is string => Boolean(l)))).sort((a, b) => (a === "English" ? -1 : b === "English" ? 1 : a.localeCompare(b)));
  // Voices with a sample first (stable within each half), so the list starts playable.
  const ordered = [...filtered].sort((a, b) => Number(Boolean(b.previewUrl)) - Number(Boolean(a.previewUrl)));
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.min(100, Math.max(1, q.limit ?? 60));
  return { items: ordered.slice(offset, offset + limit), total: filtered.length, languages };
}

/** Text a voice sample says; short so an audition costs a fraction of a credit. */
export const SAMPLE_TEXT = "Hi there. Here is how I sound when I introduce your product — warm, clear, and ready for your next ad.";

/**
 * Generate a short sample for a HeyGen voice that ships without one (`POST /v3/voices/speech`,
 * billed per generated minute). Returns the audio URL HeyGen hosts; callers cache it.
 */
export async function generateHeyGenVoiceSample(voiceId: string, text = SAMPLE_TEXT): Promise<{ url: string; durationSec?: number }> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HeyGen is not connected.");
  const res = await fetch(`${API}/v3/voices/speech`, {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ voice_id: voiceId, text }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HeyGen speech failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data?: { audio_url?: string; duration?: number } };
  if (!data.data?.audio_url) throw new Error("HeyGen returned no audio.");
  return { url: data.data.audio_url, durationSec: data.data.duration };
}

/** Attach a generated sample to a cached HeyGen voice so later searches include it. */
export function setHeyGenVoicePreview(voiceId: string, url: string) {
  const v = heygenCache?.list.find((x) => x.id === voiceId);
  if (v) v.previewUrl = url;
}
