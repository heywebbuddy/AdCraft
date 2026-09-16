"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/org";
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
  const conceptId = String(formData.get("conceptId") ?? "");
  const model = String(formData.get("model") ?? "");
  const templateChoice = String(formData.get("template") ?? "");
  const templateId = templateChoice.startsWith("saved:") ? templateChoice.slice(6) : undefined;
  const template = templateId ? "" : templateChoice;
  if (!conceptId) redirect("/creatives");
  if (ctx.credits.balance < STATIC_SCENE_CREDITS) redirect(`/creatives/new?conceptId=${conceptId}&error=credits`);
  let creativeId: string;
  try {
    ({ creativeId } = await createCreative(ctx.org.id, conceptId, { model, template, templateId }));
  } catch {
    redirect(`/creatives/new?conceptId=${conceptId}&error=concept`);
  }
  revalidatePath("/creatives");
  redirect(`/creatives/${creativeId}`);
}

/** Editor save: merge the form into the document and re-render every size. */
export async function updateCreativeDocument(creativeId: string, formData: FormData) {
  const ctx = await requireOrg();
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
  await rerenderCreative(ctx.org.id, creativeId);
  revalidatePath(`/creatives/${creativeId}`);
}

/** Paint a new scene with the chosen model. Costs STATIC_SCENE_CREDITS. */
export async function regenerateScene(creativeId: string, formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.credits.balance < STATIC_SCENE_CREDITS) redirect(`/creatives/${creativeId}?error=credits`);
  const model = String(formData.get("model") ?? "") || undefined;
  await regenerate(ctx.org.id, creativeId, model);
  revalidatePath(`/creatives/${creativeId}`);
  revalidatePath("/dashboard");
}
