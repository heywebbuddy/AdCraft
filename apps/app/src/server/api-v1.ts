import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, dbReady, brands, briefs, concepts, creatives, projects } from "@adcraft/db";
import { approvalStatuses, creativeSummary, rendersFor, type RenderedSize } from "./collab-data";
import { baseUrl } from "./url";

// Shapes served by /api/v1. Render URLs point at the authenticated file route, so API
// consumers download them with the same bearer key. Stable, additive-only.

export type ApiRender = {
  variantId: string;
  placement: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  status: RenderedSize["status"];
  url: string | null;
};

export type ApiCreative = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  brand: { id: string; name: string };
  approval: "draft" | "in_review" | "approved" | "changes_requested";
  renders: ApiRender[];
  updatedAt: string;
};

function toApiRender(origin: string, s: RenderedSize): ApiRender {
  return {
    variantId: s.variantId,
    placement: s.placementId,
    label: s.label,
    ratio: s.ratio,
    width: s.width,
    height: s.height,
    status: s.status,
    url: s.outputKey ? `${origin}/api/v1/files/${s.outputKey}` : null,
  };
}

export async function apiListCreatives(orgId: string, opts: { brandId?: string | null; limit?: number; cursor?: string | null }): Promise<{ data: ApiCreative[]; nextCursor: string | null }> {
  await dbReady;
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db
    .select({ c: creatives, brandId: brands.id, brandName: brands.name })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(eq(creatives.orgId, orgId))
    .orderBy(desc(creatives.updatedAt), desc(creatives.id));
  let list = rows.filter((r) => !opts.brandId || r.brandId === opts.brandId);
  if (opts.cursor) {
    const i = list.findIndex((r) => r.c.id === opts.cursor);
    if (i >= 0) list = list.slice(i + 1);
  }
  const page = list.slice(0, limit);
  const ids = page.map((r) => r.c.id);
  const [sizes, statuses] = await Promise.all([rendersFor(ids), approvalStatuses(ids)]);
  const origin = await baseUrl();
  return {
    data: page.map((r) => ({
      id: r.c.id,
      name: r.c.name,
      kind: r.c.kind,
      brand: { id: r.brandId, name: r.brandName },
      approval: statuses.get(r.c.id) ?? "draft",
      renders: (sizes.get(r.c.id) ?? []).map((s) => toApiRender(origin, s)),
      updatedAt: r.c.updatedAt.toISOString(),
    })),
    nextCursor: list.length > limit ? page[page.length - 1].c.id : null,
  };
}

export async function apiGetCreative(orgId: string, creativeId: string): Promise<ApiCreative | null> {
  const c = await creativeSummary(creativeId, orgId);
  if (!c) return null;
  const [sizes, statuses] = await Promise.all([rendersFor([c.id]), approvalStatuses([c.id])]);
  const origin = await baseUrl();
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    brand: c.brand,
    approval: statuses.get(c.id) ?? "draft",
    renders: (sizes.get(c.id) ?? []).map((s) => toApiRender(origin, s)),
    updatedAt: c.updatedAt.toISOString(),
  };
}
