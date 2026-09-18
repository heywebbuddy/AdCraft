"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { db, characters, generationEvents, products, projects, briefs, concepts } from "@adcraft/db";
import { getLook, isElevenLabsConfigured, isFalConfigured, isHeyGenConfigured, listVoices } from "@adcraft/ai";
import { getPresenterLooks, type PresenterLook } from "@/server/presenter-library";
import { requireOrg } from "@/server/org";
import { studioModels } from "@/server/character-studio";
import { currentSubscription, CREDIT_COSTS } from "@/server/billing";
import { planAllows } from "@/server/platform-settings";
import { getCatalog } from "@/server/model-catalog";
import { reserveGenerationCredits, refundGenerationCredits } from "@/server/generation-credits";
import { dispatch } from "@/server/jobs";
import { createVideoFromConcept } from "@/server/videos";
import { CHARACTER_TEMPLATES, studioScript } from "@/lib/character-studio";
import "@/pipelines";

function field(form: FormData, key: string, max = 1500) {
  const value = form.get(key);
  if (typeof value !== "string" || value.trim().length > max) throw new Error(`Please check ${key}.`);
  return value.trim();
}
async function editor() {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("An editor or owner can create characters and ads.");
  if (!ctx.brand) throw new Error("Create a brand first.");
  const sub = await currentSubscription(ctx.org.id);
  if (!(await planAllows(sub?.plan, "ugc"))) throw new Error("Character studio is not enabled for this plan.");
  return { ...ctx, brand: ctx.brand };
}
async function selectedImageModel(form: FormData) {
  const id = field(form, "imageModel", 100);
  const model = (await studioModels()).find(m => m.id === id);
  if (!model?.enabled) throw new Error("Choose an available image model.");
  if (!model.connected) throw new Error(`${model.provider === "fal" ? "fal.ai" : "OpenAI"} is not connected. Ask your workspace administrator to connect it.`);
  return model;
}
const EXPRESSIVENESS = ["low", "medium", "high"] as const;
function motionOf(form: FormData) {
  const e = String(form.get("expressiveness") ?? "");
  const expressiveness = (EXPRESSIVENESS as readonly string[]).includes(e) ? (e as (typeof EXPRESSIVENESS)[number]) : "high";
  const prompt = String(form.get("motionPrompt") ?? "").trim().slice(0, 300);
  return { expressiveness, ...(prompt ? { prompt } : {}) };
}
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }

