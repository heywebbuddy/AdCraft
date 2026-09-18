/**
 * New looks for an avatar we own, on HeyGen (v3).
 *
 * HeyGen dresses an avatar in curated *Look Packs* (five coordinated looks around a theme),
 * single *templates* (two looks), or a free-text prompt (one look). All three need a look
 * HeyGen owns as the identity reference, so a character created with our own image models
 * is first registered as a HeyGen *photo avatar* from its portrait (`POST /v3/avatars`,
 * `type: "photo"`) — once per character; the resulting look id is remembered.
 *
 * Every generated look is a HeyGen `avatar_id`: it renders through `POST /v3/videos`
 * (Avatar IV / V with gesture direction) instead of an image upload.
 */

const API = process.env.HEYGEN_API_BASE ?? "https://api.heygen.com";
const key = () => process.env.HEYGEN_API_KEY ?? "";

export type LookPackKind = "style" | "role";
export type LookPack = {
  id: string;
  name: string;
  kind: LookPackKind;
  description: string;
  /** Swatches as a fallback while the preview loads. */
  palette: [string, string, string];
  templates: { female: string; male: string };
  /** HeyGen's own thumbnails: each template id resolves as a look with a preview image. */
  previews: { female: string; male: string };
  looks: number;
  type: "look_pack" | "template";
};

