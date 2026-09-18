"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { db, characters, generationEvents, products, projects, briefs, concepts, brandVoices } from "@adcraft/db";
import { cloneHeyGenVoice, createConsentLink, designHeyGenVoices, findLookPack, getGroupConsent, generateHeyGenVoiceSample, getLook, isElevenLabsConfigured, isFalConfigured, isHeyGenConfigured, isHeyGenVoiceId, searchVoices, setHeyGenVoicePreview, type CatalogVoice, type VoiceQuery } from "@adcraft/ai";
import { getVoiceSample, storeVoiceSample } from "@/server/voice-samples";
import { deleteBrandVoice, discardHeyGenVoices, listBrandVoices, resolveVoice, storeBrandVoiceSample, toCatalogVoice } from "@/server/brand-voices";
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

/** A trimmed string field; absent fields read as "" (a form only sends the inputs it renders). */
function field(form: FormData, key: string, max = 1500) {
  const value = form.get(key) ?? "";
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
    if (!(await resolveVoice(ctx.org.id, voiceId))) throw new Error("Choose an available voice.");
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
    if (!(await resolveVoice(ctx.org.id, voiceId))) throw new Error("Choose an available voice.");
    const name = field(form, "name", 60);
    if (!name) throw new Error("Give your character a name.");
    const rows = await db.update(characters).set({ name, personality: field(form, "personality", 300), voiceId, motion: motionOf(form), updatedAt: new Date() }).where(and(eq(characters.id, field(form, "characterId", 80)), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id))).returning({ id: characters.id });
    if (!rows.length) throw new Error("Character not found.");
    revalidatePath("/characters");
    return {};
  } catch (error) { return { error: message(error) }; }
}

/** Give a saved character a different recurring voice (from the voice library). */
export async function setCharacterVoiceAction(characterId: string, voiceId: string): Promise<{ error?: string }> {
  try {
    const ctx = await editor();
    if (!(await resolveVoice(ctx.org.id, voiceId))) throw new Error("Choose an available voice.");
    const rows = await db.update(characters).set({ voiceId, updatedAt: new Date() }).where(and(eq(characters.id, characterId.slice(0, 80)), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id))).returning({ id: characters.id });
    if (!rows.length) throw new Error("Character not found.");
    revalidatePath("/characters");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function createCharacterAdAction(form: FormData): Promise<{ creativeId?: string; error?: string }> {
  try {
    const ctx = await editor();
    if (!isFalConfigured || !isHeyGenConfigured) throw new Error("Connect fal.ai and HeyGen before generating a character ad.");
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
    const voice = await resolveVoice(ctx.org.id, voiceId);
    if (!voice) throw new Error("Choose a voice for this presenter.");
    if (voice.status === "processing") throw new Error("That voice is still being cloned. Give it a minute.");
    if (voice.status === "failed") throw new Error("That voice clone failed. Pick another voice.");
    if (voice.provider === "elevenlabs" && !isElevenLabsConfigured) throw new Error("That voice needs ElevenLabs; pick a HeyGen voice or connect ElevenLabs.");
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
      voiceProvider: voice.provider,
      templateId,
      // A HeyGen-generated look renders as that look's avatar_id; our own portraits go up as an image.
      ...(stockAvatar ? { avatarId: stockAvatar.id } : look!.heygenLookId ? { avatarId: look!.heygenLookId, characterId: character!.id, motion: character!.motion ?? {} } : { characterImageKey: look!.imageKey, characterId: character!.id, motion: character!.motion ?? {} }),
    });
    revalidatePath("/characters"); revalidatePath("/creatives");
    return result;
  } catch (error) { return { error: message(error) }; }
}

/** Looks (outfits / settings) for one library presenter; fetched when a person is opened or scrolled into view. */
export async function loadPresenterLooks(groupId: string): Promise<PresenterLook[]> {
  await requireOrg();
  if (!/^[a-z0-9_-]{4,80}$/i.test(groupId)) return []; // photo groups are hex, studio groups numeric
  try { return await getPresenterLooks(groupId); } catch { throw new Error("HeyGen did not answer — try again."); }
}

