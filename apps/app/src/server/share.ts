import "server-only";
import { and, eq } from "drizzle-orm";
import { db, dbReady, brands, briefs, concepts, creatives, projects, renders, shareLinks, variants } from "@adcraft/db";
import { approvedCreativesForBrand, creativeSummary, getApproval, listComments, rendersFor, type ApprovalRecord, type CreativeSummary, type RenderedSize, type ReviewComment } from "./collab-data";

export type ShareLink = typeof shareLinks.$inferSelect;

export type SharedCreative = {
  creative: CreativeSummary;
  sizes: RenderedSize[];
  approval: ApprovalRecord | null;
  comments: ReviewComment[];
};

export type ShareView =
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "empty" }
  | { ok: true; link: ShareLink; kind: "review"; brandName: string; item: SharedCreative }
  | { ok: true; link: ShareLink; kind: "gallery"; brandName: string; items: SharedCreative[] };

/** Validate a share token and return what it exposes. No session required. */
export async function validShareLink(token: string): Promise<{ ok: true; link: ShareLink } | { ok: false; reason: "invalid" | "expired" | "revoked" }> {
  await dbReady;
  if (!token || token.length > 128) return { ok: false, reason: "invalid" };
  const link = await db.query.shareLinks.findFirst({ where: eq(shareLinks.token, token) });
  if (!link) return { ok: false, reason: "invalid" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && link.expiresAt < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, link };
}

export async function loadShare(token: string): Promise<ShareView> {
  const v = await validShareLink(token);
  if (!v.ok) return v;
  const { link } = v;

  if (link.kind === "review" && link.creativeId) {
    const creative = await creativeSummary(link.creativeId, link.orgId);
    if (!creative) return { ok: false, reason: "invalid" };
    const [sizesMap, approval, cmts] = await Promise.all([rendersFor([creative.id]), getApproval(creative.id), listComments(creative.id)]);
    return {
      ok: true,
      link,
      kind: "review",
      brandName: creative.brand.name,
      item: { creative, sizes: sizesMap.get(creative.id) ?? [], approval, comments: cmts },
    };
  }

  if (link.brandId) {
    const brand = await db.query.brands.findFirst({ where: and(eq(brands.id, link.brandId), eq(brands.orgId, link.orgId)) });
    if (!brand) return { ok: false, reason: "invalid" };
    const list = await approvedCreativesForBrand(brand.id);
    const sizesMap = await rendersFor(list.map((c) => c.id));
    return {
      ok: true,
      link,
      kind: "gallery",
      brandName: brand.name,
      items: list.map((creative) => ({ creative, sizes: sizesMap.get(creative.id) ?? [], approval: { status: "approved", requestedBy: null, decidedBy: null, decidedAt: null, note: null, updatedAt: creative.updatedAt }, comments: [] })),
    };
  }
  return { ok: false, reason: "invalid" };
}

/**
 * May this share link serve the stored object `key`? True when the key is the output of a
 * render belonging to a creative the link exposes.
 */
export async function shareLinkCoversKey(link: ShareLink, key: string): Promise<boolean> {
  await dbReady;
  const [row] = await db
    .select({ creativeId: variants.creativeId, brandId: projects.brandId })
    .from(renders)
    .innerJoin(variants, eq(variants.id, renders.variantId))
    .innerJoin(creatives, eq(creatives.id, variants.creativeId))
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .where(and(eq(renders.outputKey, key), eq(renders.orgId, link.orgId)))
    .limit(1);
  if (!row) return false;
  if (link.kind === "review") return row.creativeId === link.creativeId;
  if (link.brandId !== row.brandId) return false;
  const approved = await approvedCreativesForBrand(link.brandId);
  return approved.some((c) => c.id === row.creativeId);
}
