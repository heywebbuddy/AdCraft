import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, briefs, concepts, creatives, generationEvents, projects, renders, variants, adAccounts, approvals, products } from "@adcraft/db";

export type WallTile = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  ratio: string;
  status: "draft" | "rendered" | "failed";
  previewUrl: string | null;
  model: string | null;
  updatedAt: Date;
  headline: string | null;
  brand: string | null;
};

export type QueueItem = {
  id: string;
  label: string;
  detail: string;
  credits: number;
  startedAt: Date;
};

export async function loadDashboard(orgId: string, brandId: string | null) {
  const [running, tiles, counts, accounts, changes] = await Promise.all([
    loadQueue(orgId),
    loadWall(orgId, brandId),
    loadCounts(orgId, brandId),
    db.select({ externalId: adAccounts.externalId }).from(adAccounts).where(eq(adAccounts.orgId, orgId)),
    db
      .select({ creativeId: approvals.creativeId, note: approvals.note, name: creatives.name })
      .from(approvals)
      .innerJoin(creatives, eq(creatives.id, approvals.creativeId))
      .where(and(eq(approvals.orgId, orgId), eq(approvals.status, "changes_requested")))
      .orderBy(desc(approvals.updatedAt))
      .limit(3),
  ]);
  return {
    queue: running,
    tiles,
    counts,
    adAccountsConnected: accounts.length,
    sandboxOnly: accounts.length > 0 && accounts.every((a) => a.externalId.startsWith("sandbox")),
    changeRequests: changes,
  };
}

async function loadQueue(orgId: string): Promise<QueueItem[]> {
  const rows = await db
    .select()
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), eq(generationEvents.status, "started")))
    .orderBy(desc(generationEvents.createdAt))
    .limit(4);
  return rows.map((r) => ({
    id: r.id,
    label: (r.meta?.label as string | undefined) ?? `${r.capability} · ${r.model}`,
    detail: (r.meta?.detail as string | undefined) ?? r.model,
    credits: r.credits,
    startedAt: r.createdAt,
  }));
}

async function loadWall(orgId: string, brandId: string | null): Promise<WallTile[]> {
  const rows = await db
    .select({
      creative: creatives,
      concept: concepts,
      brief: briefs,
      project: projects,
    })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(brandId ? and(eq(creatives.orgId, orgId), eq(projects.brandId, brandId)) : eq(creatives.orgId, orgId))
    .orderBy(desc(creatives.updatedAt))
    .limit(8);
  if (rows.length === 0) return [];

  const creativeIds = rows.map((r) => r.creative.id);
  const failedEvents = await db
    .select({ creativeId: generationEvents.creativeId, error: generationEvents.error })
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), eq(generationEvents.status, "failed"), inArray(generationEvents.creativeId, creativeIds)));
  const startedEvents = await db
    .select({ creativeId: generationEvents.creativeId })
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), eq(generationEvents.status, "started"), inArray(generationEvents.creativeId, creativeIds)));
  const vs = await db
    .select({ v: variants, r: renders })
    .from(variants)
    .leftJoin(renders, eq(renders.variantId, variants.id))
    .where(inArray(variants.creativeId, creativeIds))
    .orderBy(desc(renders.createdAt));

  return rows.map(({ creative, concept }) => {
    const ratioRank: Record<string, number> = { "4:5": 0, "9:16": 1, "1:1": 2, "16:9": 3, "1.91:1": 4 };
    const mine = vs
      .filter((x) => x.v.creativeId === creative.id)
      .sort((a, b) => (ratioRank[a.v.ratio] ?? 9) - (ratioRank[b.v.ratio] ?? 9));
    const done = mine.find((x) => x.r?.status === "succeeded" && x.r.outputKey);
    const failed = mine.some((x) => x.r?.status === "failed") || (!done && failedEvents.some((e) => e.creativeId === creative.id) && !startedEvents.some((e) => e.creativeId === creative.id));
    const first = done ?? mine[0];
    const doc = creative.document as { headline?: string; model?: string } | null;
    return {
      id: creative.id,
      name: creative.name,
      kind: creative.kind,
      ratio: first?.v.ratio ?? "4:5",
      status: done ? "rendered" : failed ? "failed" : "draft",
      previewUrl: previewKeyFor(done?.r ?? null),
      model: doc?.model ?? concept.model ?? null,
      updatedAt: creative.updatedAt,
      headline: concept.data.headline ?? doc?.headline ?? null,
      brand: null,
    };
  });
}

async function loadCounts(orgId: string, brandId: string | null) {
  const [c] = await db
    .select({
      creatives: sql<number>`count(distinct ${creatives.id})::int`,
    })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(brandId ? and(eq(creatives.orgId, orgId), eq(projects.brandId, brandId)) : eq(creatives.orgId, orgId));
  const [b] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(briefs)
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(brandId ? and(eq(briefs.orgId, orgId), eq(projects.brandId, brandId)) : eq(briefs.orgId, orgId));
  const [f] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(renders)
    .where(and(eq(renders.orgId, orgId), eq(renders.status, "failed")));
  const [pr] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(brandId ? and(eq(products.orgId, orgId), eq(products.brandId, brandId)) : eq(products.orgId, orgId));
  const failedPipelines = await db
    .select({ creativeId: generationEvents.creativeId, error: generationEvents.error, label: generationEvents.meta })
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), eq(generationEvents.status, "failed")))
    .orderBy(desc(generationEvents.createdAt))
    .limit(3);
  return { creatives: c?.creatives ?? 0, briefs: b?.n ?? 0, products: pr?.n ?? 0, failedRenders: f?.n ?? 0, failedPipelines };
}

/** Image renders preview directly; video renders use the poster frame stored in meta. */
function previewKeyFor(r: { outputKey: string | null; mimeType: string | null; meta: Record<string, unknown> | null } | null) {
  if (!r?.outputKey) return null;
  if (r.mimeType?.startsWith("video/")) {
    const poster = r.meta?.posterKey;
    return typeof poster === "string" ? `/api/files/${poster}` : null;
  }
  return `/api/files/${r.outputKey}`;
}