/** Paged voice search across ElevenLabs and HeyGen for the voice picker. */
export async function searchVoicesAction(q: VoiceQuery): Promise<{ items: CatalogVoice[]; total: number; languages: string[] }> {
  const ctx = await requireOrg();
  const query = String(q.query ?? "").slice(0, 60);
  const gender = q.gender === "male" || q.gender === "female" ? q.gender : undefined;
  const language = q.language ? String(q.language).slice(0, 40) : undefined;
  const provider = q.provider === "heygen" || q.provider === "elevenlabs" ? q.provider : undefined;
  const offset = Number(q.offset) || 0;
  const result = await searchVoices({ query, gender, language, provider, offset, limit: 60 });
  if (provider === "elevenlabs" || !ctx.brand) return result;
  // The workspace's own clones and designed voices lead page one.
  const needle = query.trim().toLowerCase();
  const own = (await listBrandVoices(ctx.org.id, ctx.brand.id)).map(toCatalogVoice).filter(v => (!gender || v.gender === gender) && (!language || v.language === language) && (!needle || `${v.name} ${v.style ?? ""} ${v.language ?? ""}`.toLowerCase().includes(needle)));
  const ownIds = new Set(own.map(v => v.id));
  const items = result.items.filter(v => !ownIds.has(v.id));
  return { items: offset === 0 ? [...own, ...items] : items, total: result.total + own.length, languages: result.languages };
}

/**
 * Generate (once) and return a short sample for a HeyGen voice that has none. The sample is
 * copied into our storage and remembered platform-wide, so each voice costs at most one
 * short TTS call ever.
 */
export async function auditionVoiceAction(voiceId: string): Promise<{ url?: string; error?: string }> {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") return { error: "Viewers can't generate samples." };
  if (!isHeyGenVoiceId(voiceId)) return { error: "Unknown voice." };
  const cached = await getVoiceSample(voiceId);
  if (cached) return { url: cached };
  const voice = await resolveVoice(ctx.org.id, voiceId);
  if (!voice || voice.provider !== "heygen") return { error: "Only HeyGen voices can be auditioned this way." };
  try {
    const { url } = await generateHeyGenVoiceSample(voiceId);
    const stored = await storeVoiceSample(voiceId, url);
    setHeyGenVoicePreview(voiceId, stored);
    return { url: stored };
  } catch (error) {
    return { error: message(error) };
  }
}

/**
 * Give a character new looks on HeyGen — a Look Pack (5), a single template (2) or one
 * from a description. Credits are reserved per look and returned for any that fail.
 */
export async function applyLookPackAction(form: FormData): Promise<{ error?: string }> {
  let reservation: { orgId: string; eventId: string } | null = null;
  try {
    const ctx = await editor();
    if (!isHeyGenConfigured) throw new Error("Connect HeyGen to generate looks.");
    const characterId = field(form, "characterId", 80);
    const [character] = await db.select().from(characters).where(and(eq(characters.id, characterId), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id)));
    if (!character) throw new Error("Character not found in this brand.");
    if (!character.portraitKey) throw new Error("This character needs a finished portrait first.");
    if (["queued", "generating"].includes(character.status)) throw new Error("This character is already generating. Wait for it to finish.");
    const sourceField = field(form, "source", 10);
    const source = sourceField === "prompt" ? "prompt" : sourceField === "remix" ? "remix" : "pack";
    const templateLookId = field(form, "templateLookId", 80);
    if (source === "remix" && !/^[A-Za-z0-9_-]{6,80}$/.test(templateLookId)) throw new Error("Choose a library look to remix.");
    const gender = field(form, "gender", 10) === "male" ? "male" : "female";
    const aspectRatio = field(form, "aspectRatio", 5) === "9:16" ? "9:16" : "16:9";
    const pack = source === "pack" ? findLookPack(field(form, "packId", 60)) : null;
    if (source === "pack" && !pack) throw new Error("Choose a look pack.");
    const prompt = field(form, "prompt", 1000);
    if (source === "prompt" && prompt.length < 10) throw new Error("Describe the outfit and setting in a few words.");
    const lookName = field(form, "lookName", 60) || pack?.name || "New look";
    const count = source === "remix" ? 2 : pack?.looks ?? 1;
    const credits = CREDIT_COSTS.heygenLook * count;
    if (ctx.credits.balance < credits) throw new Error(`You need ${credits} credits for ${count === 1 ? "this look" : `these ${count} looks`}.`);
    const eventId = randomUUID();
    await reserveGenerationCredits(ctx.org.id, credits, eventId);
    reservation = { orgId: ctx.org.id, eventId };
    const meta = { characterId, label: `${character.name} · ${pack?.name ?? lookName}`, source, packId: pack?.id, templateLookId: source === "remix" ? templateLookId : undefined };
    await db.transaction(async tx => {
      const updated = await tx.update(characters).set({ status: "queued", error: null, generationId: eventId, updatedAt: new Date() }).where(and(eq(characters.id, character.id), notInArray(characters.status, ["queued", "generating"]))).returning({ id: characters.id });
      if (!updated.length) throw new Error("This character is already generating.");
      await tx.insert(generationEvents).values({ id: eventId, orgId: ctx.org.id, capability: "image", provider: "heygen", model: "heygen-looks", status: "started", credits, meta });
    });
    await dispatch("character.looks", { orgId: ctx.org.id, characterId, eventId, source, packId: pack?.id, gender, prompt: source === "prompt" ? prompt : undefined, templateLookId: source === "remix" ? templateLookId : undefined, lookName, aspectRatio, credits, meta });
    revalidatePath("/characters");
    return {};
  } catch (error) {
    if (reservation) {
      await refundGenerationCredits(reservation.orgId, reservation.eventId);
      await db.update(characters).set({ status: "ready", error: "Could not queue the looks. Your credits were returned." }).where(and(eq(characters.orgId, reservation.orgId), eq(characters.generationId, reservation.eventId)));
      await db.update(generationEvents).set({ status: "failed", error: "Could not queue looks" }).where(eq(generationEvents.id, reservation.eventId));
    }
    return { error: message(error) };
  }
}

