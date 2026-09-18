import type { AspectRatio, GenerationResult } from "../types";
import type { PresenterClip } from "./heygen";

/**
 * HeyGen v3 avatar library.
 *
 * The public catalogue is organised as *groups* (people; ~1,400) each holding many *looks*
 * (outfit / setting / angle; ~25,000 in total). A look id is what `POST /v3/videos` takes
 * as `avatar_id`. Looks carry the avatar type (filmed studio avatar, digital twin, AI photo
 * avatar), their preferred orientation and the engines they support — which decides
 * whether we can ask for gesture direction (`motion_prompt`, Avatar V only for video
 * avatars).
 *
 * Groups are fetched once and cached for six hours (≈30 paged calls); looks are fetched
 * per group on demand and cached. Both caches are in-process; the app may also persist
 * the group snapshot so a restart does not refetch.
 */

const API = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com";
const key = () => process.env.HEYGEN_API_KEY ?? "";
export const isHeyGenLibraryConfigured = () => Boolean(process.env.HEYGEN_API_KEY);

export type AvatarType = "studio_avatar" | "digital_twin" | "photo_avatar";
export type Orientation = "portrait" | "landscape" | "square";

export type AvatarGroup = {
  id: string;
  name: string;
  gender?: "male" | "female";
  previewUrl?: string;
  looksCount: number;
  defaultVoiceId?: string;
  createdAt?: number;
};

