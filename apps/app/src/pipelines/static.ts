import { and, desc, eq } from "drizzle-orm";
import { db, dbReady, brandKits, briefs, concepts, creatives, creditLedger, generationEvents, products, projects } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import { defaultModel, downloadImage, generateImage, getModel, isFalConfigured, type ReferenceImage } from "@adcraft/ai";
import { normalizeDocument, type StaticAdDocument } from "@adcraft/render";
import { registerJob } from "@/server/jobs";
import { runRenderPipeline } from "./render";

const SCENE_RATIO = "4:5" as const;

/** Credits charged for one scene generation (PLAN.md §5 "Static ad, all sizes"). */
export const STATIC_SCENE_CREDITS = 2;

/** Prompt for the scene layer only: the template adds text, logo and CTA afterwards. */
export function buildScenePrompt(input: { visualDirection: string; tone: string[]; productName?: string; brandName: string }) {
  const tone = input.tone.length ? `Brand tone: ${input.tone.join(", ")}.` : "";
  const product = input.productName ? `The product is ${input.productName} by ${input.brandName}.` : `Brand: ${input.brandName}.`;
  return [
    input.visualDirection.trim(),
    product,
    tone,
    "Premium product photography, natural light, shallow depth of field, editorial composition with generous negative space for a headline.",
    "No text, no typography, no logos, no watermarks, no labels, no people’s faces in close-up.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * static.generate — paint the AI scene for a static creative, charge credits,
 * then render every size. The document's product/brand/copy layers are untouched.
 */
export async function runStaticPipeline({ orgId, creativeId, model }: { orgId: string; creativeId: string; model?: string }) {
  await dbReady;
  const [row] = await db
    .select({ creative: creatives, concept: concepts, brief: briefs, project: projects })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error(`Creative ${creativeId} not found in org ${orgId}`);

  const doc = normalizeDocument(row.creative.document as unknown as StaticAdDocument);
  const spec = getModel(model ?? (doc.meta?.model as string | undefined) ?? "") ?? defaultModel("image");
  const [kit] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.brandId, row.project.brandId), eq(brandKits.isActive, true)))
    .orderBy(desc(brandKits.version))
    .limit(1);
  const product = row.brief.productId ? (await db.select().from(products).where(eq(products.id, row.brief.productId)).limit(1))[0] ?? null : null;

  const startedAt = Date.now();
  const [event] = await db
    .insert(generationEvents)
    .values({
      orgId,
      briefId: row.brief.id,
      creativeId,
      capability: "image",
      provider: "fal",
      model: spec.id,
      status: "started",
      credits: STATIC_SCENE_CREDITS,
      units: "1",
      operationId: `static.generate:${creativeId}:${startedAt}`,
      meta: {
        label: `${row.creative.name} · scene`,
        detail: `${spec.label} · ${SCENE_RATIO}`,
        template: doc.template,
        offline: !isFalConfigured,
      },
    })
    .returning({ id: generationEvents.id });

  try {
    const prompt = buildScenePrompt({
      visualDirection: row.concept.data.visualDirection,
      tone: kit?.data.voice?.tone ?? [],
      productName: product?.name,
      brandName: doc.brand.name,
    });

    const references: ReferenceImage[] = [];
    const cutoutKey = product?.cutoutKey ?? doc.product?.cutoutKey;
    if (cutoutKey) {
      const storage = getStorage();
      const obj = await storage.get(cutoutKey);
      if (obj) references.push({ url: storage.url(cutoutKey), mimeType: obj.contentType, bytes: obj.body });
    }

    const { output, usage } = await generateImage({ model: spec.id, prompt, ratio: SCENE_RATIO, references, count: 1 });
    const first = output[0];
    if (!first) throw new Error("Image model returned no images");
    const png = await downloadImage(first);

    const storage = getStorage();
    const key = objectKey(orgId, "renders", "png");
    await storage.put(key, png, { contentType: "image/png" });

    const next: StaticAdDocument = {
      ...doc,
      scene: { kind: "image", key },
      meta: { ...(doc.meta ?? {}), model: spec.id, prompt, sceneEventId: event.id, lastError: undefined },
    };
    await db.update(creatives).set({ document: next as unknown as Record<string, unknown> }).where(eq(creatives.id, creativeId));

    await db
      .update(generationEvents)
      .set({
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        costUsd: usage.costUsd !== undefined ? String(usage.costUsd) : null,
        units: String(usage.units ?? 1),
        meta: { label: `${row.creative.name} · scene`, detail: `${spec.label} · ${SCENE_RATIO}`, template: doc.template, sceneKey: key, offline: !isFalConfigured },
      })
      .where(eq(generationEvents.id, event.id));

    // Charge once per successful scene; the event id makes the ledger row idempotent.
    await db
      .insert(creditLedger)
      .values({ orgId, delta: -STATIC_SCENE_CREDITS, reason: "generation", referenceId: event.id, meta: { creativeId, model: spec.id, capability: "image" } })
      .onConflictDoNothing();

    const rendered = await runRenderPipeline({ orgId, creativeId });
    return { sceneKey: key, eventId: event.id, rendered };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(generationEvents)
      .set({ status: "failed", error: message.slice(0, 2000), durationMs: Date.now() - startedAt })
      .where(eq(generationEvents.id, event.id));
    await db
      .update(creatives)
      .set({ document: { ...doc, meta: { ...(doc.meta ?? {}), model: spec.id, lastError: message } } as unknown as Record<string, unknown> })
      .where(eq(creatives.id, creativeId));
    throw err;
  }
}

registerJob("static.generate", runStaticPipeline);
