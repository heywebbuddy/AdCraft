import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, dbReady, briefs, concepts, projects } from "@adcraft/db";

export type BulkBrief = {
  id: string;
  title: string;
  createdAt: Date;
  concepts: Array<{ id: string; title: string; kind: "static" | "video" | "ugc"; status: "proposed" | "selected" | "rejected"; headline: string; hook: string }>;
};

/** Every brief of the brand with its concepts, newest brief first, for the bulk picker. */
export async function listBriefsWithConcepts(orgId: string, brandId: string | null): Promise<BulkBrief[]> {
  await dbReady;
  const rows = await db
    .select({ id: briefs.id, title: briefs.title, createdAt: briefs.createdAt })
    .from(briefs)
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(brandId ? and(eq(briefs.orgId, orgId), eq(projects.brandId, brandId)) : eq(briefs.orgId, orgId))
    .orderBy(desc(briefs.createdAt));
  if (rows.length === 0) return [];
  const list = await db
    .select()
    .from(concepts)
    .where(inArray(concepts.briefId, rows.map((r) => r.id)))
    .orderBy(concepts.createdAt, concepts.id);
  return rows.map((b) => ({
    ...b,
    concepts: list
      .filter((c) => c.briefId === b.id)
      .map((c) => ({ id: c.id, title: c.title, kind: c.kind, status: c.status, headline: c.data.headline, hook: c.data.hook })),
  }));
}