/** HeyGen's gallery packs and single templates that the API resolves for any workspace. */
export const LOOK_PACKS: LookPack[] = [
  { id: "modern-corporate", name: "Modern Corporate", kind: "style", description: "Tailored blazers, crisp shirts and a neutral studio — the boardroom-ready set.", palette: ["#1f2a3a", "#c9d1dc", "#f3f1ec"], templates: { female: "5a8e6be843ee4321a014946bf62aa322", male: "5e659e76755d47fd9160a2d7dedce124" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/modern_corporate_female/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/modern_corporate_male/profile.png" }, looks: 5, type: "look_pack" },
  { id: "stylish-business-casual", name: "Stylish Business-Casual", kind: "style", description: "Knits, open collars and relaxed layers; approachable but still polished.", palette: ["#6b5b4a", "#d9c7ae", "#eee9df"], templates: { female: "e1650a9029d04ea1a350421c163295fd", male: "a5f8e0c0cb654c1a83c695629b173af5" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/stylish_business_casual_female/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/stylish_business_casual_male/profile.png" }, looks: 5, type: "look_pack" },
  { id: "scandinavian-minimal", name: "Scandinavian Minimal", kind: "style", description: "Muted tones, clean lines, soft daylight — calm and considered.", palette: ["#9a9d96", "#dcdad2", "#f7f6f2"], templates: { female: "e7b000e2cb0d44f1a2d2f291a38b395a", male: "9600f78f27bb49d792e1c56ce624b929" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/scandinavian_minimal_female/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/scandinavian_minimal_male/profile.png" }, looks: 5, type: "look_pack" },
  { id: "cool-tech-slate", name: "Cool Tech / Slate", kind: "style", description: "Charcoal and slate wardrobe with cool light; built for product and SaaS stories.", palette: ["#2b3238", "#5f6b75", "#c5ccd2"], templates: { female: "d7ad40ec97d4459a92b33398b57caf4e", male: "fbd03fc3603a4e3caff594f5743a1733" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/cool_tech_slate_female/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/cool_tech_slate_male/profile.png" }, looks: 5, type: "look_pack" },
  { id: "healthcare", name: "Healthcare", kind: "role", description: "Scrubs, white coats and clinic settings for health, wellness and pharma.", palette: ["#2f6f8f", "#bfe0ea", "#f2f8fa"], templates: { female: "14f4070bd5a04eb6b1f82ae087cd0f30", male: "ce706bfa8556401e8c4401765102a455" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/healthcare_female_jin/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/healthcare_male_ren/profile.png" }, looks: 5, type: "look_pack" },
  { id: "keynote-power-presenter", name: "Keynote Power Presenter", kind: "role", description: "On stage under keynote lighting — launches, announcements, big claims.", palette: ["#1a1a1f", "#7a4bd6", "#e8e2f7"], templates: { female: "b0cae4fbae384ab9ab9a8e73ba504be8", male: "71e84769162d4f4186563ad9e0fc45b8" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/keynote_power_presenter_female/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/keynote_power_presenter_male/profile.png" }, looks: 5, type: "look_pack" },
  { id: "fitness", name: "Fitness", kind: "role", description: "Athletic wear in gyms and studios for fitness, nutrition and active brands.", palette: ["#2f3b2e", "#8fbf6a", "#e9f1e2"], templates: { female: "935ea0b7cdde4e6eb5a198a3d666f677", male: "daeb8b15c92a4acf9ffb437ba5534458" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/fitness_nutrition_female/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/fitness_nutrition_male/profile.png" }, looks: 5, type: "look_pack" },
  { id: "automotive-dealership", name: "Automotive Dealership", kind: "role", description: "Showroom floors and service bays for dealerships and automotive services.", palette: ["#3a3f47", "#b5322f", "#e6e6e6"], templates: { female: "6f183d726933457c9035fc0aa4e9c0c3", male: "8595c78b466c4e51802731229c59b6e7" }, previews: { female: "https://resource2.heygen.ai/avatar_remix_template/3ec974e0-b5f9-4400-a194-f47f5957b79c/profile.png", male: "https://resource2.heygen.ai/avatar_remix_template/a3637423-403b-4f54-88a2-b2cdc2115553/profile.png" }, looks: 5, type: "look_pack" },
  { id: "business-casual", name: "Business Casual", kind: "style", description: "One outfit, two angles: smart-casual against a plain backdrop.", palette: ["#4d5a6b", "#c7b8a2", "#f1eee8"], templates: { female: "b30c83d99cec48e09c8f5b07ed8aa38c", male: "2dc326030e2e4471babcc9eda56131b6" }, previews: { female: "https://resource2.heygen.ai/public-avatars/Margot/paos/angles/Office_9.jpg", male: "https://resource2.heygen.ai/public-avatars/Kacper/paos/angles/Office_3.jpg" }, looks: 2, type: "template" },
  { id: "podcast", name: "Podcast", kind: "role", description: "At the mic in a warm studio — interview and talk-show framing.", palette: ["#3b2a22", "#d98d4b", "#f4e6d6"], templates: { female: "00c49daa4eb94386a0c12508043bab17", male: "0e52ceafe4d5456fb83c1e39899ff76a" }, previews: { female: "https://resource2.heygen.ai/public-avatars/Margot/lookpack/stills/Studio_Streamer_3.jpg", male: "https://resource2.heygen.ai/public-avatars/Kacper/lookpack/angles/Studio_Streamer_3.jpg" }, looks: 2, type: "template" },
];

export const findLookPack = (id: string) => LOOK_PACKS.find((p) => p.id === id) ?? null;

export type OwnedLookStatus = { id: string; status: "processing" | "completed" | "failed"; previewUrl?: string; name?: string; groupId?: string; engines: string[]; error?: string };

type RawLook = { id: string; name?: string; group_id?: string | null; status?: string | null; preview_image_url?: string | null; supported_api_engines?: string[]; error?: { code?: string; message?: string } | null; failure_message?: string | null };

async function heygen<T>(method: string, path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  if (!key()) throw new Error("HeyGen is not connected.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "x-api-key": key(), accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = "";
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(message ? `HeyGen: ${message}` : `HeyGen ${path.split("?")[0]} failed (${res.status}).`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const toStatus = (l: RawLook): OwnedLookStatus => ({
  id: l.id,
  status: l.status === "completed" ? "completed" : l.status === "failed" ? "failed" : "processing",
  previewUrl: l.preview_image_url ?? undefined,
  name: l.name,
  groupId: l.group_id ?? undefined,
  engines: l.supported_api_engines ?? [],
  error: l.error?.message ?? l.failure_message ?? undefined,
});

/** Register a portrait as a HeyGen photo avatar. Returns the look (identity reference) and its character. */
export async function createPhotoAvatar(req: { name: string; image: Buffer; mimeType: string }): Promise<{ lookId: string; groupId: string }> {
  const res = await heygen<{ data?: { avatar_item?: { id?: string; group_id?: string }; avatar_group?: { id?: string } } }>(
    "POST",
    "/v3/avatars",
    { type: "photo", name: req.name.slice(0, 100), file: { type: "base64", media_type: req.mimeType, data: req.image.toString("base64") } },
    120_000,
  );
  const lookId = res.data?.avatar_item?.id;
  const groupId = res.data?.avatar_group?.id ?? res.data?.avatar_item?.group_id;
  if (!lookId || !groupId) throw new Error("HeyGen did not return the new avatar.");
  return { lookId, groupId };
}

/** Apply a Look Pack (five looks) or a single template (two looks) to a look we own. */
export async function generatePackLooks(req: { referenceLookId: string; templateId: string; type: "look_pack" | "template"; aspectRatio?: "16:9" | "9:16"; idempotencyKey?: string }): Promise<{ groupId?: string; lookIds: string[] }> {
  const res = await fetch(`${API}/v3/avatars/looks`, {
    method: "POST",
    headers: { "x-api-key": key(), "content-type": "application/json", accept: "application/json", ...(req.idempotencyKey ? { "Idempotency-Key": req.idempotencyKey } : {}) },
    body: JSON.stringify({ type: req.type, reference_look_id: req.referenceLookId, template_id: req.templateId, ...(req.type === "look_pack" && req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}) }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = "";
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(message ? `HeyGen: ${message}` : `HeyGen look generation failed (${res.status}).`);
  }
  const body = JSON.parse(text) as { data?: { group_id?: string; looks?: Array<{ id: string }> } };
  const lookIds = (body.data?.looks ?? []).map((l) => l.id);
  if (!lookIds.length) throw new Error("HeyGen started no looks.");
  return { groupId: body.data?.group_id, lookIds };
}

/** One new look from a description, keeping the referenced look's face. */
export async function generatePromptLook(req: { referenceLookId: string; name: string; prompt: string; aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5" | "auto" }): Promise<string> {
  const res = await heygen<{ data?: { avatar_item?: { id?: string } } }>(
    "POST",
    "/v3/avatars",
    { type: "prompt", name: req.name.slice(0, 100), prompt: req.prompt.slice(0, 1000), avatar_id: req.referenceLookId, ...(req.aspectRatio ? { aspect_ratio: req.aspectRatio } : {}) },
    120_000,
  );
  const id = res.data?.avatar_item?.id;
  if (!id) throw new Error("HeyGen did not return the new look.");
  return id;
}

/** Status of a look we own (uncached; polled while it trains). */
export async function getOwnedLook(lookId: string): Promise<OwnedLookStatus> {
  const res = await heygen<{ data?: RawLook }>("GET", `/v3/avatars/looks/${encodeURIComponent(lookId)}`);
  if (!res.data) throw new Error("That look no longer exists on HeyGen.");
  return toStatus(res.data);
}

/** Poll a set of looks until each is completed or failed (or the deadline passes). */
export async function waitForLooks(lookIds: string[], opts: { pollMs?: number; timeoutMs?: number; onUpdate?: (done: number) => void } = {}): Promise<OwnedLookStatus[]> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  const results = new Map<string, OwnedLookStatus>();
  while (Date.now() < deadline) {
    for (const id of lookIds) {
      if (results.get(id)?.status === "completed" || results.get(id)?.status === "failed") continue;
      results.set(id, await getOwnedLook(id));
    }
    const done = [...results.values()].filter((l) => l.status !== "processing").length;
    opts.onUpdate?.(done);
    if (done === lookIds.length) break;
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 6000));
  }
  return lookIds.map((id) => results.get(id) ?? { id, status: "processing", engines: [] });
}
