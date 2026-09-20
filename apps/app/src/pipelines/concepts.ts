import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  dbReady,
  brandKits,
  brands,
  briefs,
  concepts,
  creditLedger,
  generationEvents,
  products,
  projects,
  type ConceptData,
} from "@adcraft/db";
import {
  SAMPLE_MODEL,
  generateConceptsWith,
  isTextModelConfigured,
  type ConceptBrief,
  type ConceptKind,
  type PlatformTextLimits,
  type OnConcept,
} from "@adcraft/ai";
import { placementsFor, type Platform } from "@adcraft/specs";
import { getCatalog } from "@/server/model-catalog";
import { registerJob, type JobPayloads } from "@/server/jobs";
import type { StoredBriefData } from "@/server/briefs";

const CREDITS_PER_RUN = 1;

/** Brief platforms map onto @adcraft/specs platforms (Instagram shares Meta's placements). */
const SPEC_PLATFORM: Record<string, Platform> = {
  meta: "meta",
  instagram: "meta",
  tiktok: "tiktok",
  google: "google",
  youtube: "youtube",
};

/** Tightest copy limits per brief platform across all its placements. */
function limitsFor(platforms: string[]): Record<string, PlatformTextLimits> {
  const out: Record<string, PlatformTextLimits> = {};
  for (const p of platforms) {
    const spec = SPEC_PLATFORM[p];
    if (!spec) continue;
    const specs = placementsFor(spec);
    if (specs.length === 0) continue;
    const min = (field: keyof PlatformTextLimits) => {
      const values = specs.map((s) => s.text[field]).filter((n) => n > 0);
      return values.length ? Math.min(...values) : 0;
    };
    out[p] = { headline: min("headline"), primaryText: min("primaryText"), description: min("description") };
  }
  return out;
}

function toKind(kind: string): ConceptKind {
  return kind === "video" || kind === "ugc" ? kind : "static";
}

/**
 * brief -> Claude -> concepts rows. Updates the latest "started" text generation event
 * for the brief (recorded by the server action that dispatched us) and charges one credit
 * on success. Safe to call from the inline dispatcher or an Inngest step.
 */