const AUDIO_TYPES: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/webm": "webm", "audio/flac": "flac" };
const MAX_CLONE_BYTES = 10 * 1024 * 1024;

/** Instant clone from one recording. Returns the workspace voice; it finishes in the background. */
/** HeyGen gives the whole account ~10 custom voices; each workspace gets a share. */
async function assertVoiceSlot(orgId: string, brandId: string) {
  const { getPlatformSettings } = await import("@/server/platform-settings");
  const max = (await getPlatformSettings()).guardrails.heygenVoicesPerWorkspace;
  const own = await listBrandVoices(orgId, brandId);
  if (own.length >= max) throw new Error(`This workspace already has ${own.length} custom voice${own.length === 1 ? "" : "s"} (the limit is ${max}). Delete one under Your voices to make room.`);
}

export async function cloneVoiceAction(form: FormData): Promise<{ voice?: CatalogVoice; error?: string }> {
  try {
    const ctx = await editor();
    if (!isHeyGenConfigured) throw new Error("Connect HeyGen to clone voices.");
    await assertVoiceSlot(ctx.org.id, ctx.brand.id);
    const name = field(form, "name", 60);
    if (!name) throw new Error("Name the voice.");
    if (field(form, "consent", 5) !== "yes") throw new Error("Confirm you have permission to clone this voice.");
    const file = form.get("audio");
    if (!(file instanceof File) || !file.size) throw new Error("Add a recording (mp3, wav or m4a).");
    if (file.size > MAX_CLONE_BYTES) throw new Error("Keep the recording under 10 MB — one to two minutes is plenty.");
    const mimeType = AUDIO_TYPES[file.type] ? file.type : file.name.toLowerCase().endsWith(".wav") ? "audio/wav" : file.name.toLowerCase().endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
    const language = field(form, "language", 10) || undefined;
    const voiceId = await cloneHeyGenVoice({ name, audio: Buffer.from(await file.arrayBuffer()), mimeType, language });
    const [row] = await db.insert(brandVoices).values({ orgId: ctx.org.id, brandId: ctx.brand.id, voiceId, name, kind: "clone", language: language ?? null, status: "processing" }).returning();
    revalidatePath("/characters");
    return { voice: toCatalogVoice(row!) };
  } catch (error) { return { error: message(error) }; }
}

export type DesignedVoice = { voiceId: string; name: string; gender?: "male" | "female"; language?: string; previewUrl?: string };

/**
 * Design voices from a description. HeyGen returns up to three already-created private
 * voices; the client must keep one (`keepDesignedVoiceAction`) or discard the batch.
 */
export async function designVoicesAction(input: { prompt: string; gender?: "male" | "female"; locale?: string; seed?: number }): Promise<{ voices?: DesignedVoice[]; seed?: number; error?: string }> {
  try {
    await editor();
    if (!isHeyGenConfigured) throw new Error("Connect HeyGen to design voices.");
    const prompt = String(input.prompt ?? "").trim().slice(0, 1000);
    if (prompt.length < 20) throw new Error("Describe the voice in a full sentence — tone, age, accent, pace and what it is for.");
    const res = await designHeyGenVoices({ prompt, gender: input.gender === "male" || input.gender === "female" ? input.gender : undefined, locale: input.locale ? String(input.locale).slice(0, 10) : undefined, seed: Math.max(0, Math.min(20, Number(input.seed) || 0)) });
    return { voices: res.voices.map(v => ({ voiceId: v.id, name: v.name, gender: v.gender, language: v.language, previewUrl: v.previewUrl })), seed: res.seed };
  } catch (error) { return { error: message(error) }; }
}

