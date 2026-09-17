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
/**
 * The scene is a BACKGROUND layer. The product cutout, headline, CTA and logo are
 * composited by the template engine, so the image model must not paint a product,
 * packaging or any text — otherwise the render shows two bottles and clashing copy.
 */
export function buildScenePrompt(input: { visualDirection: string; scenePrompt?: string; tone: string[]; productName?: string; brandName: string }) {
  const tone = input.tone.length ? `Mood: ${input.tone.join(", ")}.` : "";
  const scene = (input.scenePrompt?.trim() || stripProductAndText(input.visualDirection)).trim();
  return [
    scene,
    tone,
    "Empty background plate for a premium advert: natural light, shallow depth of field, editorial composition, large clean negative space in the lower half and one side where a headline and a product will be placed later.",
    "Absolutely no product, no bottle, no packaging, no hands, no people, no text, no letters, no typography, no logos, no watermarks, no labels, no stickers, no graphics.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function stripProductAndText(visual: string): string {
  const kept = visual
    .split(/(?<=[.;])\s+/)
    .filter((sentence) => !/\b(text|headline|logo|typograph|graphic|caption|label|product|bottle|jar|tube|hand|holding|held|stamp|badge)\b/i.test(sentence))
    .join(" ")
    .trim();
  return kept || "Soft minimal studio backdrop with a warm gradient and a clean surface.";
}

/**
 * static.generate — paint the AI scene for a static creative, charge credits,
 * then render every size. The document's product/brand/copy layers are untouched.
 */
export async function runStaticPipeline({ orgId, creativeId, model, mode, instructions, onlyMissing }: { orgId: string; creativeId: string; model?: string; mode?: "editable" | "ai"; instructions?: string; onlyMissing?: boolean }) {
  await dbReady;
  {
    // AI-artwork creatives: the model designs each size; see static-ai.ts.
    const [head] = await db.select({ document: creatives.document }).from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
    const docMode = (head?.document as { mode?: string } | null)?.mode;
    if (mode === "ai" || docMode === "ai") {
      const { runStaticAiPipeline } = await import("./static-ai");
      return runStaticAiPipeline({ orgId, creativeId, model, instructions, onlyMissing });
    }
  }
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
      scenePrompt: row.concept.data.scenePrompt,
      tone: kit?.data.voice?.tone ?? [],
      productName: product?.name,
      brandName: doc.brand.name,
    });

    // No product reference: the cutout is composited as its own layer by the template
    // engine, and passing it makes edit models paint a second copy into the scene.
    const references: ReferenceImage[] = [];

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
