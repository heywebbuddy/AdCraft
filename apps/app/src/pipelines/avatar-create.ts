import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, dbReady, characters, generationEvents, brandVoices } from "@adcraft/db";
import { createDigitalTwin, createPhotoAvatarFromAsset, createPromptAvatar, createConsentLink, getHeyGenVoice, uploadHeyGenAsset, waitForLooks } from "@adcraft/ai";
import { getStorage, objectKey } from "@adcraft/storage";
import { registerJob, type JobPayloads } from "@/server/jobs";
import { refundGenerationCredits } from "@/server/generation-credits";
import { storeBrandVoiceSample } from "@/server/brand-voices";

/**
 * A character born on HeyGen rather than from our image models:
 *
 * - `digital_twin`: footage of a real person → HeyGen trains a twin and clones the voice from
 *   the same recording. The twin cannot render until the subject records consent, so the
 *   job also issues the consent link (valid 24 h) and stores it on the character.
 * - `photo`: one image → a photo avatar (no consent step).
 * - `prompt`: a description → a synthetic character.
 *
 * The finished look's preview becomes the character's portrait and first look, carrying its
 * HeyGen `avatar_id` so ads render through `POST /v3/videos` with Avatar V motion.
 */
export async function runAvatarCreatePipeline(data: JobPayloads["avatar.create"]) {
  await dbReady;
  const [character] = await db.update(characters).set({ status: "generating", updatedAt: new Date() }).where(and(eq(characters.id, data.characterId), eq(characters.orgId, data.orgId), eq(characters.generationId, data.eventId), eq(characters.status, "queued"))).returning();
  if (!character) return;
  const started = Date.now();
  const storage = getStorage();
  const setStep = (step: string) => db.update(generationEvents).set({ meta: { ...(data.meta ?? {}), step } }).where(eq(generationEvents.id, data.eventId));
  try {
    // 1. Create on HeyGen.
    let created;
    if (data.type === "prompt") {
      await setStep("Generating the character");
      created = await createPromptAvatar({ name: character.name, prompt: data.prompt ?? character.description, aspectRatio: data.aspectRatio ?? "9:16" });
    } else {
      if (!data.sourceKey) throw new Error("The uploaded file is missing.");
      const file = await storage.get(data.sourceKey);
      if (!file) throw new Error("The uploaded file is no longer available.");
      await setStep(data.type === "digital_twin" ? "Uploading the footage to HeyGen" : "Uploading the photo to HeyGen");
      const assetId = await uploadHeyGenAsset(file.body, file.contentType, data.type === "digital_twin" ? "footage.mp4" : "portrait.png");
      await setStep(data.type === "digital_twin" ? "Training the digital twin" : "Building the avatar");
      created = data.type === "digital_twin" ? await createDigitalTwin({ name: character.name, assetId, idempotencyKey: `adcraft-${data.eventId}` }) : await createPhotoAvatarFromAsset({ name: character.name, assetId });
    }
    const heygen: NonNullable<typeof character.heygen> = { groupId: created.groupId, lookId: created.lookId, type: data.type, consent: data.type === "digital_twin" ? "pending" : "not_required", clonedVoiceId: data.type === "digital_twin" ? created.voiceId : undefined };
    await db.update(characters).set({ heygen, updatedAt: new Date() }).where(eq(characters.id, character.id));

    // 2. Twins: issue the consent link straight away so the subject can record while training runs.
    if (data.type === "digital_twin") {
      try {
        const consent = await createConsentLink(created.groupId, data.rerouteUrl);
        heygen.consentUrl = consent.url;
        heygen.consentUrlAt = Date.now();
        heygen.consent = consent.status === "not_required" ? "pending" : consent.status;
        await db.update(characters).set({ heygen, updatedAt: new Date() }).where(eq(characters.id, character.id));
      } catch (err) {
        console.warn("[avatar] consent link failed", err instanceof Error ? err.message : err);
      }
      // The cloned voice belongs to this brand.
      if (created.voiceId) {
        await db.insert(brandVoices).values({ orgId: data.orgId, brandId: character.brandId, voiceId: created.voiceId, name: `${character.name} (cloned from footage)`, kind: "clone", status: "processing" }).onConflictDoNothing();
      }
    }

    // 3. Wait for training. Twins can take a while; the look status is the signal.
    const [look] = await waitForLooks([created.lookId], { pollMs: data.type === "digital_twin" ? 15_000 : 6_000, timeoutMs: data.type === "digital_twin" ? 90 * 60_000 : 15 * 60_000, onUpdate: () => void setStep(data.type === "digital_twin" ? "Training the digital twin — this can take a while" : "Building the avatar") });
    if (look?.status === "failed") throw new Error(look.error ? `HeyGen could not create this avatar: ${look.error}` : "HeyGen could not create this avatar.");
    if (look?.status !== "completed" || !look.previewUrl) throw new Error("HeyGen is still training this avatar. Check back later — nothing more is needed from you.");

    // 4. Its preview is the portrait and first look.
    const res = await fetch(look.previewUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error("Could not fetch the avatar preview from HeyGen.");
    const sharp = (await import("sharp")).default;
    const bytes = await sharp(Buffer.from(await res.arrayBuffer())).rotate().png().toBuffer();
    const imageKey = objectKey(data.orgId, "renders", "png");
    await storage.put(imageKey, bytes, { contentType: "image/png" });
    const lookName = data.type === "digital_twin" ? "As filmed" : data.type === "photo" ? "From photo" : "Original";

    // Twin voice: once the clone reports complete, keep its sample and make it the character's voice.
    let voiceId = character.voiceId;
    if (data.type === "digital_twin" && created.voiceId) {
      try {
        const v = await getHeyGenVoice(created.voiceId);
        if (v.status !== "failed") {
          const sampleKey = v.previewUrl ? await storeBrandVoiceSample(data.orgId, created.voiceId, v.previewUrl).catch(() => null) : null;
          await db.update(brandVoices).set({ status: v.status === "complete" ? "ready" : "processing", gender: v.gender ?? null, language: v.language ?? null, sampleKey, updatedAt: new Date() }).where(and(eq(brandVoices.orgId, data.orgId), eq(brandVoices.voiceId, created.voiceId)));
          voiceId = created.voiceId;
        }
      } catch {
        /* keep the fallback voice */
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(characters).set({ portraitKey: imageKey, voiceId, looks: [{ id: randomUUID(), name: lookName, imageKey, prompt: data.prompt ?? "", model: `heygen-${data.type}`, heygenLookId: created.lookId }], heygen, status: "ready", error: null, updatedAt: new Date() }).where(and(eq(characters.id, character.id), eq(characters.generationId, data.eventId)));
      await tx.update(generationEvents).set({ status: "succeeded", durationMs: Date.now() - started, units: "1", meta: { ...(data.meta ?? {}), step: "done" } }).where(eq(generationEvents.id, data.eventId));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Avatar creation failed";
    await db.update(characters).set({ status: "failed", error: message, updatedAt: new Date() }).where(and(eq(characters.id, character.id), eq(characters.generationId, data.eventId)));
    await db.update(generationEvents).set({ status: "failed", error: message, durationMs: Date.now() - started }).where(eq(generationEvents.id, data.eventId));
    await refundGenerationCredits(data.orgId, data.eventId);
  }
}
registerJob("avatar.create", runAvatarCreatePipeline);
