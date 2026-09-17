"use server";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, dbReady, aiModels } from "@adcraft/db";
import {
  BUILT_IN_MODELS,
  IMAGE_PRESETS,
  TEXT_PRESETS,
  VIDEO_PRESETS,
  downloadImage,
  generateImage,
  generateConceptsWith,
  generateVideo,
  getModel,
  type AspectRatio,
  type Capability,
  type ModelSpec,
  type ProviderName,
} from "@adcraft/ai";
import { requireAdmin } from "./admin";
import { logAudit } from "./audit";
import { getCatalog, hydrateModels, providerConnected } from "./model-catalog";

/**
 * Admin → Models. Every mutation writes an `ai_models` row; the catalog re-merges it on
 * the next request (see model-catalog.ts). Built-in models keep their id and kind; a row
 * for them only stores the fields the admin changed.
 */

const PROVIDERS: ProviderName[] = ["fal", "replicate", "runway", "openai", "anthropic"];
const KINDS: Capability[] = ["image", "video", "text"];
const RATIOS: AspectRatio[] = ["1:1", "4:5", "9:16", "16:9", "1.91:1"];

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = Number(str(f, k));
  return Number.isFinite(v) ? v : undefined;
};

function parseSpec(f: FormData, existing?: { id: string; kind: Capability }): { id: string; kind: Capability; spec: Partial<ModelSpec>; error?: string } {
  const id = (existing?.id ?? str(f, "id")).toLowerCase();
  const kind = existing?.kind ?? (str(f, "kind") as Capability);
  if (!/^[a-z0-9][a-z0-9._-]{1,60}$/.test(id)) return { id, kind, spec: {}, error: "Model id: lowercase letters, digits, dots, dashes; 2–60 characters." };
  if (!KINDS.includes(kind)) return { id, kind, spec: {}, error: "Choose a kind." };
  const provider = str(f, "provider") as ProviderName;
  if (!PROVIDERS.includes(provider)) return { id, kind, spec: {}, error: "Choose a provider." };
  const label = str(f, "label").slice(0, 60);
  if (!label) return { id, kind, spec: {}, error: "Give the model a label." };
  const presets = kind === "image" ? IMAGE_PRESETS : kind === "video" ? VIDEO_PRESETS : TEXT_PRESETS;
  const preset = str(f, "preset");
  if (!presets.some((p) => p.id === preset)) return { id, kind, spec: {}, error: "Choose an input preset." };
  const credits = num(f, "creditsPerUnit");
  if (credits === undefined || credits < 0) return { id, kind, spec: {}, error: "Credits per unit must be a number ≥ 0." };

  const endpoints: ModelSpec["endpoints"] = {};
  for (const k of ["text", "edit", "textToVideo", "imageToVideo"] as const) {
    const v = str(f, `endpoint.${k}`).slice(0, 200);
    if (v) endpoints[k] = v;
  }
  if (kind === "image" && provider === "fal" && !endpoints.text) return { id, kind, spec: {}, error: "fal image models need a text-to-image endpoint id." };
  if (kind === "image" && provider === "replicate" && !endpoints.text) return { id, kind, spec: {}, error: "Replicate image models need a model ref (owner/name or owner/name:version)." };
  if ((provider === "replicate" || provider === "runway") && f.get("promptOnly") === "on") endpoints.edit = "none";
  if (kind === "image" && provider === "runway" && !endpoints.text) endpoints.text = "gen4_image";
  if (kind === "video" && provider === "runway" && !endpoints.imageToVideo && !endpoints.textToVideo) endpoints.imageToVideo = "gen4_turbo";
  if (kind === "video" && !endpoints.textToVideo && !endpoints.imageToVideo) return { id, kind, spec: {}, error: "Video models need at least one endpoint id." };

  let options: Record<string, unknown> | undefined;
  const rawOptions = str(f, "options");
  if (rawOptions) {
    try {
      const parsed = JSON.parse(rawOptions);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      options = parsed;
    } catch {
      return { id, kind, spec: {}, error: "Extra options must be a JSON object, e.g. { \"quality\": \"low\" }." };
    }
  }

  const spec: Partial<ModelSpec> = {
    label,
    provider,
    preset: preset as ModelSpec["preset"],
    creditsPerUnit: credits,
    notes: str(f, "notes").slice(0, 200) || undefined,
    endpoints: Object.keys(endpoints).length ? endpoints : undefined,
    options,
    approxCostUsd: num(f, "approxCostUsd"),
    baseUrl: str(f, "baseUrl").slice(0, 200) || undefined,
    apiKeyEnv: str(f, "apiKeyEnv").replace(/[^A-Z0-9_]/g, "").slice(0, 60) || undefined,
    noSeed: f.get("noSeed") === "on" || undefined,
    maxPromptChars: num(f, "maxPromptChars") || undefined,
    maxImagesPerCall: f.get("singleImage") === "on" ? 1 : undefined,
  };
  if (kind === "video") {
    const durations = str(f, "durations")
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    const ratios = f.getAll("ratios").map(String).filter((r): r is AspectRatio => (RATIOS as string[]).includes(r));
    spec.video = {
      durationsSec: durations.length ? durations : [5],
      ratios: ratios.length ? ratios : ["9:16", "1:1", "16:9"],
      audio: f.get("audio") === "on",
      imageToVideo: Boolean(endpoints.imageToVideo),
    };
  }
  // Drop undefined so the row only stores what was set.
  for (const k of Object.keys(spec) as Array<keyof ModelSpec>) if (spec[k] === undefined) delete spec[k];
  return { id, kind, spec };
}

