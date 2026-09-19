"use server";

import { redirect } from "next/navigation";
import { GuardrailError } from "@/server/guardrails";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/org";
import { staticModelChoices } from "@/server/static-options";

async function creditsForModel(id: string) {
  const m = (await staticModelChoices()).find((x) => x.id === id);
  return m?.credits ?? 2;
}
import {
  createCreativeFromConcept as createCreative,
  regenerateScene as regenerate,
  rerender as rerenderCreative,
  updateCreativeDocument as updateDocument,
  STATIC_SCENE_CREDITS,
  type DocumentPatch,
} from "@/server/creatives";

const num = (v: FormDataEntryValue | null, fallback: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** `/creatives/new` submit: build the document, create variants, start the scene. */
export async function createCreativeFromConcept(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("An editor or owner is required.");
  const conceptId = String(formData.get("conceptId") ?? "");
  const model = String(formData.get("model") ?? "");
  const mode = formData.get("generationMode") === "ai" ? "ai" : "editable";
  const placements = formData.getAll("placements").map(String).filter(Boolean);
  const templateChoice = String(formData.get("template") ?? "");
  const templateId = templateChoice.startsWith("saved:") ? templateChoice.slice(6) : undefined;
  const template = templateId ? "" : templateChoice;
  if (!conceptId) redirect("/creatives");
  const needed = mode === "ai" ? (await creditsForModel(model)) * Math.max(1, placements.length) : STATIC_SCENE_CREDITS;
  if (ctx.credits.balance < needed) redirect(`/creatives/new?conceptId=${conceptId}&error=credits`);
  let creativeId: string;
  try {
    ({ creativeId } = await createCreative(ctx.org.id, conceptId, { model, template, templateId, mode, placements }));
  } catch (err) {
    if (err instanceof GuardrailError) redirect(`/creatives/new?conceptId=${conceptId}&error=guardrail&detail=${encodeURIComponent(err.message)}`);
    redirect(`/creatives/new?conceptId=${conceptId}&error=concept`);
  }
  revalidatePath("/creatives");
  redirect(`/creatives/${creativeId}`);
}

/** Editor save: merge the form into the document and re-render every size. */
export async function updateCreativeDocument(creativeId: string, formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("An editor or owner is required.");
  const patch: DocumentPatch = {
    headline: String(formData.get("headline") ?? "").trim(),
    subhead: String(formData.get("subhead") ?? "").trim(),
    cta: String(formData.get("cta") ?? "").trim(),
    layout: {
      align: formData.get("align") === "center" ? "center" : "left",
      headlineSize: num(formData.get("headlineSize"), 84, 40, 160),
      overlay: num(formData.get("overlay"), 0.55, 0, 1),
    },
    product: { scale: num(formData.get("productScale"), 1, 0.4, 1.6) },
  };
  const template = String(formData.get("template") ?? "");
  if (template) patch.template = template as DocumentPatch["template"];
  if (!patch.headline) patch.headline = undefined;
  if (!patch.cta) patch.cta = undefined;
  await updateDocument(ctx.org.id, creativeId, patch);
  revalidatePath(`/creatives/${creativeId}`);
  revalidatePath("/creatives");
}

export async function rerender(creativeId: string) {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("An editor or owner is required.");
  await rerenderCreative(ctx.org.id, creativeId);
  revalidatePath(`/creatives/${creativeId}`);
}

/** Paint a new scene with the chosen model. Costs STATIC_SCENE_CREDITS. */
export async function regenerateScene(creativeId: string, formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("An editor or owner is required.");
  const model = String(formData.get("model") ?? "") || undefined;
  const instructions = String(formData.get("instructions") ?? "").trim() || undefined;
  const onlyMissing = formData.get("retryMissing") === "on" || formData.get("retryMissing") === "true";
  if (ctx.credits.balance < (model ? await creditsForModel(model) : STATIC_SCENE_CREDITS)) redirect(`/creatives/${creativeId}?error=credits`);
  try {
    await regenerate(ctx.org.id, creativeId, model, { instructions, onlyMissing });
  } catch (err) {
    if (err instanceof GuardrailError) redirect(`/creatives/${creativeId}?error=guardrail&detail=${encodeURIComponent(err.message)}`);
    throw err;
  }
  revalidatePath(`/creatives/${creativeId}`);
  revalidatePath("/dashboard");
}
