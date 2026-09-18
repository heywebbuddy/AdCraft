import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, dbReady, ads, adSets, adAccounts, campaigns, metricsDaily, variants, creatives, renders } from "@adcraft/db";
import { isSandboxAccount, type Platform } from "@adcraft/ads";
import { getApproval, type ApprovalStatus } from "./collab-data";

/**
 * Where a creative is in its life, and what the sensible next action is. One query set
 * feeds the "Next" panel on the creative and video pages so the user never has to work
 * out on their own that a finished ad wants a campaign, or a live one wants numbers.
 */
export type CreativeStage = "rendering" | "failed" | "draft" | "in_review" | "changes_requested" | "approved" | "live" | "paused";

export type CreativeNext = {
  stage: CreativeStage;
  approval: ApprovalStatus;
  /** Campaigns this creative is in (through its variants' ads). */
  campaigns: Array<{ id: string; name: string; status: string; platform: Platform; sandbox: boolean; adCount: number }>;
  /** Last 7 days across all of this creative's ads, if it has any delivery. */
  performance: { spend: number; impressions: number; clicks: number; ctr: number; roas: number | null; currency: string } | null;
  /** Finished sizes, for "Add to campaign" eligibility. */
  readySizes: number;
};

export async function creativeNext(orgId: string, creativeId: string, renderStatus: "ready" | "rendering" | "failed"): Promise<CreativeNext> {
  await dbReady;
  const [approval, variantRows] = await Promise.all([
    getApproval(creativeId),
    db.select({ id: variants.id }).from(variants).where(and(eq(variants.creativeId, creativeId), eq(variants.orgId, orgId))),
  ]);
  const variantIds = variantRows.map((v) => v.id);
  const approvalStatus: ApprovalStatus = approval?.status ?? "draft";

  const readySizes = variantIds.length
    ? (
        await db
          .select({ variantId: renders.variantId, status: renders.status, createdAt: renders.createdAt })
          .from(renders)
          .where(and(eq(renders.orgId, orgId), inArray(renders.variantId, variantIds)))
          .orderBy(desc(renders.createdAt))
      ).reduce((seen, r) => {
        if (!seen.has(r.variantId)) seen.set(r.variantId, r.status);
        return seen;
      }, new Map<string, string>())
    : new Map<string, string>();
  const ready = [...readySizes.values()].filter((s) => s === "succeeded").length;

  const adRows = variantIds.length
    ? await db
        .select({ adId: ads.id, campaignId: campaigns.id, campaignName: campaigns.name, campaignStatus: campaigns.status, platform: adAccounts.platform, externalId: adAccounts.externalId, currency: adAccounts.currency })
        .from(ads)
        .innerJoin(adSets, eq(adSets.id, ads.adSetId))
        .innerJoin(campaigns, eq(campaigns.id, adSets.campaignId))
        .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
        .where(and(eq(ads.orgId, orgId), inArray(ads.variantId, variantIds)))
    : [];

  const byCampaign = new Map<string, CreativeNext["campaigns"][number]>();
  for (const r of adRows) {
    const cur = byCampaign.get(r.campaignId);
    if (cur) cur.adCount += 1;
    else byCampaign.set(r.campaignId, { id: r.campaignId, name: r.campaignName, status: r.campaignStatus, platform: r.platform, sandbox: isSandboxAccount(r.externalId), adCount: 1 });
  }
  const campaignList = [...byCampaign.values()].filter((c) => c.status !== "archived");

  let performance: CreativeNext["performance"] = null;
  if (adRows.length) {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const [m] = await db
      .select({
        spend: sql<number>`coalesce(sum(${metricsDaily.spendMinor}), 0)::bigint`,
        impressions: sql<number>`coalesce(sum(${metricsDaily.impressions}), 0)::bigint`,
        clicks: sql<number>`coalesce(sum(${metricsDaily.clicks}), 0)::bigint`,
        value: sql<number>`coalesce(sum(${metricsDaily.conversionValueMinor}), 0)::bigint`,
      })
      .from(metricsDaily)
      .where(and(eq(metricsDaily.orgId, orgId), inArray(metricsDaily.adId, adRows.map((r) => r.adId)), gte(metricsDaily.date, since)));
    const spend = Number(m?.spend ?? 0), impressions = Number(m?.impressions ?? 0), clicks = Number(m?.clicks ?? 0), value = Number(m?.value ?? 0);
    if (impressions > 0 || spend > 0) performance = { spend, impressions, clicks, ctr: impressions ? clicks / impressions : 0, roas: spend ? value / spend : null, currency: adRows[0]!.currency ?? "USD" };
  }

  const liveStatuses = new Set(campaignList.map((c) => c.status));
  const stage: CreativeStage =
    renderStatus === "rendering" ? "rendering"
    : renderStatus === "failed" && ready === 0 ? "failed"
    : liveStatuses.has("active") ? "live"
    : campaignList.length ? "paused"
    : approvalStatus === "approved" ? "approved"
    : approvalStatus === "in_review" ? "in_review"
    : approvalStatus === "changes_requested" ? "changes_requested"
    : "draft";

  return { stage, approval: approvalStatus, campaigns: campaignList, performance, readySizes: ready };
}

/** The concept a creative came from, for "make a variant". */
export async function creativeConceptId(orgId: string, creativeId: string): Promise<string | null> {
  await dbReady;
  const [row] = await db.select({ conceptId: creatives.conceptId }).from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  return row?.conceptId ?? null;
}
