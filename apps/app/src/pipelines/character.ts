import { and, eq } from "drizzle-orm";
import { db, dbReady, characters, generationEvents } from "@adcraft/db";
import { downloadImage, generateImage } from "@adcraft/ai";
import { getStorage, objectKey } from "@adcraft/storage";
import { registerJob, type JobPayloads } from "@/server/jobs";
import { refundGenerationCredits } from "@/server/generation-credits";
import { notifyFinished } from "@/server/notify";

export async function runCharacterPipeline(data: JobPayloads["character.generate"]) {
  await dbReady;
  // Claim once. Duplicate queue deliveries must not produce another paid image.
  const [character] = await db.update(characters).set({ status: "generating", updatedAt: new Date() }).where(and(eq(characters.id, data.characterId), eq(characters.orgId, data.orgId), eq(characters.generationId, data.eventId), eq(characters.status, "queued"))).returning();
  if (!character) return;
  const started = Date.now();
  try {
    const storage = getStorage();
    const reference = character.portraitKey ? await storage.get(character.portraitKey) : null;
    if (character.portraitKey && !reference) throw new Error("The original character portrait is unavailable. Restore it before creating a new look.");
    const prompt = reference
      ? `Keep the exact same adult fictional person's face and identity as the reference. Change only the outfit and setting: ${data.prompt}. Clear front-facing portrait, one person, natural skin texture, relaxed expression, no text or logos.`
      : `Create a photorealistic fictional adult brand presenter, age 25 or older. ${character.description}. ${data.prompt}. One person, clear front-facing face, waist-up portrait, natural skin texture, candid photography, no text or logos.`;
    const result = await generateImage({ model: data.model, prompt, ratio: "9:16", count: 1, references: reference ? [{ url: "", bytes: reference.body, mimeType: reference.contentType }] : [] });
    if (!result.output[0]) throw new Error("No portrait was returned. Please try a different description.");
    const sharp = (await import("sharp")).default;
    const bytes = await sharp(await downloadImage(result.output[0])).rotate().png().toBuffer();
    const imageKey = objectKey(data.orgId, "renders", "png");
    await storage.put(imageKey, bytes, { contentType: "image/png" });
    await db.transaction(async tx => {
      await tx.update(characters).set({ portraitKey: character.portraitKey ?? imageKey, looks: [...character.looks, { id: data.eventId, name: data.lookName, imageKey, prompt: data.prompt, model: data.model }], status: "ready", error: null, updatedAt: new Date() }).where(and(eq(characters.id, character.id), eq(characters.generationId, data.eventId)));
      await tx.update(generationEvents).set({ status: "succeeded", durationMs: Date.now() - started, units: "1", ...(result.usage.costUsd !== undefined ? { costUsd: String(result.usage.costUsd) } : {}) }).where(eq(generationEvents.id, data.eventId));
    });
    void notifyFinished(data.orgId, { kind: "character", characterId: character.id, name: character.name, ok: true, what: "character" });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Character generation failed";
    await db.update(characters).set({ status: character.portraitKey ? "ready" : "failed", error: message, updatedAt: new Date() }).where(and(eq(characters.id, character.id), eq(characters.generationId, data.eventId)));
    await db.update(generationEvents).set({ status: "failed", error: message, durationMs: Date.now() - started }).where(eq(generationEvents.id, data.eventId));
    await refundGenerationCredits(data.orgId, data.eventId);
    void notifyFinished(data.orgId, { kind: "character", characterId: character.id, name: character.name, ok: false, error: message, what: "character" });
  }
}
registerJob("character.generate", runCharacterPipeline);
