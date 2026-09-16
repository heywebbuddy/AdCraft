import { and, eq } from "drizzle-orm";
import { db, dbReady, creatives, creditLedger, generationEvents, renders, variants } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import type { Usage } from "@adcraft/ai";
import { normalizeVideoDocument, renderVideo, type VideoAsset, type VideoDocument, type VideoRatio } from "@adcraft/render/video";

/**
 * Helpers shared by the product-video and UGC pipelines: storage, generation events,
 * credits and the Remotion assembly step.
 */

export const VIDEO_ENGINE = "remotion-local";

export type Db = typeof db;

// ---------- storage ----------

/** Reads a document asset (storage key or /api/files URL) into bytes for the renderer / providers. */
export async function loadVideoAsset(asset: VideoAsset): Promise<Buffer | null> {
  const key = asset.key ?? (asset.url?.startsWith("/api/files/") ? asset.url.slice("/api/files/".length) : undefined);
  if (!key) {
    if (asset.url?.startsWith("data:")) return Buffer.from(asset.url.slice(asset.url.indexOf(",") + 1), "base64");
    return null;
  }
  const obj = await getStorage().get(key);
  return obj?.body ?? null;
}

export async function storeRender(orgId: string, bytes: Buffer, ext: "mp4" | "png" | "mp3", contentType: string): Promise<string> {
  const key = objectKey(orgId, "renders", ext);
  await getStorage().put(key, bytes, { contentType });
  return key;
}

// ---------- documents ----------

export async function loadVideoCreative(orgId: string, creativeId: string) {
  await dbReady;
  const [creative] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  if (!creative) throw new Error(`Creative ${creativeId} not found in org ${orgId}`);
  if (creative.kind !== "video" && creative.kind !== "ugc") throw new Error(`Creative ${creativeId} is ${creative.kind}, not a video`);
  const doc = normalizeVideoDocument({ ...(creative.document as Partial<VideoDocument>), kind: creative.kind });
  return { creative, doc };
}