export async function runConceptsPipeline(data: JobPayloads["concepts.generate"]) {
  await dbReady;
  const textModel = (await getCatalog()).default("text");
  const { orgId, briefId } = data;
  const count = data.count ?? 8;
  const startedAt = Date.now();

  const [row] = await db
    .select({ brief: briefs, project: projects, brand: brands, product: products })
    .from(briefs)
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .leftJoin(products, eq(products.id, briefs.productId))
    .where(and(eq(briefs.id, briefId), eq(briefs.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error(`Brief ${briefId} not found in org ${orgId}`);

  const [kit] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.brandId, row.brand.id), eq(brandKits.isActive, true)))
    .orderBy(desc(brandKits.version))
    .limit(1);

  // The event recorded by the dispatcher. Fallback: create one so the run is always accounted for.
  let [event] = await db
    .select()
    .from(generationEvents)
    .where(
      and(
        eq(generationEvents.orgId, orgId),
        eq(generationEvents.briefId, briefId),
        eq(generationEvents.capability, "text"),
        data.eventId ? eq(generationEvents.id, data.eventId) : eq(generationEvents.status, "started"),
      ),
    )
    .orderBy(desc(generationEvents.createdAt))
    .limit(1);
  if (!event) {
    if (data.eventId) throw new Error("Concept generation event not found for this brief and workspace");
    [event] = await db
      .insert(generationEvents)
      .values({
        orgId,
        briefId,
        capability: "text",
        provider: textModel.provider,
        model: isTextModelConfigured(textModel) ? textModel.id : SAMPLE_MODEL,
        status: "started",
        credits: CREDITS_PER_RUN,
        meta: { label: `${row.brief.title} · concepts`, detail: `${count} hooks and angles`, requestedConcepts: count, concepts: 0 },
      })
      .returning();
  }
  const eventId = event!.id;
  if (event!.status === "succeeded") return { briefId, eventId, count: Number(event!.meta?.concepts ?? count), model: event!.model };
  let savedCount = Number(event!.meta?.concepts ?? 0);
  const runMeta = () => ({ ...(event!.meta ?? {}), requestedConcepts: count, concepts: savedCount });
  await db.update(generationEvents).set({ status: "started", error: null, meta: runMeta() }).where(eq(generationEvents.id, eventId));

  const briefData = row.brief.data as StoredBriefData;
  const input: ConceptBrief = {
    brand: {
      name: row.brand.name,
      industry: row.brand.industry ?? undefined,
      tone: kit?.data.voice?.tone,
      doSay: kit?.data.voice?.doSay,
      dontSay: kit?.data.voice?.dontSay,
      tagline: kit?.data.tagline,
      ctaStyle: kit?.data.ctaStyle,
    },
    product: row.product
      ? {
          name: row.product.name,
          description: row.product.description ?? undefined,
          price: row.product.price ?? undefined,
          url: row.product.url ?? undefined,
          attributes: row.product.attributes ?? undefined,
        }
      : undefined,
    objective: briefData.objective,
    audience: briefData.audience,
    offer: briefData.offer,
    keyMessages: briefData.keyMessages,
    platforms: briefData.platforms,
    formats: briefData.formats,
    toneOverride: briefData.tone,
    constraints: briefData.constraints,
    platformLimits: limitsFor(briefData.platforms),
    count,
  };

  try {
    // Keep the model's format when it is one the brief asked for; otherwise round-robin
    // across the requested formats so every format gets concepts.
    const formats = briefData.formats.length ? briefData.formats : (["static"] as ConceptKind[]);
    const saveConcept: OnConcept = async (c, i, model) => {
      if (i >= count) throw new Error("The model returned more concepts than requested");
      const wanted = toKind(c.kind);
      const kind = formats.includes(wanted) ? wanted : formats[i % formats.length]!;
      const conceptData: ConceptData & { platformFit: string[] } = {
        hook: c.hook,
        angle: c.angle,
        headline: c.headline,
        primaryText: c.primaryText,
        description: c.description || undefined,
        cta: c.cta,
        visualDirection: c.visualDirection,
        scenePrompt: c.scenePrompt,
        script: kind === "static" ? undefined : c.script || undefined,
        platformFit: c.platformFit.length ? c.platformFit : briefData.platforms,
      };
      // Stable per-run ids make a retried stream safe without replacing a card the
      // user may already have selected or used to make an ad.
      const hash = createHash("sha256").update(`${eventId}:concept:${i}`).digest("hex");
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
      const nextCount = Math.max(savedCount, i + 1);
      await db.transaction(async (tx) => {
        await tx.insert(concepts).values({
          id,
          orgId,
          briefId,
          title: c.title,
          kind,
          status: "proposed" as const,
          data: conceptData,
          model,
        }).onConflictDoNothing();
        await tx.update(generationEvents).set({ model, meta: { ...runMeta(), concepts: nextCount } }).where(eq(generationEvents.id, eventId));
      });
      savedCount = nextCount;
    };
    const { output, usage } = await generateConceptsWith(input, textModel.id, saveConcept);
    if (output.concepts.length !== count) throw new Error(`Only ${output.concepts.length} of ${count} concepts were generated. Completed ideas have been saved.`);

    await db.transaction(async (tx) => {
      await tx
        .update(generationEvents)
        .set({
          status: "succeeded",
          model: usage.model,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          durationMs: Date.now() - startedAt,
          costUsd: (usage.costUsd ?? 0).toFixed(6),
          credits: CREDITS_PER_RUN,
          meta: runMeta(),
        })
        .where(eq(generationEvents.id, eventId));

      await tx
        .insert(creditLedger)
        .values({
          orgId,
          delta: -CREDITS_PER_RUN,
          reason: "generation",
          referenceId: eventId,
          meta: { briefId, capability: "text", model: usage.model },
        })
        .onConflictDoNothing();
    });

    return { briefId, eventId, count: savedCount, model: usage.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(generationEvents)
      .set({ status: "failed", error: message.slice(0, 2000), durationMs: Date.now() - startedAt, meta: runMeta() })
      .where(eq(generationEvents.id, eventId));
    throw err;
  }
}

registerJob("concepts.generate", runConceptsPipeline);
