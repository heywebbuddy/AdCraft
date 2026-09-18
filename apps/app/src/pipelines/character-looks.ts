import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, dbReady, characters, generationEvents, type CharacterLook } from "@adcraft/db";
import { createPhotoAvatar, findLookPack, generatePackLooks, generatePromptLook, waitForLooks } from "@adcraft/ai";
import { getStorage, objectKey } from "@adcraft/storage";
import { registerJob, type JobPayloads } from "@/server/jobs";
import { refundGenerationCredits } from "@/server/generation-credits";
import { notifyFinished } from "@/server/notify";

/**
 * New looks for a character on HeyGen: a Look Pack (5), a single template (2) or a prompt
 * (1). The character's portrait is registered as a HeyGen photo avatar the first time
 * (remembered in `characters.heygen`), then the looks are generated against that identity,
 * polled to completion and their previews copied into our storage. Each finished look is
 * stored with its HeyGen `avatar_id`, so ads render it through `POST /v3/videos` directly.
 *
 * Partial success is kept: if three of five looks finish, three are saved and the credits
 * for the two that failed are noted in the event.
 */
export async function runCharacterLooksPipeline(data: JobPayloads["character.looks"]) {
  await dbReady;
  const [character] = await db.update(characters).set({ status: "generating", updatedAt: new Date() }).where(and(eq(characters.id, data.characterId), eq(characters.orgId, data.orgId), eq(characters.generationId, data.eventId), eq(characters.status, "queued"))).returning();
  if (!character) return;
  const started = Date.now();
  const storage = getStorage();
  const setStep = (step: string) => db.update(generationEvents).set({ meta: { ...(data.meta ?? {}), step } }).where(eq(generationEvents.id, data.eventId));
  try {
    if (!character.portraitKey) throw new Error("This character needs a finished portrait first.");

    // 1. The identity reference on HeyGen, created once per character.
    let reference = character.heygen?.lookId;
    let groupId = character.heygen?.groupId;
    if (!reference) {
      await setStep("Registering the portrait with HeyGen");
      const portrait = await storage.get(character.portraitKey);
      if (!portrait) throw new Error("The character portrait is unavailable.");
      const created = await createPhotoAvatar({ name: character.name, image: portrait.body, mimeType: portrait.contentType || "image/png" });
      reference = created.lookId;
      groupId = created.groupId;
      await db.update(characters).set({ heygen: { groupId, lookId: reference }, updatedAt: new Date() }).where(eq(characters.id, character.id));
      const [base] = await waitForLooks([reference], { timeoutMs: 6 * 60_000 });
      if (base?.status !== "completed") throw new Error(base?.error ? `HeyGen could not use this portrait: ${base.error}` : "HeyGen is still processing the portrait. Try again in a minute.");
    }

    // 2. Start the looks.
    await setStep(data.source === "prompt" ? "Generating the look" : data.source === "remix" ? "Remixing the library look" : "Applying the look pack");
    let lookIds: string[];
    let packId: string | undefined;
    let baseName = data.lookName;
    if (data.source === "prompt") {
      lookIds = [await generatePromptLook({ referenceLookId: reference, name: data.lookName, prompt: data.prompt ?? "", aspectRatio: data.aspectRatio === "9:16" ? "9:16" : "16:9" })];
    } else if (data.source === "remix") {
      if (!data.templateLookId) throw new Error("Choose a library look to remix.");
      packId = `remix:${data.templateLookId}`;
      lookIds = (await generatePackLooks({ referenceLookId: reference, templateId: data.templateLookId, type: "template", idempotencyKey: `adcraft-${data.eventId}` })).lookIds;
    } else {
      const pack = findLookPack(data.packId ?? "");
      if (!pack) throw new Error("Unknown look pack.");
      packId = pack.id;
      baseName = pack.name;
      const templateId = pack.templates[data.gender ?? "female"];
      lookIds = (await generatePackLooks({ referenceLookId: reference, templateId, type: pack.type, aspectRatio: data.aspectRatio, idempotencyKey: `adcraft-${data.eventId}` })).lookIds;
    }

    // 3. Wait, then keep whatever finished.
    const results = await waitForLooks(lookIds, { onUpdate: (done) => void setStep(`Rendering looks · ${done}/${lookIds.length}`) });
    const finished = results.filter((l) => l.status === "completed" && l.previewUrl);
    if (!finished.length) throw new Error(results.find((l) => l.error)?.error ? `HeyGen could not generate these looks: ${results.find((l) => l.error)!.error}` : "HeyGen returned no finished looks. Your credits were returned.");
    const sharp = (await import("sharp")).default;
    const newLooks: CharacterLook[] = [];
    for (const [i, look] of finished.entries()) {
      const res = await fetch(look.previewUrl!, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) continue;
      const bytes = await sharp(Buffer.from(await res.arrayBuffer())).rotate().png().toBuffer();
      const imageKey = objectKey(data.orgId, "renders", "png");
      await storage.put(imageKey, bytes, { contentType: "image/png" });
      const name = finished.length === 1 ? baseName : look.name?.trim() && look.name.trim() !== character.name ? look.name.trim() : `${baseName} ${i + 1}`;
      newLooks.push({ id: randomUUID(), name: name.slice(0, 60), imageKey, prompt: data.prompt ?? `HeyGen ${packId ?? "look"}`, model: "heygen-looks", heygenLookId: look.id, packId });
    }
    const failed = results.length - finished.length;
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select({ looks: characters.looks }).from(characters).where(eq(characters.id, character.id));
      await tx.update(characters).set({ looks: [...(fresh?.looks ?? character.looks), ...newLooks], status: "ready", error: failed ? `${failed} of ${results.length} looks failed on HeyGen; the rest were saved.` : null, updatedAt: new Date() }).where(and(eq(characters.id, character.id), eq(characters.generationId, data.eventId)));
      await tx.update(generationEvents).set({ status: "succeeded", durationMs: Date.now() - started, units: String(newLooks.length), meta: { ...(data.meta ?? {}), step: "done", failed } }).where(eq(generationEvents.id, data.eventId));
    });
    if (failed) await refundGenerationCredits(data.orgId, data.eventId, Math.round((data.credits * failed) / results.length));
    void notifyFinished(data.orgId, { kind: "character", characterId: character.id, name: character.name, ok: true, what: "looks" });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Look generation failed";
    await db.update(characters).set({ status: "ready", error: message, updatedAt: new Date() }).where(and(eq(characters.id, character.id), eq(characters.generationId, data.eventId)));
    await db.update(generationEvents).set({ status: "failed", error: message, durationMs: Date.now() - started }).where(eq(generationEvents.id, data.eventId));
    await refundGenerationCredits(data.orgId, data.eventId);
    void notifyFinished(data.orgId, { kind: "character", characterId: character.id, name: character.name, ok: false, error: message, what: "looks" });
  }
}
registerJob("character.looks", runCharacterLooksPipeline);