export async function saveModel(formData: FormData) {
  const admin = await requireAdmin();
  await dbReady;
  const existingId = str(formData, "existingId").toLowerCase();
  const builtIn = BUILT_IN_MODELS.find((m) => m.id === existingId);
  const [stored] = existingId ? await db.select().from(aiModels).where(eq(aiModels.id, existingId)).limit(1) : [];
  const existing = builtIn ? { id: builtIn.id, kind: builtIn.kind } : stored ? { id: stored.id, kind: stored.kind as Capability } : undefined;
  const parsed = parseSpec(formData, existing);
  if (parsed.error) redirect(`/admin/models?error=${encodeURIComponent(parsed.error)}&edit=${encodeURIComponent(existingId || "new")}`);
  const enabled = formData.get("enabled") !== "off";
  const [current] = await db.select().from(aiModels).where(eq(aiModels.id, parsed.id)).limit(1);
  await db
    .insert(aiModels)
    .values({ id: parsed.id, kind: parsed.kind as "text" | "image" | "video", spec: parsed.spec, enabled, isDefault: current?.isDefault ?? false, updatedBy: admin.userId })
    .onConflictDoUpdate({ target: aiModels.id, set: { spec: parsed.spec, enabled, updatedBy: admin.userId, updatedAt: new Date() } });
  await logAudit(null, admin.userId, current ? "admin.model_updated" : "admin.model_added", "ai_model", parsed.id, { spec: parsed.spec, enabled });
  redirect(`/admin/models?ok=saved&model=${encodeURIComponent(parsed.id)}`);
}

export async function toggleModel(formData: FormData) {
  const admin = await requireAdmin();
  await dbReady;
  const id = str(formData, "id");
  const enabled = str(formData, "enabled") === "1";
  const kind = getModel(id)?.kind ?? (BUILT_IN_MODELS.find((m) => m.id === id)?.kind as Capability | undefined);
  if (!kind) redirect("/admin/models?error=Unknown+model");
  await db
    .insert(aiModels)
    .values({ id, kind: kind as "text" | "image" | "video", spec: {}, enabled, updatedBy: admin.userId })
    .onConflictDoUpdate({ target: aiModels.id, set: { enabled, updatedBy: admin.userId, updatedAt: new Date() } });
  await logAudit(null, admin.userId, enabled ? "admin.model_enabled" : "admin.model_disabled", "ai_model", id);
  redirect(`/admin/models?ok=${enabled ? "enabled" : "disabled"}&model=${encodeURIComponent(id)}`);
}