export async function saveVideoDocument(creativeId: string, doc: VideoDocument) {
  await db.update(creatives).set({ document: doc as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(creatives.id, creativeId));
}

// ---------- generation events ----------

export type EventInput = {
  orgId: string;
  creativeId: string;
  capability: "image" | "video" | "presenter" | "voice" | "text";
  provider: string;
  model: string;
  credits?: number;
  label: string;
  detail: string;
  step: string;
  meta?: Record<string, unknown>;
};

/** Insert a "started" event. The studio's progress UI lists these per creative. */
export async function startEvent(input: EventInput): Promise<string> {
  const [row] = await db
    .insert(generationEvents)
    .values({
      orgId: input.orgId,
      creativeId: input.creativeId,
      capability: input.capability,
      provider: input.provider,
      model: input.model,
      status: "started",
      credits: input.credits ?? 0,
      meta: { label: input.label, detail: input.detail, step: input.step, ...(input.meta ?? {}) },
    })
    .returning({ id: generationEvents.id, meta: generationEvents.meta });
  return row!.id;
}

export async function succeedEvent(eventId: string, usage: Usage | null, meta: Record<string, unknown> = {}, credits?: number) {
  const [current] = await db.select({ meta: generationEvents.meta }).from(generationEvents).where(eq(generationEvents.id, eventId)).limit(1);
  await db
    .update(generationEvents)
    .set({
      status: "succeeded",
      ...(usage
        ? {
            model: usage.model,
            durationMs: usage.durationMs,
            costUsd: (usage.costUsd ?? 0).toFixed(6),
            units: usage.units !== undefined ? usage.units.toFixed(4) : undefined,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          }
        : {}),
      ...(credits !== undefined ? { credits } : {}),
      meta: { ...(current?.meta ?? {}), ...meta },
    })
    .where(eq(generationEvents.id, eventId));
}

export async function failEvent(eventId: string, err: unknown, startedAt?: number) {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(generationEvents)
    .set({ status: "failed", error: message.slice(0, 2000), ...(startedAt ? { durationMs: Date.now() - startedAt } : {}) })
    .where(eq(generationEvents.id, eventId));
}

/** Update the root event's `step`/`detail` so the storyboard can show where the run is. */
export async function setEventStep(eventId: string, step: string, detail: string, extra: Record<string, unknown> = {}) {
  const [current] = await db.select({ meta: generationEvents.meta }).from(generationEvents).where(eq(generationEvents.id, eventId)).limit(1);
  await db.update(generationEvents).set({ meta: { ...(current?.meta ?? {}), step, detail, ...extra } }).where(eq(generationEvents.id, eventId));
}

/** Run one provider call under its own generation event. */
export async function withEvent<T extends { usage: Usage }>(input: EventInput, fn: () => Promise<T>, meta?: (r: T) => Record<string, unknown>): Promise<T> {
  const startedAt = Date.now();
  const eventId = await startEvent(input);
  try {
    const result = await fn();
    await succeedEvent(eventId, result.usage, meta?.(result));
    return result;
  } catch (err) {
    await failEvent(eventId, err, startedAt);
    throw err;
  }
}

// ---------- credits ----------

/** Deduct credits once per event (unique on org + reason + referenceId). */
export async function chargeCredits(orgId: string, credits: number, eventId: string, meta: Record<string, unknown>) {
  if (credits <= 0) return;
  await db
    .insert(creditLedger)
    .values({ orgId, delta: -credits, reason: "generation", referenceId: eventId, meta })
    .onConflictDoNothing();
}

// ---------- assembly ----------

export type AssembleResult = { variantId: string; ratio: string; status: "succeeded" | "failed"; renderId: string; outputKey?: string; error?: string };

/** Render the document at every variant ratio with Remotion and write `renders` rows. */
export async function assembleVariants(orgId: string, creativeId: string, doc: VideoDocument, onVariant?: (r: AssembleResult) => Promise<void> | void): Promise<AssembleResult[]> {
  const vs = await db.select().from(variants).where(eq(variants.creativeId, creativeId)).orderBy(variants.createdAt);
  const results: AssembleResult[] = [];
  for (const v of vs) {
    const ratio = (["9:16", "1:1", "16:9", "4:5"].includes(v.ratio) ? v.ratio : "9:16") as VideoRatio;
    const [row] = await db
      .insert(renders)
      .values({ orgId, variantId: v.id, status: "running", engine: VIDEO_ENGINE, meta: { placementId: v.placementId, ratio, kind: doc.kind, model: doc.model } })
      .returning({ id: renders.id });
    const startedAt = Date.now();
    try {
      const mp4 = await renderVideo(doc, { ratio, loadAsset: loadVideoAsset });
      const key = await storeRender(orgId, mp4, "mp4", "video/mp4");
      await db
        .update(renders)
        .set({
          status: "succeeded",
          outputKey: key,
          mimeType: "video/mp4",
          fileBytes: mp4.byteLength,
          error: null,
          meta: { placementId: v.placementId, ratio, kind: doc.kind, model: doc.model, durationMs: Date.now() - startedAt, width: v.width, height: v.height },
        })
        .where(eq(renders.id, row!.id));
      const r: AssembleResult = { variantId: v.id, ratio, status: "succeeded", renderId: row!.id, outputKey: key };
      results.push(r);
      await onVariant?.(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(renders)
        .set({ status: "failed", error: message.slice(0, 2000), meta: { placementId: v.placementId, ratio, kind: doc.kind, model: doc.model, durationMs: Date.now() - startedAt } })
        .where(eq(renders.id, row!.id));
      console.error(`[${doc.kind}.assemble] ${creativeId} ${v.placementId} failed`, err);
      const r: AssembleResult = { variantId: v.id, ratio, status: "failed", renderId: row!.id, error: message };
      results.push(r);
      await onVariant?.(r);
    }
  }
  await db.update(creatives).set({ updatedAt: new Date() }).where(eq(creatives.id, creativeId));
  return results;
}

// ---------- scene stills (image provider) ----------

/**
 * Generate a scene still through the image provider exported from @adcraft/ai. Tolerates
 * both result shapes ({ png } and MediaRef[] with bytes/url) and falls back to a gradient
 * PNG so the video pipeline never blocks on the image adapter.
 */
export async function generateSceneStill(req: {
  model?: string;
  prompt: string;
  ratio: VideoRatio;
  reference?: { bytes: Buffer; mimeType?: string } | null;
  seed?: number;
}): Promise<{ png: Buffer; usage: Usage }> {
  const startedAt = Date.now();
  const ai = (await import("@adcraft/ai")) as Record<string, unknown>;
  const generateImage = ai.generateImage as ((r: Record<string, unknown>) => Promise<{ output: unknown; usage: Usage }>) | undefined;
  const modelId = req.model ?? (typeof ai.defaultModel === "function" ? (ai.defaultModel as (k: string) => { id: string })("image").id : "nano-banana-pro");
  const fallbackUsage: Usage = { provider: "fal", model: modelId, durationMs: 0, costUsd: 0, credits: 0, units: 1 };

  if (typeof generateImage === "function") {
    const res = await generateImage({
      model: modelId,
      prompt: req.prompt,
      ratio: req.ratio,
      count: 1,
      seed: req.seed,
      references: req.reference ? [{ url: `data:${req.reference.mimeType ?? "image/png"};base64,${req.reference.bytes.toString("base64")}`, mimeType: req.reference.mimeType ?? "image/png", bytes: req.reference.bytes }] : [],
    });
    const out = res.output as { png?: Buffer } | Array<{ bytes?: Buffer; url?: string }>;
    if (Array.isArray(out)) {
      const first = out[0];
      if (first?.bytes) return { png: Buffer.from(first.bytes), usage: res.usage };
      if (first?.url) {
        const bytes = first.url.startsWith("data:")
          ? Buffer.from(first.url.slice(first.url.indexOf(",") + 1), "base64")
          : Buffer.from(await (await fetch(first.url)).arrayBuffer());
        return { png: bytes, usage: res.usage };
      }
    } else if (out?.png) {
      return { png: Buffer.from(out.png), usage: res.usage };
    }
  }

  // Fallback: brand-neutral gradient with the prompt burned in.
  const sharp = (await import("sharp")).default;
  const size = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080], "4:5": [1080, 1350] }[req.ratio] ?? [1080, 1920];
  let h = 0;
  for (const ch of req.prompt) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 82%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 45% 38%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { png, usage: { ...fallbackUsage, durationMs: Date.now() - startedAt } };
}

/** Motion prompt for image-to-video: the scene prompt plus a gentle camera direction. */
export function motionPrompt(scene: { prompt: string; line: string }, productName: string | null): string {
  const base = scene.prompt || scene.line;
  const camera = ["slow push in", "gentle handheld drift", "subtle parallax, soft light shifting", "slow orbit around the product"][Math.abs(hashCode(base)) % 4];
  return `${base}. ${productName ? `The ${productName} stays sharp, unchanged and in frame. ` : ""}${camera}, photoreal, ad-quality, no text.`;
}

function hashCode(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
