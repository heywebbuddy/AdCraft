"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/server/org";
import { createVideoFromConcept, regenerateScene, rerunVideo, updateScene } from "@/server/videos";

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** `/videos/new` submit: builds the storyboard document, inserts creative + variants, dispatches the job. */
export async function createVideo(formData: FormData) {
  const ctx = await requireOrg();
  const conceptId = str(formData, "conceptId");
  if (!conceptId) redirect("/briefs");
  const kind = str(formData, "kind") === "ugc" ? "ugc" : "video";
  const { creativeId } = await createVideoFromConcept(ctx.org.id, conceptId, {
    kind,
    model: str(formData, "model") || undefined,
    ratio: (str(formData, "ratio") || undefined) as "9:16" | "1:1" | "16:9" | undefined,
    avatarId: str(formData, "avatarId") || undefined,
    voiceId: str(formData, "voiceId") || undefined,
  });
  revalidatePath("/dashboard");
  redirect(`/videos/${creativeId}`);
}

/** Save a scene's caption / hook (re-assembles) or prompt (regenerates that scene). */
export async function saveScene(formData: FormData) {
  const ctx = await requireOrg();
  const creativeId = str(formData, "creativeId");
  const sceneId = str(formData, "sceneId");
  const hasHook = formData.has("hookText");
  await updateScene(ctx.org.id, creativeId, sceneId, {
    caption: str(formData, "caption"),
    ...(hasHook ? { hookText: str(formData, "hookText") || null } : {}),
    ...(formData.has("prompt") ? { prompt: str(formData, "prompt") } : {}),
  });
  revalidatePath(`/videos/${creativeId}`);
}

export async function regenerateSceneAction(formData: FormData) {
  const ctx = await requireOrg();
  const creativeId = str(formData, "creativeId");
  await regenerateScene(ctx.org.id, creativeId, str(formData, "sceneId"));
  revalidatePath(`/videos/${creativeId}`);
}

/** Re-run: generates anything missing and re-assembles; `fresh` regenerates everything. */
export async function rerunAction(formData: FormData) {
  const ctx = await requireOrg();
  const creativeId = str(formData, "creativeId");
  await rerunVideo(ctx.org.id, creativeId, { model: str(formData, "model") || undefined, fresh: str(formData, "fresh") === "1" });
  revalidatePath(`/videos/${creativeId}`);
}
