import "server-only";
import { and, desc, eq, inArray, or, isNull } from "drizzle-orm";
import {
  db,
  dbReady,
  approvals,
  brands,
  briefs,
  comments,
  concepts,
  creatives,
  projects,
  renders,
  shareLinks,
  templates,
  users,
  variants,
} from "@adcraft/db";
import { getPlacement } from "@adcraft/specs";

export type ApprovalStatus = "draft" | "in_review" | "approved" | "changes_requested";

export type RenderedSize = {
  variantId: string;
  placementId: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  outputKey: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "none";
};

export type ReviewComment = {
  id: string;
  variantId: string | null;
  authorName: string;
  authorId: string | null;
  body: string;
  resolvedAt: Date | null;
  createdAt: Date;
};

export type ApprovalRecord = {
  status: ApprovalStatus;
  requestedBy: { name: string | null } | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
  updatedAt: Date;
};

export type CreativeSummary = {
  id: string;
  orgId: string;
  name: string;
  kind: "static" | "video" | "ugc";
  document: Record<string, unknown>;
  brand: { id: string; name: string };
  updatedAt: Date;
};

function placementLabel(id: string) {
  try {
    return getPlacement(id).label;
  } catch {
    return id;
  }
}

/** Each variant of the given creatives with its most recent render. */
export async function rendersFor(creativeIds: string[]): Promise<Map<string, RenderedSize[]>> {
  const out = new Map<string, RenderedSize[]>();
  if (creativeIds.length === 0) return out;
  await dbReady;
  const vs = await db.select().from(variants).where(inArray(variants.creativeId, creativeIds)).orderBy(variants.createdAt);
  const rs = vs.length
    ? await db
        .select()
        .from(renders)
        .where(inArray(renders.variantId, vs.map((v) => v.id)))
        .orderBy(desc(renders.createdAt))
    : [];
  const latest = new Map<string, (typeof rs)[number]>();
  for (const r of rs) if (!latest.has(r.variantId)) latest.set(r.variantId, r);
  for (const v of vs) {
    const r = latest.get(v.id);
    const list = out.get(v.creativeId) ?? [];
    list.push({
      variantId: v.id,
      placementId: v.placementId,
      label: placementLabel(v.placementId),
      ratio: v.ratio,
      width: v.width,
      height: v.height,
      outputKey: r?.status === "succeeded" ? r.outputKey : null,
      status: r?.status ?? "none",
    });
    out.set(v.creativeId, list);
  }
  return out;
}

/** Creative + owning brand, scoped to an org (or unscoped when orgId is null, for token-based access). */
export async function creativeSummary(creativeId: string, orgId: string | null): Promise<CreativeSummary | null> {
  await dbReady;
  const [row] = await db
    .select({ c: creatives, brandId: brands.id, brandName: brands.name })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(orgId ? and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId)) : eq(creatives.id, creativeId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.c.id,
    orgId: row.c.orgId,
    name: row.c.name,
    kind: row.c.kind,
    document: row.c.document,
    brand: { id: row.brandId, name: row.brandName },
    updatedAt: row.c.updatedAt,
  };
}

export async function listComments(creativeId: string): Promise<ReviewComment[]> {
  await dbReady;
  const rows = await db.select().from(comments).where(eq(comments.creativeId, creativeId)).orderBy(comments.createdAt);
  return rows.map((c) => ({
    id: c.id,
    variantId: c.variantId,
    authorName: c.authorName,
    authorId: c.authorId,
    body: c.body,
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
  }));
}

export async function getApproval(creativeId: string): Promise<ApprovalRecord | null> {
  await dbReady;
  const [row] = await db
    .select({ a: approvals, requesterName: users.name })
    .from(approvals)
    .leftJoin(users, eq(users.id, approvals.requestedBy))
    .where(eq(approvals.creativeId, creativeId))
    .limit(1);
  if (!row) return null;
  let decidedBy: string | null = row.a.decidedByName;
  if (!decidedBy && row.a.decidedBy) {
    const u = await db.query.users.findFirst({ where: eq(users.id, row.a.decidedBy) });
    decidedBy = u?.name ?? u?.email ?? null;
  }
  return {
    status: row.a.status,
    requestedBy: row.a.requestedBy ? { name: row.requesterName } : null,
    decidedBy,
    decidedAt: row.a.decidedAt,
    note: row.a.note,
    updatedAt: row.a.updatedAt,
  };
}

/** Approval status for many creatives at once (list views, galleries, API). */
export async function approvalStatuses(creativeIds: string[]): Promise<Map<string, ApprovalStatus>> {
  const out = new Map<string, ApprovalStatus>();
  if (creativeIds.length === 0) return out;
  await dbReady;
  const rows = await db
    .select({ creativeId: approvals.creativeId, status: approvals.status })
    .from(approvals)
    .where(inArray(approvals.creativeId, creativeIds));
  for (const r of rows) out.set(r.creativeId, r.status);
  return out;
}

export type ShareLinkRow = typeof shareLinks.$inferSelect;

export async function listShareLinks(orgId: string, creativeId: string): Promise<ShareLinkRow[]> {
  await dbReady;
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.orgId, orgId), eq(shareLinks.creativeId, creativeId), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt));
}

export async function listBrandShareLinks(orgId: string, brandId: string): Promise<ShareLinkRow[]> {
  await dbReady;
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.orgId, orgId), eq(shareLinks.brandId, brandId), eq(shareLinks.kind, "gallery"), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt));
}

export type TemplateRow = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  brandId: string | null;
  brandName: string | null;
  isShared: boolean;
  document: Record<string, unknown>;
  createdAt: Date;
};

/**
 * Templates usable by a brand: its own plus every shared template in the org.
 * `brandId` null → everything in the org; `kind` null → every kind.
 */
export async function listTemplatesFor(orgId: string, brandId: string | null, kind: "static" | "video" | "ugc" | null): Promise<TemplateRow[]> {
  await dbReady;
  const scope = brandId ? or(eq(templates.brandId, brandId), eq(templates.isShared, true)) : undefined;
  const rows = await db
    .select({ t: templates, brandName: brands.name })
    .from(templates)
    .leftJoin(brands, eq(brands.id, templates.brandId))
    .where(and(eq(templates.orgId, orgId), scope, kind ? eq(templates.kind, kind) : undefined))
    .orderBy(desc(templates.createdAt));
  return rows.map(({ t, brandName }) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    brandId: t.brandId,
    brandName,
    isShared: t.isShared,
    document: t.document,
    createdAt: t.createdAt,
  }));
}

/** Approved creatives of a brand (for gallery share links and the API). */
export async function approvedCreativesForBrand(brandId: string): Promise<CreativeSummary[]> {
  await dbReady;
  const rows = await db
    .select({ c: creatives, brandId: brands.id, brandName: brands.name })
    .from(approvals)
    .innerJoin(creatives, eq(creatives.id, approvals.creativeId))
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(and(eq(approvals.status, "approved"), eq(brands.id, brandId)))
    .orderBy(desc(approvals.updatedAt));
  return rows.map((r) => ({
    id: r.c.id,
    orgId: r.c.orgId,
    name: r.c.name,
    kind: r.c.kind,
    document: r.c.document,
    brand: { id: r.brandId, name: r.brandName },
    updatedAt: r.c.updatedAt,
  }));
}