export type AvatarLook = {
  id: string;
  groupId: string;
  name: string;
  type: AvatarType;
  gender?: "male" | "female";
  orientation?: Orientation;
  previewUrl?: string;
  previewVideoUrl?: string;
  tags: string[];
  engines: Array<"avatar_v" | "avatar_iv" | "avatar_iii">;
  defaultVoiceId?: string;
  width?: number;
  height?: number;
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "x-api-key": key(), accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HeyGen ${path.split("?")[0]} ${res.status}`);
  return (await res.json()) as T;
}

type Page<T> = { data?: T[]; has_more?: boolean; next_token?: string | null };

/** Walk a cursor-paginated v3 endpoint. */
async function paged<T>(path: string, max = 2000): Promise<T[]> {
  const out: T[] = [];
  let token: string | null | undefined;
  for (let i = 0; i < 200; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await api<Page<T>>(`${path}${sep}limit=50${token ? `&token=${encodeURIComponent(token)}` : ""}`);
    out.push(...(page.data ?? []));
    if (!page.has_more || !page.next_token || out.length >= max) break;
    token = page.next_token;
  }
  return out;
}

const gender = (g?: string | null) => (g === "male" || g === "female" ? g : undefined);

type RawGroup = { id: string; name: string; gender?: string | null; preview_image_url?: string | null; looks_count?: number; default_voice_id?: string | null; created_at?: number };
type RawLook = {
  id: string;
  group_id?: string | null;
  name: string;
  avatar_type: AvatarType;
  gender?: string | null;
  preferred_orientation?: string | null;
  preview_image_url?: string | null;
  preview_video_url?: string | null;
  tags?: string[];
  supported_api_engines?: string[];
  default_voice_id?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  status?: string;
};

const toGroup = (g: RawGroup): AvatarGroup => ({
  id: g.id,
  name: g.name,
  gender: gender(g.gender),
  previewUrl: g.preview_image_url ?? undefined,
  looksCount: g.looks_count ?? 0,
  defaultVoiceId: g.default_voice_id ?? undefined,
  createdAt: g.created_at,
});
const toLook = (l: RawLook): AvatarLook => ({
  id: l.id,
  groupId: l.group_id ?? "",
  name: l.name,
  type: l.avatar_type,
  gender: gender(l.gender),
  orientation: l.preferred_orientation === "portrait" || l.preferred_orientation === "landscape" || l.preferred_orientation === "square" ? l.preferred_orientation : undefined,
  previewUrl: l.preview_image_url ?? undefined,
  previewVideoUrl: l.preview_video_url ?? undefined,
  tags: l.tags ?? [],
  engines: (l.supported_api_engines ?? []).filter((e): e is AvatarLook["engines"][number] => e === "avatar_v" || e === "avatar_iv" || e === "avatar_iii"),
  defaultVoiceId: l.default_voice_id ?? undefined,
  width: l.image_width ?? undefined,
  height: l.image_height ?? undefined,
});

const SIX_HOURS = 6 * 60 * 60_000;
let groupCache: { at: number; list: AvatarGroup[] } | null = null;
let groupInflight: Promise<AvatarGroup[]> | null = null;
const lookCache = new Map<string, { at: number; list: AvatarLook[] }>();
const typeCache = new Map<AvatarType, { at: number; groupIds: Set<string> }>();

/** Seed the group cache from a snapshot the app persisted (skips ~30 API calls on boot). */
export function seedAvatarGroups(list: AvatarGroup[], fetchedAt: number) {
  if (!groupCache || groupCache.at < fetchedAt) groupCache = { at: fetchedAt, list };
}
export function avatarGroupsSnapshot(): { at: number; list: AvatarGroup[] } | null {
  return groupCache;
}

/** Every public avatar group (person), sorted by name. */
export async function listAvatarGroups(): Promise<AvatarGroup[]> {
  if (!isHeyGenLibraryConfigured()) return [];
  if (groupCache && Date.now() - groupCache.at < SIX_HOURS) return groupCache.list;
  if (!groupInflight) {
    groupInflight = paged<RawGroup>("/v3/avatars?ownership=public", 5000)
      .then((raw) => {
        const list = raw.map(toGroup).filter((g) => g.looksCount > 0).sort((a, b) => a.name.localeCompare(b.name));
        groupCache = { at: Date.now(), list };
        return list;
      })
      .finally(() => {
        groupInflight = null;
      });
  }
  try {
    return await groupInflight;
  } catch (err) {
    console.warn("[heygen] listAvatarGroups failed", err instanceof Error ? err.message : err);
    return groupCache?.list ?? [];
  }
}

/** Looks (outfits / settings / angles) for one group, completed ones only. */
export async function listGroupLooks(groupId: string): Promise<AvatarLook[]> {
  if (!isHeyGenLibraryConfigured()) return [];
  const hit = lookCache.get(groupId);
  if (hit && Date.now() - hit.at < SIX_HOURS) return hit.list;
  try {
    const raw = await paged<RawLook>(`/v3/avatars/looks?group_id=${encodeURIComponent(groupId)}`, 500);
    const list = raw.filter((l) => !l.status || l.status === "completed").map(toLook);
    lookCache.set(groupId, { at: Date.now(), list });
    return list;
  } catch (err) {
    console.warn("[heygen] listGroupLooks failed", err instanceof Error ? err.message : err);
    return hit?.list ?? [];
  }
}

/** One look by id (the `avatar_id` for video creation). */
export async function getLook(lookId: string): Promise<AvatarLook | null> {
  if (!isHeyGenLibraryConfigured()) return null;
  for (const c of lookCache.values()) {
    const found = c.list.find((l) => l.id === lookId);
    if (found) return found;
  }
  try {
    const res = await api<{ data?: RawLook }>(`/v3/avatars/looks/${encodeURIComponent(lookId)}`);
    return res.data ? toLook(res.data) : null;
  } catch {
    return null;
  }
}

/**
 * Group ids that have at least one look of a type — lets the picker filter people by
 * "filmed studio avatar" or "digital twin". Photo avatars are the bulk of the catalogue
 * (~20k looks) and are not enumerated; treat "not studio, not twin" as photo.
 */
export async function groupIdsByType(type: Exclude<AvatarType, "photo_avatar">): Promise<Set<string>> {
  const hit = typeCache.get(type);
  if (hit && Date.now() - hit.at < SIX_HOURS) return hit.groupIds;
  try {
    const raw = await paged<RawLook>(`/v3/avatars/looks?ownership=public&avatar_type=${type}`, 5000);
    const ids = new Set(raw.map((l) => l.group_id).filter((g): g is string => Boolean(g)));
    typeCache.set(type, { at: Date.now(), groupIds: ids });
    return ids;
  } catch (err) {
    console.warn("[heygen] groupIdsByType failed", err instanceof Error ? err.message : err);
    return hit?.groupIds ?? new Set();
  }
}

// ---------- rendering with a library look (v3) ----------

async function uploadAsset(bytes: Buffer, type: string, filename: string): Promise<string> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type }), filename);
  const res = await fetch(`${API}/v3/assets`, { method: "POST", headers: { "x-api-key": key() }, body: form, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HeyGen asset upload failed (${res.status}).`);
  const body = (await res.json()) as { data?: { asset_id?: string } };
  if (!body.data?.asset_id) throw new Error("HeyGen returned no asset ID.");
  return body.data.asset_id;
}