/** Creates an identity or adds a reference-guided look; returns before generation completes. */
export async function generateCharacterAction(form: FormData): Promise<{ id?: string; error?: string }> {
  let reservation: { orgId: string; eventId: string; characterId?: string } | undefined;
  try {
    const ctx = await editor();
    const model = await selectedImageModel(form);
    const existingId = typeof form.get("characterId") === "string" ? String(form.get("characterId")) : "";
    const lookName = field(form, "lookName", 60) || "Original";
    const prompt = field(form, "lookPrompt", 1200);
    const [existing] = existingId ? await db.select().from(characters).where(and(eq(characters.id, existingId), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id))) : [];
    if (existingId && !existing) throw new Error("Character not found in this brand.");
    if (existing && ["queued", "generating"].includes(existing.status)) throw new Error("This character is already generating. Wait for it to finish.");
    const name = existing?.name ?? field(form, "name", 60);
    const description = existing?.description ?? field(form, "description", 1500);
    const personality = existing?.personality ?? field(form, "personality", 300);
    const voiceId = existing?.voiceId ?? field(form, "voiceId", 120);
    if (!name || description.length < 15) throw new Error("Add a name and at least 15 characters describing your fictional adult presenter.");
    if (!(await listVoices()).some(v => v.id === voiceId)) throw new Error("Choose an available voice.");
    const eventId = randomUUID();
    await reserveGenerationCredits(ctx.org.id, model.creditsPerUnit, eventId);
    reservation = { orgId: ctx.org.id, eventId };
    const id = await db.transaction(async tx => {
      let characterId = existing?.id;
      if (existing) {
        const updated = await tx.update(characters).set({ status: "queued", error: null, generationId: eventId, updatedAt: new Date() }).where(and(eq(characters.id, existing.id), eq(characters.orgId, ctx.org.id), notInArray(characters.status, ["queued", "generating"]))).returning({ id: characters.id });
        if (!updated.length) throw new Error("This character is already generating.");
      } else {
        const [row] = await tx.insert(characters).values({ orgId: ctx.org.id, brandId: ctx.brand.id, name, description, personality, voiceId, imageModel: model.id, motion: motionOf(form), generationId: eventId }).returning({ id: characters.id });
        characterId = row!.id;
      }
      await tx.insert(generationEvents).values({ id: eventId, orgId: ctx.org.id, capability: "image", provider: model.provider, model: model.id, status: "started", credits: model.creditsPerUnit, meta: { characterId, label: `${name} · ${lookName}` } });
      return characterId!;
    });
    reservation.characterId = id;
    await dispatch("character.generate", { orgId: ctx.org.id, characterId: id, eventId, model: model.id, prompt, lookName });
    revalidatePath("/characters");
    return { id };
  } catch (error) {
    if (reservation) {
      await refundGenerationCredits(reservation.orgId, reservation.eventId);
      if (reservation.characterId) {
        await db.update(characters).set({ status: "failed", error: "Could not queue generation. Your credits were returned." }).where(and(eq(characters.id, reservation.characterId), eq(characters.generationId, reservation.eventId)));
        await db.update(generationEvents).set({ status: "failed", error: "Could not queue generation" }).where(eq(generationEvents.id, reservation.eventId));
      }
    }
    return { error: message(error) };
  }
}

