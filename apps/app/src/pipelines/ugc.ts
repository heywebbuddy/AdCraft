import {
  HEYGEN_MODEL,
  captionSegments,
  downloadPresenter,
  downloadVideo,
  generatePresenter,
  generatePhotoPresenter,
  generateLibraryPresenter,
  presenterMotionPrompt,
  generateVideo,
  getModel,
  supportedDuration,
  synthesizeVoice,
} from "@adcraft/ai";
import type { VideoDocument } from "@adcraft/render/video";
import { notifyFinished } from "@/server/notify";
import { registerJob, type JobPayloads } from "@/server/jobs";
import { reserveGenerationCredits, refundGenerationCredits } from "@/server/generation-credits";
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
 * ugc.generate — UGC-style video (PLAN.md §4 job graph):
 *   script → voice (ElevenLabs) → presenter clip (HeyGen, licensed avatar) → B-roll (1–2
 *   product scene clips) → assemble with captions + hook text → resize → variant.ready
 *
 * Each step is skipped when its asset already exists on the document, so regenerating
 * one part (a B-roll scene, the voice) reuses the rest. 40 credits per full run
 * (PLAN.md §5 "UGC video, 30 s with presenter"); assembly-only re-runs are free.
 */
export async function runUgcPipeline(data: JobPayloads["ugc.generate"]) {
  const { orgId, creativeId } = data;
  const startedAt = Date.now();
  const { creative, doc: loaded } = await loadVideoCreative(orgId, creativeId);
  const doc: VideoDocument = { ...loaded, kind: "ugc", aiLabel: true };
  const modelSpec = getModel(doc.model);
  const productName = doc.product?.name ?? null;

  const lines = doc.scenes.filter((s) => s.role !== "broll");
  const broll = doc.scenes.filter((s) => s.role === "broll");
  const script = lines.map((s) => s.line.trim()).filter(Boolean).join(" ").trim() || doc.script;
  const needsVoice = !doc.voice?.audio?.key;
  const needsPresenter = !doc.presenter?.clip?.key;
  const brollToGenerate = broll.filter((s) => !s.clip?.key).length;
  const fullRun = needsVoice || needsPresenter;
  const credits = fullRun ? CREDIT_COSTS.ugcVideo30s : brollToGenerate > 0 ? Math.ceil((CREDIT_COSTS.ugcVideo30s * 0.25 * brollToGenerate) / Math.max(1, broll.length)) : 0;

  const rootEventId = await startEvent({
    orgId,
    creativeId,
    capability: "video",
    provider: "heygen",
    model: HEYGEN_MODEL,
    credits,
    label: `${creative.name} · UGC video`,
    detail: fullRun ? "Voice → presenter → B-roll → assemble" : brollToGenerate ? `${brollToGenerate} B-roll scene(s) to generate` : "Assembling sizes",
    step: "voice",
    meta: { kind: "ugc", root: true, avatarId: doc.presenter?.avatarId, voiceId: doc.voice?.voiceId },
  });
  doc.meta = { ...(doc.meta ?? {}), lastError: undefined, lastRunEventId: rootEventId };
  await saveVideoDocument(creativeId, doc);

  try {
    if (doc.meta?.characterStudio) await reserveGenerationCredits(orgId, credits, rootEventId);
    // 1. Voice-over. HeyGen voices are spoken by HeyGen itself inside the presenter step.
    const heygenVoice = doc.voice?.provider === "heygen";
    if (needsVoice && !heygenVoice) {
      await setEventStep(rootEventId, "voice", "Synthesising voice-over");
      const voiceId = doc.voice?.voiceId ?? "";
      const res = await withEvent(
        { orgId, creativeId, capability: "voice", provider: "elevenlabs", model: "", label: "Voice-over", detail: `${script.split(/\s+/).length} words`, step: "voice" },
        () => synthesizeVoice({ model: "", voiceId, text: script }),
        (r) => ({ durationSec: r.output.durationSec }),
      );
      const key = await storeRender(orgId, res.output.bytes, "mp3", "audio/mpeg");
      doc.voice = { voiceId, audio: { key, durationSec: res.output.durationSec } };
      await saveVideoDocument(creativeId, doc);
    }

    // 2. Presenter clip (licensed stock avatar) driven by the voice track.
    if (needsPresenter) {
      await setEventStep(rootEventId, "presenter", "Rendering AI presenter");
      const audioBytes = doc.voice?.audio ? await loadVideoAsset(doc.voice.audio) : null;
      const total = doc.voice?.audio?.durationSec;
      const portrait = doc.presenter?.image ? await loadVideoAsset(doc.presenter.image) : null;
      if (doc.presenter?.image && (!portrait || (!audioBytes && !heygenVoice))) throw new Error("The saved character image or voice track is unavailable.");
      const spoken = heygenVoice ? { script, voiceId: doc.voice?.voiceId } : { audio: audioBytes ?? undefined };
      const res = await withEvent(
        { orgId, creativeId, capability: "presenter", provider: "heygen", model: HEYGEN_MODEL, label: "Presenter", detail: doc.presenter?.avatarId ?? "stock avatar", step: "presenter" },
        () => portrait && (audioBytes || heygenVoice)
          ? generatePhotoPresenter({
              image: portrait,
              ...spoken,
              ratio: doc.ratio,
              durationSec: total ?? 30,
              expressiveness: doc.presenter?.motion?.expressiveness ?? "high",
              motionPrompt: presenterMotionPrompt(doc.presenter?.motion?.prompt),
            })
          : (audioBytes || heygenVoice) && doc.presenter?.avatarId
            ? generateLibraryPresenter({
                avatarId: doc.presenter.avatarId,
                ...spoken,
                ratio: doc.ratio,
                durationSec: total ?? 30,
                motionPrompt: presenterMotionPrompt(doc.presenter?.motion?.prompt),
              })
            : generatePresenter({
                model: HEYGEN_MODEL,
                avatarId: doc.presenter?.avatarId ?? "",
                script,
                ratio: doc.ratio,
                voiceId: doc.voice?.voiceId,
                audio: audioBytes ? { url: `data:audio/mpeg;base64,${audioBytes.toString("base64")}`, mimeType: "audio/mpeg", bytes: audioBytes, durationSec: total } : undefined,
                background: { color: doc.brand.colors.background },
                captions: total ? captionSegments(script, total) : undefined,
                brand: { name: doc.brand.name, background: doc.brand.colors.background, text: doc.brand.colors.text, accent: doc.brand.colors.accent, font: doc.brand.fonts.heading },
              }),
        (r) => ({ durationSec: r.output.durationSec }),
      );
      const bytes = await downloadPresenter(res.output);
      const key = await storeRender(orgId, bytes, "mp4", "video/mp4");
      doc.presenter = { ...doc.presenter, avatarId: doc.presenter?.avatarId ?? "", clip: { key, durationSec: res.output.durationSec ?? total } };
      await saveVideoDocument(creativeId, doc);
    }

    // 3. B-roll: product scene stills → clips.
    const cutoutBytes = doc.product?.cutout ? await loadVideoAsset(doc.product.cutout) : null;
    for (const [i, scene] of doc.scenes.entries()) {
      if (scene.role !== "broll" || scene.clip?.key) continue;
      const n = broll.indexOf(scene) + 1;
      if (!scene.still?.key) {
        await setEventStep(rootEventId, "broll", `B-roll ${n} of ${broll.length} · still`);
        const res = await withEvent(
          { orgId, creativeId, capability: "image", provider: "fal", model: "", label: `B-roll ${n} still`, detail: scene.prompt.slice(0, 80), step: "broll", meta: { sceneId: scene.id } },
          () => generateSceneStill({ model: doc.imageModel, prompt: scene.prompt, ratio: doc.ratio, reference: cutoutBytes ? { bytes: cutoutBytes } : null, seed: 100 + i }),
        );
        const key = await storeRender(orgId, res.png, "png", "image/png");
        doc.scenes[i] = { ...scene, still: { key }, error: undefined };
        await saveVideoDocument(creativeId, doc);
      }
      await setEventStep(rootEventId, "broll", `B-roll ${n} of ${broll.length} · ${modelSpec?.label ?? doc.model}`);
      const stillBytes = doc.scenes[i]!.still ? await loadVideoAsset(doc.scenes[i]!.still!) : null;
      const durationSec = supportedDuration(doc.model, scene.durationSec);
      const res = await withEvent(
        { orgId, creativeId, capability: "video", provider: modelSpec?.provider ?? "fal", model: doc.model, label: `B-roll ${n} clip`, detail: `${durationSec} s · ${modelSpec?.label ?? doc.model}`, step: "broll", meta: { sceneId: scene.id } },
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

    // 4. Assemble with captions + hook text at every size.
    await setEventStep(rootEventId, "assemble", "Assembling sizes with captions and hook");
    const results = await assembleVariants(orgId, creativeId, doc, (r) => setEventStep(rootEventId, "assemble", `${r.ratio} ${r.status}`));
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length === results.length && results.length > 0) throw new Error(failed[0]!.error ?? "All sizes failed to render");

    await succeedEvent(
      rootEventId,
      { provider: "heygen", model: HEYGEN_MODEL, durationMs: Date.now() - startedAt, units: doc.presenter?.clip?.durationSec ?? doc.voice?.audio?.durationSec },
      { step: "done", detail: `${results.length - failed.length} of ${results.length} sizes ready` },
      credits,
    );
    if (!doc.meta?.characterStudio) await chargeCredits(orgId, credits, rootEventId, { creativeId, capability: "ugc", model: doc.model, presenter: HEYGEN_MODEL });
    void notifyFinished(orgId, { kind: "video", creativeId, name: creative.name, ok: true });
    return { creativeId, eventId: rootEventId, credits, results };
  } catch (err) {
    if (doc.meta?.characterStudio) await refundGenerationCredits(orgId, rootEventId);
    const message = err instanceof Error ? err.message : String(err);
    await failEvent(rootEventId, err, startedAt);
    void notifyFinished(orgId, { kind: "video", creativeId, name: creative.name, ok: false, error: message });
    await saveVideoDocument(creativeId, { ...doc, meta: { ...(doc.meta ?? {}), lastError: message.slice(0, 500) } });
    throw err;
  }
}

registerJob("ugc.generate", runUgcPipeline);