/**
 * Render a library look speaking our voice track via `POST /v3/videos` (`type: "avatar"`).
 * Looks that support Avatar V get it plus the motion prompt (gesture direction); others use
 * HeyGen's default Avatar IV, which rejects motion prompts for video avatars.
 */
export async function generateLibraryPresenter(
  req: { avatarId: string; audio?: Buffer; script?: string; voiceId?: string; ratio: AspectRatio; durationSec: number; motionPrompt?: string; background?: string },
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<GenerationResult<PresenterClip>> {
  if (!isHeyGenLibraryConfigured()) throw new Error("HeyGen is not connected. Add HEYGEN_API_KEY to use library presenters.");
  const started = Date.now();
  const look = await getLook(req.avatarId);
  const useV = look?.engines.includes("avatar_v") ?? false;
  if (!req.audio && !(req.script && req.voiceId)) throw new Error("A voice track or a script with a HeyGen voice is required.");
  const audioId = req.audio ? await uploadAsset(req.audio, "audio/mpeg", "voice.mp3") : null;
  const body: Record<string, unknown> = {
    type: "avatar",
    avatar_id: req.avatarId,
    ...(audioId ? { audio_asset_id: audioId } : { script: req.script, voice_id: req.voiceId }),
    aspect_ratio: req.ratio === "1.91:1" ? "16:9" : req.ratio,
    resolution: "1080p",
    title: "Adcraft presenter",
    ...(useV ? { engine: { type: "avatar_v" }, ...(req.motionPrompt ? { motion_prompt: req.motionPrompt } : {}) } : {}),
    ...(req.background ? { background: { type: "color", value: req.background } } : {}),
  };
  const res = await fetch(`${API}/v3/videos`, { method: "POST", headers: { "x-api-key": key(), "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HeyGen presenter generation failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const created = (await res.json()) as { data?: { video_id?: string } };
  const id = created.data?.video_id;
  if (!id) throw new Error("HeyGen returned no video ID.");
  const deadline = Date.now() + (opts.timeoutMs ?? 20 * 60_000);
  while (Date.now() < deadline) {
    const st = await api<{ data?: { status?: string; video_url?: string; duration?: number; failure_message?: string } }>(`/v3/videos/${encodeURIComponent(id)}`);
    const d = st.data;
    if (d?.status === "failed") throw new Error(`HeyGen could not render this presenter: ${d.failure_message ?? "try another look."}`);
    if (d?.status === "completed" && d.video_url) {
      return {
        output: { url: d.video_url, mimeType: "video/mp4", durationSec: d.duration ?? req.durationSec },
        usage: { provider: "heygen", model: useV ? "heygen-avatar-v" : "heygen-avatar-iv", durationMs: Date.now() - started, units: d.duration ?? req.durationSec },
      };
    }
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 5000));
  }
  throw new Error("Presenter render timed out. Check the HeyGen job before starting a new generation.");
}
