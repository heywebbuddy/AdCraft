import { and, desc, eq } from "drizzle-orm";
import { db, dbReady, brandKits, briefs, concepts, creatives, creditLedger, generationEvents, products, projects, variants } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import { defaultModel, downloadImage, generateImage, getModel, type ReferenceImage } from "@adcraft/ai";
import { normalizeDocument, type StaticAdDocument } from "@adcraft/render";
import { runRenderPipeline } from "./render";
import { hydrateModels } from "@/server/model-catalog";

/**
 * AI-artwork mode: the image model designs the finished ad for each size, copy and
 * branding included, and the renderer exports that artwork as-is. One generation
 * per size; credits are the model's per-image price. Existing sizes are kept unless
 * the caller asks for a full regeneration.
 */
export type StaticAiOptions = {
  orgId: string;
  creativeId: string;
  model?: string;
  /** Extra direction from the user when refining. */
  instructions?: string;
  /** Only generate sizes that have no artwork yet. */
  onlyMissing?: boolean;
};

export async function runStaticAiPipeline({ orgId, creativeId, model, instructions, onlyMissing }: StaticAiOptions) {
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

  let doc = normalizeDocument(row.creative.document as unknown as StaticAdDocument);
  await hydrateModels();
  const spec = getModel(model ?? (doc.meta?.model as string | undefined) ?? "") ?? defaultModel("image");
  const creditsPerImage = Math.ceil(spec.creditsPerUnit ?? 2);

  const [kit] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.brandId, row.project.brandId), eq(brandKits.isActive, true)))
    .orderBy(desc(brandKits.version))
    .limit(1);
  const product = row.brief.productId ? (await db.select().from(products).where(eq(products.id, row.brief.productId)).limit(1))[0] ?? null : null;
  const vs = await db.select().from(variants).where(eq(variants.creativeId, creativeId)).orderBy(variants.createdAt);

  // One composition per distinct ratio; sizes sharing a ratio reuse it.
  const ratios = Array.from(new Set(vs.map((v) => v.ratio))) as Array<keyof NonNullable<StaticAdDocument["artwork"]>>;
  const todo = ratios.filter((r) => !(onlyMissing && doc.artwork?.[r]?.key));

  const storage = getStorage();
  const references: ReferenceImage[] = [];
  const cutoutKey = product?.cutoutKey ?? doc.product?.cutoutKey;
  if (cutoutKey) {
    const obj = await storage.get(cutoutKey);
    if (obj) references.push({ url: storage.url(cutoutKey), mimeType: obj.contentType, bytes: obj.body });
  }

  const prompt = buildCompositionPrompt({
    doc,
    visualDirection: row.concept.data.visualDirection,
    tone: kit?.data.voice?.tone ?? [],
    productName: product?.name,
    instructions,
  });

  let failed: string | null = null;
  for (const ratio of todo) {
    const startedAt = Date.now();
    const [event] = await db
      .insert(generationEvents)
      .values({
        orgId,
        briefId: row.brief.id,
        creativeId,
        capability: "image",
        provider: spec.provider,
        model: spec.id,
        status: "started",
        credits: creditsPerImage,
        units: "1",
        operationId: `static.ai:${creativeId}:${ratio}:${startedAt}`,
        meta: { label: `${row.creative.name} · ${ratio}`, detail: `${spec.label} · finished ad`, mode: "ai", ratio },
      })
      .returning({ id: generationEvents.id });
    try {
      // When refining an existing size, hand the model the current artwork as a reference.
      const refs = [...references];
      const current = doc.artwork?.[ratio]?.key;
      if (instructions && current) {
        const obj = await storage.get(current);
        if (obj) refs.push({ url: storage.url(current), mimeType: obj.contentType, bytes: obj.body });
      }
      const { output, usage } = await generateImage({ model: spec.id, prompt: `${prompt} Aspect ratio ${ratio}.`, ratio: ratio as never, references: refs, count: 1 });
      const first = output[0];
      if (!first) throw new Error("Image model returned no images");
      const png = await downloadImage(first);
      const key = objectKey(orgId, "renders", "png");
      await storage.put(key, png, { contentType: "image/png" });

      doc = { ...doc, mode: "ai", artwork: { ...(doc.artwork ?? {}), [ratio]: { key } }, meta: { ...(doc.meta ?? {}), model: spec.id, prompt, lastError: undefined } };
      await db.update(creatives).set({ document: doc as unknown as Record<string, unknown> }).where(eq(creatives.id, creativeId));

      await db
        .update(generationEvents)
        .set({
          status: "succeeded",
          durationMs: Date.now() - startedAt,
          costUsd: usage.costUsd !== undefined ? String(usage.costUsd) : null,
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
          meta: { label: `${row.creative.name} · ${ratio}`, detail: `${spec.label} · finished ad`, mode: "ai", ratio, artworkKey: key },
        })
        .where(eq(generationEvents.id, event.id));
      await db
        .insert(creditLedger)
        .values({ orgId, delta: -creditsPerImage, reason: "generation", referenceId: event.id, meta: { creativeId, model: spec.id, capability: "image", ratio } })
        .onConflictDoNothing();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed = message;
      await db.update(generationEvents).set({ status: "failed", durationMs: Date.now() - startedAt, error: message.slice(0, 2000) }).where(eq(generationEvents.id, event.id));
      console.error(`[static.ai] ${creativeId} ${ratio} failed`, err);
    }
  }

  if (failed) {
    await db
      .update(creatives)
      .set({ document: { ...doc, meta: { ...(doc.meta ?? {}), lastError: failed } } as unknown as Record<string, unknown> })
      .where(eq(creatives.id, creativeId));
  }
  // Export whatever artwork exists; sizes without artwork stay pending.
  const rendered = await runRenderPipeline({ orgId, creativeId });
  return { generated: todo.length, failed, rendered };
}

export function buildCompositionPrompt(input: {
  doc: StaticAdDocument;
  visualDirection: string;
  tone: string[];
  productName?: string;
  instructions?: string;
}) {
  const { doc } = input;
  const c = doc.brand.colors;
  return [
    `Design a finished, ready-to-run social media advert for ${doc.brand.name}${input.productName ? `, promoting ${input.productName}` : ""}.`,
    `Headline, set large and legible: "${doc.headline}".`,
    doc.subhead ? `Supporting line: "${doc.subhead}".` : "",
    `Call-to-action button reading "${doc.cta}".`,
    `Brand colours: primary ${c.primary}, accent ${c.accent}, background ${c.background}, text ${c.text}. Headline typeface in the spirit of ${doc.brand.fonts.heading}.`,
    input.tone.length ? `Mood: ${input.tone.join(", ")}.` : "",
    `Art direction: ${input.visualDirection}`,
    input.productName ? `Show the real product from the reference image exactly as it is; do not redesign its packaging or label.` : "",
    `Spell every word exactly as given. No lorem ipsum, no extra text, no watermarks, no logos other than the brand name.`,
    `Keep all text and the product inside the safe area, away from the edges.`,
    input.instructions?.trim() ? `Refinement from the client: ${input.instructions.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