/** Keep one designed voice for this workspace and delete the others in the batch. */
export async function keepDesignedVoiceAction(input: { keep: DesignedVoice; name?: string; prompt?: string; discard: string[] }): Promise<{ voice?: CatalogVoice; error?: string }> {
  try {
    const ctx = await editor();
    const keep = input.keep;
    if (!keep?.voiceId || !isHeyGenVoiceId(keep.voiceId)) throw new Error("Choose a voice to keep.");
    await assertVoiceSlot(ctx.org.id, ctx.brand.id);
    const name = String(input.name ?? keep.name ?? "Designed voice").trim().slice(0, 60) || "Designed voice";
    const sampleKey = keep.previewUrl ? await storeBrandVoiceSample(ctx.org.id, keep.voiceId, keep.previewUrl).catch(() => null) : null;
    const [row] = await db.insert(brandVoices).values({ orgId: ctx.org.id, brandId: ctx.brand.id, voiceId: keep.voiceId, name, kind: "designed", gender: keep.gender ?? null, language: keep.language ?? null, sampleKey, status: "ready", prompt: String(input.prompt ?? "").slice(0, 1000) || null }).returning();
    await discardHeyGenVoices((input.discard ?? []).filter(id => isHeyGenVoiceId(id) && id !== keep.voiceId));
    revalidatePath("/characters");
    return { voice: toCatalogVoice(row!) };
  } catch (error) { return { error: message(error) }; }
}

/** The user closed a design batch without keeping any: free the slots on HeyGen. */
export async function discardDesignedVoicesAction(ids: string[]): Promise<void> {
  try {
    await editor();
    await discardHeyGenVoices((ids ?? []).filter(isHeyGenVoiceId).slice(0, 10));
  } catch { /* best effort */ }
}

/** This workspace's clones and designed voices, refreshed against HeyGen. */
export async function brandVoicesAction(): Promise<CatalogVoice[]> {
  const ctx = await requireOrg();
  if (!ctx.brand) return [];
  return (await listBrandVoices(ctx.org.id, ctx.brand.id)).map(toCatalogVoice);
}

export async function deleteBrandVoiceAction(voiceId: string): Promise<{ error?: string }> {
  try {
    const ctx = await editor();
    const [row] = await db.select({ id: brandVoices.id, voiceId: brandVoices.voiceId }).from(brandVoices).where(and(eq(brandVoices.orgId, ctx.org.id), eq(brandVoices.brandId, ctx.brand.id), eq(brandVoices.voiceId, voiceId.slice(0, 80)))).limit(1);
    if (!row) throw new Error("Voice not found.");
    const inUse = await db.select({ id: characters.id }).from(characters).where(and(eq(characters.orgId, ctx.org.id), eq(characters.voiceId, row.voiceId))).limit(1);
    if (inUse.length) throw new Error("A character still uses this voice. Give it another voice first.");
    await deleteBrandVoice(ctx.org.id, ctx.brand.id, row.id);
    revalidatePath("/characters");
    return {};
  } catch (error) { return { error: message(error) }; }
}

/**
 * Create a character on HeyGen: a digital twin from footage (`sourceKey` from /api/uploads),
 * a virtual character from a photo (`sourceKey`) or from a description (`prompt`).
 */