export async function setDefaultModel(formData: FormData) {
  const admin = await requireAdmin();
  await hydrateModels();
  const id = str(formData, "id");
  const spec = getModel(id);
  if (!spec) redirect("/admin/models?error=Unknown+model");
  await db.transaction(async (tx) => {
    await tx.update(aiModels).set({ isDefault: false }).where(and(eq(aiModels.kind, spec.kind as "text" | "image" | "video"), ne(aiModels.id, id)));
    await tx
      .insert(aiModels)
      .values({ id, kind: spec.kind as "text" | "image" | "video", spec: {}, enabled: true, isDefault: true, updatedBy: admin.userId })
      .onConflictDoUpdate({ target: aiModels.id, set: { isDefault: true, enabled: true, updatedBy: admin.userId, updatedAt: new Date() } });
  });
  await logAudit(null, admin.userId, "admin.model_default", "ai_model", id, { kind: spec.kind });
  redirect(`/admin/models?ok=default&model=${encodeURIComponent(id)}`);
}

export async function deleteModel(formData: FormData) {
  const admin = await requireAdmin();
  await dbReady;
  const id = str(formData, "id");
  const builtIn = BUILT_IN_MODELS.some((m) => m.id === id);
  // Built-ins cannot be deleted; removing their row resets them to the shipped spec.
  await db.delete(aiModels).where(eq(aiModels.id, id));
  await logAudit(null, admin.userId, builtIn ? "admin.model_reset" : "admin.model_deleted", "ai_model", id);
  redirect(`/admin/models?ok=${builtIn ? "reset" : "deleted"}`);
}

export type ModelTestResult =
  | { ok: true; kind: Capability; ms: number; costUsd?: number; preview?: string; text?: string }
  | { ok: false; error: string };

/**
 * Smoke-test a model with a tiny real request so an admin can confirm an endpoint id
 * and preset before customers see it. Image: one 1:1 picture (returned as a small
 * data-URI thumbnail). Text: a two-concept brief. Video: a 5 s clip (real cost).
 */
export async function testModel(id: string): Promise<ModelTestResult> {
  await requireAdmin();
  const catalog = await getCatalog();
  const spec = catalog.get(id);
  if (!spec) return { ok: false, error: "Unknown model." };
  if (!providerConnected(spec)) return { ok: false, error: `${spec.provider} is not connected on this server (${spec.apiKeyEnv ?? "missing API key"}).` };
  const started = Date.now();
  try {
    if (spec.kind === "image") {
      const { output, usage } = await generateImage({ model: spec.id, prompt: "A single ripe red apple on a pale linen tablecloth, soft window light, product photography.", ratio: "1:1", count: 1 });
      const first = output[0];
      if (!first) return { ok: false, error: "The model returned no image." };
      const sharp = (await import("sharp")).default;
      const png = await sharp(await downloadImage(first)).resize({ width: 320, height: 320, fit: "inside" }).png().toBuffer();
      return { ok: true, kind: "image", ms: Date.now() - started, costUsd: usage.costUsd, preview: `data:image/png;base64,${png.toString("base64")}` };
    }
    if (spec.kind === "video") {
      const { output, usage } = await generateVideo({ model: spec.id, prompt: "Slow push-in on a glass of water on a wooden table, morning light.", ratio: "1:1", durationSec: 5 });
      return { ok: true, kind: "video", ms: Date.now() - started, costUsd: usage.costUsd, text: output.url ? "Clip generated." : "No clip url returned." };
    }
    const { output, usage } = await generateConceptsWith(
      {
        brand: { name: "Adcraft test brand", tone: ["warm", "direct"] },
        product: { name: "Everyday water bottle", description: "A 750 ml insulated steel bottle that keeps drinks cold for 24 hours." },
        objective: "conversion",
        audience: "Commuters and gym-goers",
        platforms: ["meta"],
        formats: ["static"],
        count: 2,
      },
      spec.id,
    );
    const first = output.concepts?.[0];
    return {
      ok: true,
      kind: "text",
      ms: Date.now() - started,
      costUsd: usage.costUsd,
      text: first ? `${output.concepts.length} concepts · "${first.headline}" — ${first.hook}` : "Structured output returned, no concepts.",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 400) : String(err) };
  }
}
