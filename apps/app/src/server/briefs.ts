import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  dbReady,
  briefs,
  concepts,
  generationEvents,
  products,
  projects,
  type BriefData,
  creatives,
} from "@adcraft/db";
import { SAMPLE_MODEL } from "@adcraft/ai";
import { getCatalog } from "./model-catalog";
import { assertGenerationAllowed } from "./guardrails";
import { dispatch } from "./jobs";
import "@/pipelines";

export { FORMATS, OBJECTIVES, PLATFORMS, type FormatId, type Objective } from "@/lib/brief-fields";

/** Brief-level fields stored in `briefs.data` on top of the shared `BriefData` shape. */
export type BriefExtras = { tone?: string };
export type StoredBriefData = BriefData & BriefExtras;

export const DEFAULT_CONCEPT_COUNT = 8;
export const MORE_CONCEPT_COUNT = 4;

export type BriefListItem = {
  id: string;
  title: string;
  objective: string;
  formats: BriefData["formats"];
  platforms: string[];
  conceptCount: number;
  generating: boolean;
  createdAt: Date;
};

/** Briefs for a brand (via projects.brandId), newest first. */
export async function listBriefs(orgId: string, brandId: string | null): Promise<BriefListItem[]> {
  await dbReady;
  const rows = await db
    .select({ brief: briefs })
    .from(briefs)
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(brandId ? and(eq(briefs.orgId, orgId), eq(projects.brandId, brandId)) : eq(briefs.orgId, orgId))
    .orderBy(desc(briefs.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.brief.id);
  const [counts, running] = await Promise.all([
    db
      .select({ briefId: concepts.briefId, n: sql<number>`count(*)::int` })
      .from(concepts)
      .where(inArray(concepts.briefId, ids))
      .groupBy(concepts.briefId),
    db
      .select({ briefId: generationEvents.briefId })
      .from(generationEvents)
      .where(
        and(
          eq(generationEvents.orgId, orgId),
          eq(generationEvents.capability, "text"),
          eq(generationEvents.status, "started"),
          inArray(generationEvents.briefId, ids),
        ),
      ),
  ]);
  const countBy = new Map(counts.map((c) => [c.briefId, c.n]));
  const runningSet = new Set(running.map((r) => r.briefId));

  return rows.map(({ brief }) => ({
    id: brief.id,
    title: brief.title,
    objective: brief.data.objective,
    formats: brief.data.formats,
    platforms: brief.data.platforms,
    conceptCount: countBy.get(brief.id) ?? 0,
    generating: runningSet.has(brief.id),
    createdAt: brief.createdAt,
  }));
}

/** Products of a brand for the brief form's product select. */
export async function listProductsForBrand(orgId: string, brandId: string | null) {
  await dbReady;
  if (!brandId) return [];
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.brandId, brandId)))
    .orderBy(products.name);
}

export type BriefDetail = {
  brief: typeof briefs.$inferSelect;
  project: typeof projects.$inferSelect;
  product: { id: string; name: string } | null;
  concepts: Array<typeof concepts.$inferSelect>;
  /** Latest concept-generation event for this brief, if any. */
  event: typeof generationEvents.$inferSelect | null;
};

export async function loadBrief(orgId: string, briefId: string): Promise<BriefDetail | null> {
  await dbReady;
  const [row] = await db
    .select({ brief: briefs, project: projects, productId: products.id, productName: products.name })
    .from(briefs)
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .leftJoin(products, eq(products.id, briefs.productId))
    .where(and(eq(briefs.id, briefId), eq(briefs.orgId, orgId)))
    .limit(1);
  if (!row) return null;

  const [list, [event]] = await Promise.all([
    // A batch insert shares one created_at, so break ties on id to keep the order stable across refreshes.
    db.select().from(concepts).where(eq(concepts.briefId, briefId)).orderBy(concepts.createdAt, concepts.id),
    db
      .select()
      .from(generationEvents)
      .where(
        and(
          eq(generationEvents.orgId, orgId),
          eq(generationEvents.briefId, briefId),
          eq(generationEvents.capability, "text"),
        ),
      )
      .orderBy(desc(generationEvents.createdAt))
      .limit(1),
  ]);

  return {
    brief: row.brief,
    project: row.project,
    product: row.productId ? { id: row.productId, name: row.productName ?? "" } : null,
    concepts: list,
    event: event ?? null,
  };
}

export async function conceptsModel() {
  const m = (await getCatalog()).default("text");
  return m.connected ? m.id : SAMPLE_MODEL;
}

/** Records the "started" generation_events row and kicks off the concepts job. */
export async function startConceptsRun(input: {
  orgId: string;
  userId: string;
  briefId: string;
  title: string;
  count: number;
}) {
  await dbReady;
  await assertGenerationAllowed(input.orgId, "concepts");
  const [event] = await db
    .insert(generationEvents)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      briefId: input.briefId,
      capability: "text",
      provider: "anthropic",
      model: await conceptsModel(),
      status: "started",
      credits: 1,
      meta: { label: `${input.title} · concepts`, detail: `${input.count} hooks and angles`, requestedConcepts: input.count, concepts: 0 },
    })
    .returning();
  await dispatch("concepts.generate", { orgId: input.orgId, briefId: input.briefId, count: input.count, eventId: event!.id });
  return event;
}

/**
 * Prefill for "start from a winner" / "refresh a tired creative": the source brief's
 * fields plus the concept's angle, so the next brief keeps what worked and asks for a
 * fresh execution.
 */
export async function briefPrefillFromCreative(orgId: string, creativeId: string): Promise<{ title: string; productId: string | null; objective: string; audience: string; offer: string; platforms: string[]; formats: string[]; tone: string; constraints: string[]; note: string } | null> {
  await dbReady;
  const [row] = await db
    .select({ creative: creatives, concept: concepts, brief: briefs })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId)))
    .limit(1);
  if (!row) return null;
  const d = row.brief.data;
  const angle = row.concept.data.angle ?? row.concept.title;
  return {
    title: `${row.brief.title} · next round`,
    productId: row.brief.productId ?? null,
    objective: d.objective,
    audience: d.audience,
    offer: d.offer ?? "",
    platforms: d.platforms,
    formats: d.formats,
    tone: d.tone ?? "",
    constraints: [...(d.constraints ?? []), `Build on what worked: "${row.concept.data.hook ?? row.creative.name}" (${angle}). New hooks and visuals, same promise.`],
    note: `Starting from “${row.creative.name}” — the ${angle} angle. Concepts will keep the promise and change the execution.`,
  };
}