export async function createAvatarAction(form: FormData): Promise<{ id?: string; error?: string }> {
  let reservation: { orgId: string; eventId: string; characterId?: string } | null = null;
  try {
    const ctx = await editor();
    if (!isHeyGenConfigured) throw new Error("Connect HeyGen to create avatars.");
    const typeField = field(form, "type", 20);
    const type = typeField === "digital_twin" ? "digital_twin" : typeField === "prompt" ? "prompt" : "photo";
    const name = field(form, "name", 60);
    if (!name) throw new Error("Name the character.");
    const sourceKey = field(form, "sourceKey", 200);
    const prompt = field(form, "prompt", 1000);
    if (type !== "prompt" && !sourceKey.startsWith(`org/${ctx.org.id}/uploads/`)) throw new Error(type === "digital_twin" ? "Upload the footage first." : "Upload a photo first.");
    if (type === "prompt" && prompt.length < 15) throw new Error("Describe the character in a sentence or two.");
    if (type === "digital_twin" && field(form, "consent", 5) !== "yes") throw new Error("Confirm the person in the footage has agreed to be cloned.");
    if (type === "digital_twin") await assertVoiceSlot(ctx.org.id, ctx.brand.id);
    const personality = field(form, "personality", 300) || "Warm and conversational";
    const voiceId = field(form, "voiceId", 120);
    const voice = voiceId ? await resolveVoice(ctx.org.id, voiceId) : null;
    if (!voice && type !== "digital_twin") throw new Error("Choose a voice for this character.");
    const fallbackVoice = voice?.id ?? (await searchVoices({ provider: "heygen", limit: 1 })).items[0]?.id ?? "";
    const credits = type === "digital_twin" ? CREDIT_COSTS.digitalTwin : CREDIT_COSTS.heygenAvatar;
    if (ctx.credits.balance < credits) throw new Error(`You need ${credits} credits for this.`);
    const eventId = randomUUID();
    await reserveGenerationCredits(ctx.org.id, credits, eventId);
    reservation = { orgId: ctx.org.id, eventId };
    const description = type === "prompt" ? prompt : type === "digital_twin" ? `Digital twin of a real person, trained from footage.` : `Virtual character created from a photo.`;
    const id = await db.transaction(async tx => {
      const [row] = await tx.insert(characters).values({ orgId: ctx.org.id, brandId: ctx.brand.id, name, description, personality, voiceId: fallbackVoice, imageModel: `heygen-${type}`, motion: { expressiveness: "high" }, heygen: { type, consent: type === "digital_twin" ? "pending" : "not_required" }, generationId: eventId }).returning({ id: characters.id });
      await tx.insert(generationEvents).values({ id: eventId, orgId: ctx.org.id, capability: "image", provider: "heygen", model: `heygen-${type}`, status: "started", credits, meta: { characterId: row!.id, label: `${name} · ${type === "digital_twin" ? "Digital twin" : type === "prompt" ? "Prompt character" : "Photo avatar"}` } });
      return row!.id;
    });
    reservation.characterId = id;
    const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
    await dispatch("avatar.create", { orgId: ctx.org.id, characterId: id, eventId, type, sourceKey: type === "prompt" ? undefined : sourceKey, prompt: type === "prompt" ? prompt : undefined, aspectRatio: "9:16", rerouteUrl: origin ? `${origin.replace(/\/$/, "")}/characters?view=characters&consent=done` : undefined, meta: { characterId: id, type } });
    revalidatePath("/characters");
    return { id };
  } catch (error) {
    if (reservation) {
      await refundGenerationCredits(reservation.orgId, reservation.eventId);
      if (reservation.characterId) {
        await db.update(characters).set({ status: "failed", error: "Could not queue the avatar. Your credits were returned." }).where(and(eq(characters.id, reservation.characterId), eq(characters.generationId, reservation.eventId)));
        await db.update(generationEvents).set({ status: "failed", error: "Could not queue avatar" }).where(eq(generationEvents.id, reservation.eventId));
      }
    }
    return { error: message(error) };
  }
}

/** Refresh a digital twin's consent status from HeyGen; issue a fresh link if the old one expired. */
export async function twinConsentAction(characterId: string, refreshLink = false): Promise<{ status?: string; url?: string | null; error?: string }> {
  try {
    const ctx = await editor();
    const [character] = await db.select().from(characters).where(and(eq(characters.id, characterId.slice(0, 80)), eq(characters.orgId, ctx.org.id), eq(characters.brandId, ctx.brand.id)));
    if (!character?.heygen?.groupId || character.heygen.type !== "digital_twin") throw new Error("This character is not a digital twin.");
    const heygen = { ...character.heygen };
    heygen.consent = await getGroupConsent(heygen.groupId!);
    const stale = !heygen.consentUrl || !heygen.consentUrlAt || Date.now() - heygen.consentUrlAt > 23 * 60 * 60_000;
    if (heygen.consent !== "approved" && (refreshLink || stale)) {
      const origin = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
      const link = await createConsentLink(heygen.groupId!, origin ? `${origin.replace(/\/$/, "")}/characters?view=characters&consent=done` : undefined);
      heygen.consentUrl = link.url; heygen.consentUrlAt = Date.now();
      if (link.status !== "not_required") heygen.consent = link.status;
    }
    await db.update(characters).set({ heygen, updatedAt: new Date() }).where(eq(characters.id, character.id));
    revalidatePath("/characters");
    return { status: heygen.consent, url: heygen.consent === "approved" ? null : heygen.consentUrl ?? null };
  } catch (error) { return { error: message(error) }; }
}
