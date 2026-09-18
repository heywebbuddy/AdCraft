import { downloadVideo, generateVideo, getModel, supportedDuration } from "@adcraft/ai";
import { hydrateModels } from "@/server/model-catalog";
import type { VideoDocument } from "@adcraft/render/video";
import { notifyFinished } from "@/server/notify";
import { registerJob, type JobPayloads } from "@/server/jobs";
import { CREDIT_COSTS } from "@/server/billing";
import {
  assembleVariants,
  chargeCredits,
  failEvent,
  generateSceneStill,
  loadVideoAsset,
  loadVideoCreative,
  motionPrompt,
  saveVideoDocument,
  setEventStep,
  startEvent,
  storeRender,
  succeedEvent,
  withEvent,
} from "./video-shared";

/**
 * video.generate — product video (PLAN.md §4 job graph):
 *   storyboard → scene.image × N → scene.video × N → assemble (Remotion) → resize → variant.ready
 *
 * Only scenes missing a still/clip are generated, so "regenerate scene" (which clears one
 * scene's assets) and plain re-assembly reuse everything else. Credits: 20 for a full
 * 15 s product video, pro-rated by the number of scenes generated in this run; assembly
 * alone is free (PLAN.md §5 "Resize existing creative: 0").
 */
export async function runVideoPipeline(data: JobPayloads["video.generate"]) {
  const { orgId, creativeId } = data;
  const startedAt = Date.now();
  const { creative, doc: loaded } = await loadVideoCreative(orgId, creativeId);
  const doc: VideoDocument = { ...loaded };
  await hydrateModels();
  if (data.model && getModel(data.model)?.kind === "video") doc.model = data.model;
  const modelSpec = getModel(doc.model);
  const productName = doc.product?.name ?? null;

  const scenes = doc.scenes.filter((s) => s.role !== "broll");
  const toGenerate = scenes.filter((s) => !s.clip?.key).length;
  const credits = toGenerate === 0 ? 0 : Math.ceil((CREDIT_COSTS.productVideo15s * toGenerate) / Math.max(1, scenes.length));

  const rootEventId = await startEvent({
    orgId,
    creativeId,
    capability: "video",
    provider: modelSpec?.provider ?? "fal",
    model: doc.model,
    credits,
    label: `${creative.name} · product video`,
    detail: toGenerate ? `${toGenerate} of ${scenes.length} scenes to generate` : "Assembling sizes",
    step: "stills",
    meta: { kind: "video", scenes: scenes.length, root: true },
  });
  doc.meta = { ...(doc.meta ?? {}), lastError: undefined, lastRunEventId: rootEventId };
  await saveVideoDocument(creativeId, doc);

  try {
    // Product reference for the image model so the product is not hallucinated.
    const cutoutBytes = doc.product?.cutout ? await loadVideoAsset(doc.product.cutout) : null;

    // 1. Stills.
    for (const [i, scene] of doc.scenes.entries()) {
      if (scene.role === "broll" || scene.still?.key || scene.clip?.key) continue;
      await setEventStep(rootEventId, "stills", `Scene ${i + 1} of ${doc.scenes.length} · still`);
      const res = await withEvent(
        { orgId, creativeId, capability: "image", provider: "fal", model: "", label: `Scene ${i + 1} still`, detail: scene.prompt.slice(0, 80), step: "stills", meta: { sceneId: scene.id } },
        () => generateSceneStill({ prompt: scene.prompt, ratio: doc.ratio, reference: cutoutBytes ? { bytes: cutoutBytes } : null, seed: i + 1 }),
      );
      const key = await storeRender(orgId, res.png, "png", "image/png");
      doc.scenes[i] = { ...scene, still: { key }, error: undefined };
      await saveVideoDocument(creativeId, doc);
    }

    // 2. Clips (image-to-video).
    for (const [i, scene] of doc.scenes.entries()) {
      if (scene.role === "broll" || scene.clip?.key) continue;
      await setEventStep(rootEventId, "clips", `Scene ${i + 1} of ${doc.scenes.length} · ${modelSpec?.label ?? doc.model}`);
      const stillBytes = scene.still ? await loadVideoAsset(scene.still) : null;
      const durationSec = supportedDuration(doc.model, scene.durationSec);
      const res = await withEvent(
        { orgId, creativeId, capability: "video", provider: modelSpec?.provider ?? "fal", model: doc.model, label: `Scene ${i + 1} clip`, detail: `${durationSec} s · ${modelSpec?.label ?? doc.model}`, step: "clips", meta: { sceneId: scene.id } },
        () =>
          generateVideo({
            model: doc.model,
            prompt: motionPrompt(scene, productName),
            ratio: doc.ratio,
            durationSec,
            audio: false,
            image: stillBytes ? { url: `data:image/png;base64,${stillBytes.toString("base64")}`, mimeType: "image/png", bytes: stillBytes } : undefined,
          }),
        (r) => ({ durationSec: r.output.durationSec }),
      );
      const bytes = await downloadVideo(res.output);
      const key = await storeRender(orgId, bytes, "mp4", "video/mp4");
      doc.scenes[i] = { ...doc.scenes[i]!, clip: { key, durationSec: res.output.durationSec ?? durationSec }, error: undefined };
      await saveVideoDocument(creativeId, doc);
    }

    // 3. Assemble every size with Remotion.
    await setEventStep(rootEventId, "assemble", "Assembling sizes with captions and end card");
    const results = await assembleVariants(orgId, creativeId, doc, (r) => setEventStep(rootEventId, "assemble", `${r.ratio} ${r.status}`));
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length === results.length && results.length > 0) throw new Error(failed[0]!.error ?? "All sizes failed to render");

    await succeedEvent(
      rootEventId,
      { provider: modelSpec?.provider ?? "fal", model: doc.model, durationMs: Date.now() - startedAt, units: scenes.reduce((s, x) => s + x.durationSec, 0) },
      { step: "done", detail: `${results.length - failed.length} of ${results.length} sizes ready`, generated: toGenerate },
      credits,
    );
    await chargeCredits(orgId, credits, rootEventId, { creativeId, capability: "video", model: doc.model, scenes: toGenerate });
    void notifyFinished(orgId, { kind: "video", creativeId, name: creative.name, ok: true });
    return { creativeId, eventId: rootEventId, credits, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failEvent(rootEventId, err, startedAt);
    void notifyFinished(orgId, { kind: "video", creativeId, name: creative.name, ok: false, error: message });
    await saveVideoDocument(creativeId, { ...doc, meta: { ...(doc.meta ?? {}), lastError: message.slice(0, 500) } });
    throw err;
  }
}

registerJob("video.generate", runVideoPipeline);
