/**
 * HeyGen voice management (v3): instant clones and designed voices.
 *
 * Both produce *private* voices on the HeyGen account. They are not in the public
 * `/v2/voices` catalogue, so the app tracks which workspace owns each one and merges them
 * into that workspace's voice library. Private voices count against the account's clone
 * limit (10 by default), so voices nobody kept are deleted.
 *
 * - Clone: `POST /v3/voices/clone` with one recording → `voice_clone_id`, then poll
 *   `GET /v3/voices/{id}` until `status` is `complete` (about ten seconds in practice).
 * - Design: `POST /v3/voices` with a description → up to three new voices, each already a
 *   private voice with a signed preview URL. The caller keeps one and deletes the rest.
 *
 * Voice ids are 32-char hex for clones and 20-char base62 for designed voices.
 */

const API = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com";
const key = () => process.env.HEYGEN_API_KEY ?? "";

export const isHeyGenVoiceId = (id: string) => /^[A-Za-z0-9_-]{8,64}$/.test(id);

export type HeyGenPrivateVoice = {
  id: string;
  name: string;
  gender?: "male" | "female";
  language?: string;
  previewUrl?: string;
  supportsPause?: boolean;
};

export type HeyGenVoiceStatus = HeyGenPrivateVoice & { status: "processing" | "complete" | "failed"; failureMessage?: string };

type RawVoice = { voice_id: string; name?: string | null; gender?: string | null; language?: string | null; preview_audio_url?: string | null; support_pause?: boolean; status?: string | null; failure_message?: string | null };

const gender = (g?: string | null) => (g === "male" || g === "female" ? g : undefined);
const toVoice = (v: RawVoice): HeyGenPrivateVoice => ({
  id: v.voice_id,
  name: v.name?.trim() || "Untitled voice",
  gender: gender(v.gender),
  language: v.language?.trim() || undefined,
  previewUrl: v.preview_audio_url ?? undefined,
  supportsPause: v.support_pause,
});

async function heygen<T>(method: string, path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  if (!key()) throw new Error("HeyGen is not connected.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "x-api-key": key(), accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(describeError(res.status, text));
  return (text ? JSON.parse(text) : {}) as T;
}

/** Turn HeyGen's `{error: {code, message}}` into something a person can act on. */
function describeError(status: number, text: string): string {
  let code = "", message = "";
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
    code = parsed.error?.code ?? "";
    message = parsed.error?.message ?? "";
  } catch {
    /* not JSON */
  }
  if (code === "plan_upgrade_required") return "Voice cloning is not included in the connected HeyGen plan.";
  if (code === "resource_limit_reached") return "The HeyGen account has reached its limit of custom voices. Delete one you no longer use.";
  if (status === 404 || code === "voice_not_found") return "That voice no longer exists on HeyGen.";
  return message ? `HeyGen: ${message}` : `HeyGen request failed (${status}).`;
}

/** Every private (cloned or designed) voice on the account. */
export async function listHeyGenPrivateVoices(): Promise<HeyGenPrivateVoice[]> {
  if (!key()) return [];
  const out: HeyGenPrivateVoice[] = [];
  let token: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await heygen<{ data?: RawVoice[]; has_more?: boolean; next_token?: string | null }>("GET", `/v3/voices?type=private&limit=100${token ? `&token=${encodeURIComponent(token)}` : ""}`);
    out.push(...(page.data ?? []).map(toVoice));
    if (!page.has_more || !page.next_token) break;
    token = page.next_token;
  }
  return out;
}

/**
 * Start an instant clone from one recording (inline base64; 30 s – 2 min of one clear
 * speaker works best). Returns the id to poll with `getHeyGenVoice`.
 */
export async function cloneHeyGenVoice(req: { name: string; audio: Buffer; mimeType: string; language?: string; removeBackgroundNoise?: boolean }): Promise<string> {
  const res = await heygen<{ data?: { voice_clone_id?: string } }>(
    "POST",
    "/v3/voices/clone",
    {
      voice_name: req.name.slice(0, 100),
      audio: { type: "base64", media_type: req.mimeType, data: req.audio.toString("base64") },
      ...(req.language ? { language: req.language } : {}),
      remove_background_noise: req.removeBackgroundNoise ?? true,
    },
    120_000,
  );
  if (!res.data?.voice_clone_id) throw new Error("HeyGen returned no voice id.");
  return res.data.voice_clone_id;
}

/** One voice with its clone status (`status` is absent for catalogue voices → treated as complete). */
export async function getHeyGenVoice(voiceId: string): Promise<HeyGenVoiceStatus> {
  const res = await heygen<{ data?: RawVoice }>("GET", `/v3/voices/${encodeURIComponent(voiceId)}`);
  const v = res.data;
  if (!v) throw new Error("That voice no longer exists on HeyGen.");
  const status = v.status === "processing" || v.status === "failed" ? v.status : "complete";
  return { ...toVoice(v), status, failureMessage: v.failure_message ?? undefined };
}

/**
 * Design voices from a description. HeyGen returns up to three, each already saved as a
 * private voice with a signed preview. `seed` picks a different batch for the same prompt.
 * Detailed prompts (tone, age, accent, pace, use) work; terse ones often return nothing.
 */
export async function designHeyGenVoices(req: { prompt: string; gender?: "male" | "female"; locale?: string; seed?: number }): Promise<{ voices: HeyGenPrivateVoice[]; seed: number }> {
  const res = await heygen<{ data?: { voices?: RawVoice[]; seed?: number } }>(
    "POST",
    "/v3/voices",
    { prompt: req.prompt.slice(0, 1000), ...(req.gender ? { gender: req.gender } : {}), ...(req.locale ? { locale: req.locale } : {}), seed: req.seed ?? 0 },
    120_000,
  );
  return { voices: (res.data?.voices ?? []).map(toVoice), seed: res.data?.seed ?? req.seed ?? 0 };
}

/** Delete a private voice; an already-missing voice counts as deleted. */
export async function deleteHeyGenVoice(voiceId: string): Promise<void> {
  try {
    await heygen("DELETE", `/v3/voices/${encodeURIComponent(voiceId)}`);
  } catch (err) {
    if (err instanceof Error && /no longer exists/.test(err.message)) return;
    throw err;
  }
}