export async function saveCharacterAction(form: FormData): Promise<{ error?: string }> {
  try {
    const ctx = await editor();
    const voiceId = field(form, "voiceId", 120);
    if (!(await listVoices()).some(v => v.id === voiceId)) throw new Error("Choose an available voice.");
    const name = field(form, "name", 60);
    if (!name) throw new Error("Give your character a name.");
    const rows = await db.update(characters).set({ name, personality: field(form, "personality", 300), voiceId, motion: motionOf(form), updatedAt: new Date() }).where(and(eq(characters.id, field(form, "characterId", 80)), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id))).returning({ id: characters.id });
    if (!rows.length) throw new Error("Character not found.");
    revalidatePath("/characters");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function createCharacterAdAction(form: FormData): Promise<{ creativeId?: string; error?: string }> {
  try {
    const ctx = await editor();
    if (!isFalConfigured || !isHeyGenConfigured || !isElevenLabsConfigured) throw new Error("Connect fal.ai, HeyGen and ElevenLabs before generating a character ad.");
    if (ctx.credits.balance < CREDIT_COSTS.ugcVideo30s) throw new Error(`You need ${CREDIT_COSTS.ugcVideo30s} credits to generate this ad.`);
    const imageModel = await selectedImageModel(form);
    const model = field(form, "videoModel", 100);
    const catalog = await getCatalog();
    if (catalog.get(model)?.kind !== "video" || catalog.get(model)?.enabled === false) throw new Error("Choose an available video model.");
    const templateId = field(form, "templateId", 80);
    const template = CHARACTER_TEMPLATES.find(t => t.id === templateId);
    if (!template) throw new Error("Choose an ad template.");
    // Presenter: either a saved character look (photo avatar, Avatar IV motion) or a HeyGen
    // library avatar (filmed actor with gestures built in).
    const stockAvatarId = field(form, "stockAvatarId", 120);
    const stockLook = stockAvatarId ? await getLook(stockAvatarId) : null;
    if (stockAvatarId && !stockLook) throw new Error("That presenter is no longer available in the library.");
    const stockAvatar = stockLook ? { id: stockLook.id, person: field(form, "stockPersonName", 80) || stockLook.name, label: stockLook.name } : undefined;
    const characterId = field(form, "characterId", 80);
    const [character] = characterId ? await db.select().from(characters).where(and(eq(characters.id, characterId), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id))) : [];
    if (!stockAvatar && !character?.portraitKey) throw new Error("Choose a character with a completed portrait, or a presenter from the library.");
    const look = character?.looks.find(l => l.id === field(form, "lookId", 80));
    if (!stockAvatar && !look) throw new Error("Choose one of this character's saved looks.");
    const voiceId = character?.voiceId ?? field(form, "voiceId", 120);
    if (!(await listVoices()).some(v => v.id === voiceId)) throw new Error("Choose a voice for this presenter.");
    const presenterName = character?.name ?? stockAvatar!.person ?? stockAvatar!.label;
    const tone = character?.personality ?? "Warm and conversational";
    const productId = field(form, "productId", 80);
    const [product] = productId ? await db.select().from(products).where(and(eq(products.id, productId), eq(products.orgId, ctx.org.id), eq(products.brandId, ctx.brand.id))) : [];
    if (productId && !product) throw new Error("Product not found in this brand.");
    const name = product?.name ?? field(form, "serviceName", 120);
    if (!name) throw new Error("Choose a product or name your service.");
    const hook = field(form, "hook", 250), body = field(form, "body", 1500), cta = field(form, "cta", 100);
    const script = studioScript(hook, body, cta);
    if (!hook || !body || !cta) throw new Error("Complete the opening, product message and call to action.");
    if (script.split(/\s+/).length > 75) throw new Error("Keep this ad to 75 words or fewer (about 30 seconds). Shorten your script to continue.");
    const ratio = field(form, "ratio", 10);
    if (ratio !== "9:16" && ratio !== "1:1" && ratio !== "16:9") throw new Error("Choose a supported video size.");
    const conceptId = await db.transaction(async tx => {
      const [project] = await tx.insert(projects).values({ orgId: ctx.org.id, brandId: ctx.brand.id, name: `${name} · Character studio` }).returning();
      const [brief] = await tx.insert(briefs).values({ orgId: ctx.org.id, projectId: project!.id, productId: product?.id, title: `${name} with ${presenterName}`, data: { objective: "conversion", audience: "Brand audience", platforms: ["meta", "tiktok"], formats: ["ugc"], tone } }).returning();
      const lookNote = look?.prompt ?? "";
      const [concept] = await tx.insert(concepts).values({ orgId: ctx.org.id, briefId: brief!.id, title: `${name} · ${template.name}`, kind: "ugc", data: { hook, angle: template.name, headline: name, primaryText: body, cta, script, visualDirection: product ? `Product close-ups of ${name}, natural light. ${lookNote}` : `Supporting lifestyle visuals for ${name}. Do not invent an app interface or product demonstration. ${lookNote}` } }).returning();
      return concept!.id;
    });
    const result = await createVideoFromConcept(ctx.org.id, conceptId, {
      kind: "ugc",
      model,
      imageModel: imageModel.id,
      ratio,
      voiceId,
      templateId,
      ...(stockAvatar ? { avatarId: stockAvatar.id } : { characterImageKey: look!.imageKey, characterId: character!.id, motion: character!.motion ?? {} }),
    });
    revalidatePath("/characters"); revalidatePath("/creatives");
    return result;
  } catch (error) { return { error: message(error) }; }
}

/** Looks (outfits / settings) for one library presenter; fetched when a person is opened or scrolled into view. */
export async function loadPresenterLooks(groupId: string): Promise<PresenterLook[]> {
  await requireOrg();
  if (!/^[a-f0-9]{16,64}$/i.test(groupId)) return [];
  return getPresenterLooks(groupId);
}
