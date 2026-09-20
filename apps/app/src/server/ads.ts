import "server-only";
import { getOrgSettings } from "./platform-settings";
import { approvalStatuses } from "./collab-data";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  dbReady,
  adAccounts,
  adSets,
  ads,
  brands,
  briefs,
  campaigns,
  concepts,
  creatives,
  metricsDaily,
  products,
  projects,
  renders,
  variants,
} from "@adcraft/db";
import {
  PLATFORM_LABELS,
  PLATFORM_SPEC_PLATFORMS,
  addDays,
  getAdsProvider,
  isSandboxAccount,
  isoDate,
  platformConfigured,
  providerForAccount,
  type AdReview,
  type Creative as AdsCreative,
  type Objective,
  type Platform,
  type Targeting,
  type ValidationIssue,
  reviewClaims,
} from "@adcraft/ads";
import { getPlacement, placements as allPlacements, type PlacementSpec } from "@adcraft/specs";
import { decryptTokens, encryptTokens } from "./crypto";

// ---------- shared shapes ----------

export type CampaignStatus = "draft" | "paused" | "active" | "archived" | "error";

/** Placeholder external id for rows not yet created on the platform (external_id is NOT NULL + unique). */
export function pendingExternalId(seed: string) {
  return `draft:${seed}`;
}
export function isPending(externalId: string) {
  return externalId.startsWith("draft:");
}

/** What we keep in `campaigns.raw` on top of the platform payload. */
export type CampaignRaw = {
  objective?: Objective;
  targeting?: Targeting;
  placements?: string[];
  schedule?: { startAt?: string; endAt?: string };
  currency?: string;
  brandId?: string | null;
  extra?: Record<string, unknown>;
  publishMode?: "paused" | "active";
  error?: string | null;
  log?: Array<{ at: string; message: string }>;
  platform?: Record<string, unknown>;
};

export type AdRaw = {
  renderId?: string;
  placementId?: string;
  copy?: Pick<AdsCreative, "headline" | "primaryText" | "description" | "cta" | "landingUrl">;
  review?: AdReview;
  creativeName?: string;
  error?: string | null;
  platform?: Record<string, unknown>;
};

export type ConnectedAccount = {
  id: string;
  platform: Platform;
  externalId: string;
  name: string;
  currency: string;
  status: "connected" | "expired" | "revoked" | "error";
  sandbox: boolean;
  lastSyncedAt: Date | null;
  tokenExpiresAt: Date | null;
};

export type PlatformCard = {
  platform: Platform;
  label: string;
  configured: boolean;
  accounts: ConnectedAccount[];
};

export type CampaignListItem = {
  id: string;
  name: string;
  platform: Platform;
  sandbox: boolean;
  accountName: string;
  objective: Objective | null;
  status: CampaignStatus;
  dailyBudgetMinor: number | null;
  currency: string;
  adsCount: number;
  lastSyncedAt: Date | null;
  createdAt: Date;
  error: string | null;
};

export type AdDetail = {
  id: string;
  name: string;
  status: CampaignStatus;
  externalId: string;
  creativeExternalId: string | null;
  review: AdReview | null;
  creative: { id: string | null; name: string; placementId: string; placementLabel: string; ratio: string; previewUrl: string | null };
  lastSyncedAt: Date | null;
  error: string | null;
};

export type CampaignDetail = {
  id: string;
  name: string;
  status: CampaignStatus;
  platform: Platform;
  sandbox: boolean;
  externalId: string;
  objective: Objective | null;
  dailyBudgetMinor: number | null;
  currency: string;
  raw: CampaignRaw;
  account: { id: string; name: string; externalId: string; status: ConnectedAccount["status"] };
  adSets: Array<{ id: string; name: string; status: CampaignStatus; externalId: string; placements: string[]; targeting: Targeting | null; ads: AdDetail[] }>;
  lastSyncedAt: Date | null;
  createdAt: Date;
};

export type PublishableVariant = {
  variantId: string;
  renderId: string;
  placementId: string;
  placementLabel: string;
  ratio: string;
  width: number;
  height: number;
  fileBytes: number;
  mimeType: string;
  previewUrl: string;
  /** Pre-publish validation for the variant's own placement (spec platform → ads platform). */
  issues: ValidationIssue[];
};

export type PublishableCreative = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  copy: { headline: string; primaryText: string; description?: string; cta: string; landingUrl: string };
  aiGenerated: boolean;
  variants: PublishableVariant[];
};

// ---------- accounts ----------

function brandScope(brandId: string | null) {
  return brandId ? or(eq(adAccounts.brandId, brandId), isNull(adAccounts.brandId)) : undefined;
}

function toAccount(a: typeof adAccounts.$inferSelect): ConnectedAccount {
  return {
    id: a.id,
    platform: a.platform,
    externalId: a.externalId,
    name: a.name ?? a.externalId,
    currency: a.currency ?? "USD",
    status: a.status,
    sandbox: isSandboxAccount(a.externalId),
    lastSyncedAt: a.lastSyncedAt,
    tokenExpiresAt: a.tokenExpiresAt,
  };
}

export async function listAdAccounts(orgId: string, brandId: string | null): Promise<ConnectedAccount[]> {
  await dbReady;
  const rows = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.orgId, orgId), brandScope(brandId)))
    .orderBy(adAccounts.platform, adAccounts.createdAt);
  return rows.map(toAccount);
}

/**
 * Pages ads can run from, per connected account. Meta refuses to publish a link ad without one,
 * so the builder offers the account's own Pages instead of asking for an id. Failures are
 * swallowed: the builder falls back to a text field.
 */
export async function listPagesByAccount(orgId: string, brandId: string | null): Promise<Record<string, Array<{ id: string; name: string; category?: string }>>> {
  const accounts = (await listAdAccounts(orgId, brandId)).filter((a) => a.status === "connected");
  const out: Record<string, Array<{ id: string; name: string; category?: string }>> = {};
  await Promise.all(
    accounts.map(async (account) => {
      try {
        const [row] = await db.select().from(adAccounts).where(eq(adAccounts.id, account.id)).limit(1);
        if (!row) return;
        const { provider, ctx } = await accountContext(row);
        if (!provider.listPages) return;
        out[account.id] = await provider.listPages(ctx(`${account.id}:pages`));
      } catch (err) {
        console.warn("[ads] could not list pages", account.id, err instanceof Error ? err.message : err);
      }
    }),
  );
  return out;
}

export async function platformCards(orgId: string, brandId: string | null): Promise<PlatformCard[]> {
  const accounts = await listAdAccounts(orgId, brandId);
  return (["meta", "tiktok", "google"] as const).map((platform) => ({
    platform,
    label: PLATFORM_LABELS[platform],
    configured: platformConfigured(platform),
    accounts: accounts.filter((a) => a.platform === platform),
  }));
}

// ---------- campaigns ----------

export async function listCampaigns(orgId: string, brandId: string | null): Promise<CampaignListItem[]> {
  await dbReady;
  const rows = await db
    .select({ c: campaigns, a: adAccounts })
    .from(campaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(campaigns.orgId, orgId), brandScope(brandId)))
    .orderBy(desc(campaigns.createdAt));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ campaignId: adSets.campaignId, n: sql<number>`count(${ads.id})::int` })
    .from(adSets)
    .leftJoin(ads, eq(ads.adSetId, adSets.id))
    .where(
      inArray(
        adSets.campaignId,
        rows.map((r) => r.c.id),
      ),
    )
    .groupBy(adSets.campaignId);
  const countBy = new Map(counts.map((c) => [c.campaignId, c.n]));
  return rows.map(({ c, a }) => {
    const raw = (c.raw ?? {}) as CampaignRaw;
    return {
      id: c.id,
      name: c.name,
      platform: c.platform,
      sandbox: isSandboxAccount(a.externalId),
      accountName: a.name ?? a.externalId,
      objective: (c.objective as Objective | null) ?? raw.objective ?? null,
      status: c.status,
      dailyBudgetMinor: c.dailyBudgetMinor,
      currency: raw.currency ?? a.currency ?? "USD",
      adsCount: countBy.get(c.id) ?? 0,
      lastSyncedAt: c.lastSyncedAt,
      createdAt: c.createdAt,
      error: raw.error ?? null,
    };
  });
}

export async function getCampaign(orgId: string, campaignId: string): Promise<CampaignDetail | null> {
  await dbReady;
  const [row] = await db
    .select({ c: campaigns, a: adAccounts })
    .from(campaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!row) return null;
  const sets = await db.select().from(adSets).where(eq(adSets.campaignId, campaignId)).orderBy(adSets.createdAt);
  const adRows = sets.length
    ? await db
        .select({ ad: ads, variant: variants, creative: creatives })
        .from(ads)
        .leftJoin(variants, eq(variants.id, ads.variantId))
        .leftJoin(creatives, eq(creatives.id, variants.creativeId))
        .where(
          inArray(
            ads.adSetId,
            sets.map((s) => s.id),
          ),
        )
        .orderBy(ads.createdAt)
    : [];
  const renderIds = adRows.map((r) => (r.ad.raw as AdRaw | null)?.renderId).filter((x): x is string => Boolean(x));
  const renderRows = renderIds.length ? await db.select({ id: renders.id, outputKey: renders.outputKey }).from(renders).where(inArray(renders.id, renderIds)) : [];
  const renderKey = new Map(renderRows.map((r) => [r.id, r.outputKey]));
  const raw = (row.c.raw ?? {}) as CampaignRaw;

  return {
    id: row.c.id,
    name: row.c.name,
    status: row.c.status,
    platform: row.c.platform,
    sandbox: isSandboxAccount(row.a.externalId),
    externalId: row.c.externalId,
    objective: (row.c.objective as Objective | null) ?? raw.objective ?? null,
    dailyBudgetMinor: row.c.dailyBudgetMinor,
    currency: raw.currency ?? row.a.currency ?? "USD",
    raw,
    account: { id: row.a.id, name: row.a.name ?? row.a.externalId, externalId: row.a.externalId, status: row.a.status },
    adSets: sets.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      externalId: s.externalId,
      placements: s.placements ?? [],
      targeting: (s.targeting as Targeting | null) ?? null,
      ads: adRows
        .filter((r) => r.ad.adSetId === s.id)
        .map(({ ad, variant, creative }) => {
          const ar = (ad.raw ?? {}) as AdRaw;
          const placementId = variant?.placementId ?? ar.placementId ?? "";
          const key = ar.renderId ? renderKey.get(ar.renderId) : null;
          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            externalId: ad.externalId,
            creativeExternalId: ad.externalCreativeId,
            review: ar.review ?? null,
            creative: {
              id: creative?.id ?? null,
              name: creative?.name ?? ar.creativeName ?? ad.name,
              placementId,
              placementLabel: safePlacement(placementId)?.label ?? placementId,
              ratio: variant?.ratio ?? safePlacement(placementId)?.ratio ?? "",
              previewUrl: key ? `/api/files/${key}` : null,
            },
            lastSyncedAt: ad.lastSyncedAt,
            error: ar.error ?? null,
          };
        }),
    })),
    lastSyncedAt: row.c.lastSyncedAt,
    createdAt: row.c.createdAt,
  };
}

export function safePlacement(id: string): PlacementSpec | null {
  try {
    return getPlacement(id);
  } catch {
    return null;
  }
}

/** Spec placements that publish through a connection (Meta → meta.*, Google → google.* + youtube.*). */
export function placementsForPlatform(platform: Platform): PlacementSpec[] {
  const specPlatforms = PLATFORM_SPEC_PLATFORMS[platform];
  return allPlacements.filter((p) => specPlatforms.includes(p.platform));
}

export function adsPlatformForPlacement(placementId: string): Platform | null {
  const spec = safePlacement(placementId);
  if (!spec) return null;
  for (const [platform, specPlatforms] of Object.entries(PLATFORM_SPEC_PLATFORMS) as Array<[Platform, string[]]>) {
    if (specPlatforms.includes(spec.platform)) return platform;
  }
  return null;
}

// ---------- publishable creatives ----------

/** Finished creatives (latest render succeeded per variant) with pre-publish validation per variant. */
export async function listPublishableCreatives(orgId: string, brandId: string | null, opts: { landingUrl?: string } = {}): Promise<PublishableCreative[]> {
  await dbReady;
  const rows = await db
    .select({ creative: creatives, concept: concepts, brief: briefs, project: projects, brand: brands })
    .from(creatives)
    .innerJoin(concepts, eq(concepts.id, creatives.conceptId))
    .innerJoin(briefs, eq(briefs.id, concepts.briefId))
    .innerJoin(projects, eq(projects.id, briefs.projectId))
    .innerJoin(brands, eq(brands.id, projects.brandId))
    .where(brandId ? and(eq(creatives.orgId, orgId), eq(projects.brandId, brandId)) : eq(creatives.orgId, orgId))
    .orderBy(desc(creatives.updatedAt))
    .limit(60);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.creative.id);
  const productIds = rows.map((r) => r.brief.productId).filter((x): x is string => Boolean(x));
  const [vs, rs, ps] = await Promise.all([
    db.select().from(variants).where(inArray(variants.creativeId, ids)).orderBy(variants.createdAt),
    db
      .select({ r: renders })
      .from(renders)
      .innerJoin(variants, eq(variants.id, renders.variantId))
      .where(and(inArray(variants.creativeId, ids), eq(renders.status, "succeeded")))
      .orderBy(desc(renders.createdAt)),
    productIds.length ? db.select({ id: products.id, url: products.url }).from(products).where(inArray(products.id, productIds)) : Promise.resolve([] as Array<{ id: string; url: string | null }>),
  ]);
  const latest = new Map<string, typeof renders.$inferSelect>();
  for (const { r } of rs) if (!latest.has(r.variantId) && r.outputKey) latest.set(r.variantId, r);
  const productUrl = new Map(ps.map((p) => [p.id, p.url]));

  const requireApproval = (await getOrgSettings(orgId)).approvalBeforePublish === true;
  const approvals = requireApproval ? await approvalStatuses(rows.map((r) => r.creative.id)) : null;
  const out: PublishableCreative[] = [];
  for (const { creative, concept, brief, brand } of rows) {
    if (approvals && approvals.get(creative.id) !== "approved") continue;
    const doc = creative.document as { headline?: string; subhead?: string; cta?: string; scene?: { kind?: string } } | null;
    const landingUrl = (brief.productId ? productUrl.get(brief.productId) : null) ?? brand.website ?? opts.landingUrl ?? "";
    const copy = {
      headline: doc?.headline ?? concept.data.headline ?? "",
      primaryText: concept.data.primaryText ?? doc?.subhead ?? "",
      description: concept.data.description,
      cta: doc?.cta ?? concept.data.cta ?? "Learn more",
      landingUrl: landingUrl.startsWith("http") ? landingUrl : landingUrl ? `https://${landingUrl}` : "",
    };
    const aiGenerated = Boolean(doc?.scene?.kind && doc.scene.kind !== "gradient");
    // Claims review on the copy, hardened by the brief's constraints ("no medical claims").
    const claims = reviewClaims({ headline: copy.headline, primaryText: copy.primaryText, description: copy.description, cta: copy.cta }, brief.data.constraints ?? []);
    const mine = vs.filter((v) => v.creativeId === creative.id);
    const pv: PublishableVariant[] = [];
    for (const v of mine) {
      const r = latest.get(v.id);
      const spec = safePlacement(v.placementId);
      const platform = adsPlatformForPlacement(v.placementId);
      if (!r || !spec || !platform) continue;
      const adsCreative: AdsCreative = {
        kind: creative.kind === "static" ? "image" : "video",
        variantId: v.id,
        placementId: v.placementId,
        width: v.width,
        height: v.height,
        fileBytes: r.fileBytes ?? 0,
        mimeType: r.mimeType ?? "image/png",
        durationSec: v.durationSec ?? undefined,
        aiGenerated,
        brandName: brand.name,
        ...copy,
      };
      pv.push({
        variantId: v.id,
        renderId: r.id,
        placementId: v.placementId,
        placementLabel: spec.label,
        ratio: v.ratio,
        width: v.width,
        height: v.height,
        fileBytes: r.fileBytes ?? 0,
        mimeType: r.mimeType ?? "image/png",
        previewUrl:
          r.mimeType?.startsWith("video/") && typeof (r.meta as Record<string, unknown> | null)?.posterKey === "string"
            ? `/api/files/${(r.meta as Record<string, unknown>).posterKey as string}`
            : `/api/files/${r.outputKey}`,
        issues: [...getAdsProvider(platform).validate({ creative: adsCreative, placement: spec }), ...claims],
      });
    }
    if (pv.length) out.push({ id: creative.id, name: creative.name, kind: creative.kind, copy, aiGenerated, variants: pv });
  }
  return out;
}

// ---------- performance ----------

export type SeriesPoint = { date: string; spend: number; impressions: number; clicks: number; conversions: number; value: number; ctr: number; roas: number };

export type Totals = { spend: number; impressions: number; clicks: number; conversions: number; value: number; ctr: number; cpa: number | null; roas: number | null; cpm: number | null };

export type CreativeRow = {
  creativeId: string;
  name: string;
  previewUrl: string | null;
  platform: Platform;
  sandbox: boolean;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  value: number;
  ctr: number;
  cpa: number | null;
  roas: number | null;
  /** Daily CTR over the range, oldest first (for sparklines). */
  trend: number[];
  adIds: string[];
};

export type FatigueAlert = { creativeId: string; name: string; previewUrl: string | null; platform: Platform; ctrRecent: number; ctrPrior: number; drop: number };

export type DisapprovedAd = { adId: string; campaignId: string; campaignName: string; adName: string; creativeName: string; previewUrl: string | null; platform: Platform; reasons: string[]; checkedAt: Date | null };

export type PerformanceData = {
  days: number;
  since: string;
  until: string;
  currency: string;
  totals: Totals;
  previous: Totals;
  series: SeriesPoint[];
  creatives: CreativeRow[];
  alerts: FatigueAlert[];
  disapproved: DisapprovedAd[];
  accounts: number;
  hasData: boolean;
};

type MetricJoin = {
  m: typeof metricsDaily.$inferSelect;
  ad: typeof ads.$inferSelect;
  platform: Platform;
  accountExternalId: string;
  creativeId: string | null;
  creativeName: string | null;
  renderId: string | null;
};

async function loadMetricRows(orgId: string, brandId: string | null, since: string, until: string): Promise<MetricJoin[]> {
  await dbReady;
  const rows = await db
    .select({
      m: metricsDaily,
      ad: ads,
      platform: adAccounts.platform,
      accountExternalId: adAccounts.externalId,
      creativeId: creatives.id,
      creativeName: creatives.name,
    })
    .from(metricsDaily)
    .innerJoin(ads, eq(ads.id, metricsDaily.adId))
    .innerJoin(adSets, eq(adSets.id, ads.adSetId))
    .innerJoin(campaigns, eq(campaigns.id, adSets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .leftJoin(variants, eq(variants.id, ads.variantId))
    .leftJoin(creatives, eq(creatives.id, variants.creativeId))
    .where(and(eq(metricsDaily.orgId, orgId), gte(metricsDaily.date, since), lte(metricsDaily.date, until), brandScope(brandId)))
    .orderBy(metricsDaily.date);
  return rows.map((r) => ({ ...r, renderId: (r.ad.raw as AdRaw | null)?.renderId ?? null }));
}

function totals(rows: Array<{ m: typeof metricsDaily.$inferSelect }>): Totals {
  let spend = 0,
    impressions = 0,
    clicks = 0,
    conversions = 0,
    value = 0;
  for (const { m } of rows) {
    spend += m.spendMinor;
    impressions += m.impressions;
    clicks += m.clicks;
    conversions += m.conversions;
    value += m.conversionValueMinor ?? 0;
  }
  return {
    spend,
    impressions,
    clicks,
    conversions,
    value,
    ctr: impressions ? clicks / impressions : 0,
    cpa: conversions ? spend / conversions : null,
    roas: spend ? value / spend : null,
    cpm: impressions ? (spend / impressions) * 1000 : null,
  };
}

export function rangeFor(days: number, today = new Date()) {
  const until = isoDate(today);
  const since = addDays(until, -(days - 1));
  const prevUntil = addDays(since, -1);
  const prevSince = addDays(prevUntil, -(days - 1));
  return { since, until, prevSince, prevUntil };
}

export async function loadPerformance(orgId: string, brandId: string | null, days: number): Promise<PerformanceData> {
  const { since, until, prevSince, prevUntil } = rangeFor(days);
  const [rows, accountRows, disapproved] = await Promise.all([loadMetricRows(orgId, brandId, prevSince, until), listAdAccounts(orgId, brandId), listDisapprovedAds(orgId, brandId)]);
  const current = rows.filter((r) => r.m.date >= since);
  const previous = rows.filter((r) => r.m.date <= prevUntil);
  const currency = current[0]?.m.currency ?? accountRows[0]?.currency ?? "USD";

  // Daily series.
  const byDate = new Map<string, MetricJoin[]>();
  for (const r of current) byDate.set(r.m.date, [...(byDate.get(r.m.date) ?? []), r]);
  const series: SeriesPoint[] = [];
  for (let d = since; d <= until; d = addDays(d, 1)) {
    const t = totals(byDate.get(d) ?? []);
    series.push({ date: d, spend: t.spend, impressions: t.impressions, clicks: t.clicks, conversions: t.conversions, value: t.value, ctr: t.ctr, roas: t.roas ?? 0 });
  }

  // Per creative.
  const groups = new Map<string, MetricJoin[]>();
  for (const r of current) {
    const key = r.creativeId ?? `ad:${r.ad.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const renderIds = [...new Set(current.map((r) => r.renderId).filter((x): x is string => Boolean(x)))];
  const previews = await previewsFor(renderIds);
  const creativeRows: CreativeRow[] = [];
  const alerts: FatigueAlert[] = [];
  for (const [key, list] of groups) {
    const t = totals(list);
    const first = list[0]!;
    const dayCtr = new Map<string, { i: number; c: number }>();
    for (const { m } of list) {
      const cur = dayCtr.get(m.date) ?? { i: 0, c: 0 };
      dayCtr.set(m.date, { i: cur.i + m.impressions, c: cur.c + m.clicks });
    }
    const trend = series.map((p) => {
      const d = dayCtr.get(p.date);
      return d && d.i ? d.c / d.i : 0;
    });
    const previewUrl = previews.get(first.renderId ?? "") ?? null;
    const row: CreativeRow = {
      creativeId: key,
      name: first.creativeName ?? (first.ad.raw as AdRaw | null)?.creativeName ?? first.ad.name,
      previewUrl,
      platform: first.platform,
      sandbox: isSandboxAccount(first.accountExternalId),
      spend: t.spend,
      impressions: t.impressions,
      clicks: t.clicks,
      conversions: t.conversions,
      value: t.value,
      ctr: t.ctr,
      cpa: t.cpa,
      roas: t.roas,
      trend,
      adIds: [...new Set(list.map((r) => r.ad.id))],
    };
    creativeRows.push(row);

    // Fatigue: CTR over the last 5 days vs the 5 days before, when there is enough delivery.
    const win = (from: number, to: number) => {
      let i = 0,
        c = 0;
      for (let k = from; k < to; k++) {
        const d = dayCtr.get(series[k]?.date ?? "");
        if (d) {
          i += d.i;
          c += d.c;
        }
      }
      return { i, c, ctr: i ? c / i : 0 };
    };
    if (series.length >= 10) {
      const recent = win(series.length - 5, series.length);
      const prior = win(series.length - 10, series.length - 5);
      if (recent.i >= 1000 && prior.i >= 1000 && prior.ctr > 0) {
        const drop = 1 - recent.ctr / prior.ctr;
        if (drop >= 0.25) alerts.push({ creativeId: key, name: row.name, previewUrl, platform: row.platform, ctrRecent: recent.ctr, ctrPrior: prior.ctr, drop });
      }
    }
  }
  creativeRows.sort((a, b) => b.spend - a.spend);
  alerts.sort((a, b) => b.drop - a.drop);

  return {
    days,
    since,
    until,
    currency,
    totals: totals(current),
    previous: totals(previous),
    series,
    creatives: creativeRows,
    alerts,
    disapproved,
    accounts: accountRows.length,
    hasData: current.length > 0,
  };
}

async function previewsFor(renderIds: string[]) {
  if (!renderIds.length) return new Map<string, string>();
  const rows = await db.select({ id: renders.id, outputKey: renders.outputKey }).from(renders).where(inArray(renders.id, renderIds));
  return new Map(rows.filter((r) => r.outputKey).map((r) => [r.id, `/api/files/${r.outputKey}`]));
}

export async function listDisapprovedAds(orgId: string, brandId: string | null): Promise<DisapprovedAd[]> {
  await dbReady;
  const rows = await db
    .select({ ad: ads, campaign: campaigns, platform: adAccounts.platform, creativeName: creatives.name })
    .from(ads)
    .innerJoin(adSets, eq(adSets.id, ads.adSetId))
    .innerJoin(campaigns, eq(campaigns.id, adSets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .leftJoin(variants, eq(variants.id, ads.variantId))
    .leftJoin(creatives, eq(creatives.id, variants.creativeId))
    .where(and(eq(ads.orgId, orgId), brandScope(brandId), sql`${ads.raw}->'review'->>'status' = 'disapproved'`))
    .orderBy(desc(ads.updatedAt))
    .limit(20);
  const previews = await previewsFor(rows.map((r) => (r.ad.raw as AdRaw | null)?.renderId).filter((x): x is string => Boolean(x)));
  return rows.map((r) => {
    const raw = (r.ad.raw ?? {}) as AdRaw;
    return {
      adId: r.ad.id,
      campaignId: r.campaign.id,
      campaignName: r.campaign.name,
      adName: r.ad.name,
      creativeName: r.creativeName ?? raw.creativeName ?? r.ad.name,
      previewUrl: raw.renderId ? (previews.get(raw.renderId) ?? null) : null,
      platform: r.platform,
      reasons: raw.review?.reasons ?? [],
      checkedAt: raw.review?.checkedAt ? new Date(raw.review.checkedAt) : null,
    };
  });
}

// ---------- dashboard summary ----------

export type PerformanceSummary = {
  roas: number | null;
  roasPrev: number | null;
  spend: number;
  spendPrev: number;
  ctr: number;
  ctrPrev: number;
  cpa: number | null;
  cpaPrev: number | null;
  currency: string;
  days: number;
  connected: boolean;
  hasData: boolean;
  series: Array<{ date: string; spend: number; roas: number; ctr: number }>;
  winners: Array<{ creativeId: string; name: string; previewUrl: string | null; platform: Platform; roas: number | null; ctr: number; spend: number }>;
  alerts: Array<{ kind: "fatigue" | "disapproved"; creativeId: string | null; campaignId: string | null; name: string; detail: string; href: string }>;
  /** Per-creative rollup for the period, keyed by creative id (only creatives with delivery). */
  byCreative: Record<string, { platform: Platform; roas: number | null; ctr: number; spend: number; impressions: number }>;
  liveCampaigns: number;
};

/** Compact rollup for the dashboard's "This week" panel. */
export async function loadPerformanceSummary(orgId: string, brandId: string | null, days = 7): Promise<PerformanceSummary> {
  const p = await loadPerformance(orgId, brandId, days);
  const ranked = [...p.creatives].filter((c) => c.impressions > 0).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0) || b.ctr - a.ctr);
  const byCreative: PerformanceSummary["byCreative"] = {};
  for (const c of ranked) byCreative[c.creativeId] = { platform: c.platform, roas: c.roas, ctr: c.ctr, spend: c.spend, impressions: c.impressions };
  const [live] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.status, "active")));
  return {
    byCreative,
    liveCampaigns: live?.n ?? 0,
    roas: p.totals.roas,
    roasPrev: p.previous.roas,
    spend: p.totals.spend,
    spendPrev: p.previous.spend,
    ctr: p.totals.ctr,
    ctrPrev: p.previous.ctr,
    cpa: p.totals.cpa,
    cpaPrev: p.previous.cpa,
    currency: p.currency,
    days,
    connected: p.accounts > 0,
    hasData: p.hasData,
    series: p.series.map((s) => ({ date: s.date, spend: s.spend, roas: s.roas, ctr: s.ctr })),
    winners: ranked.slice(0, 3).map((c) => ({ creativeId: c.creativeId, name: c.name, previewUrl: c.previewUrl, platform: c.platform, roas: c.roas, ctr: c.ctr, spend: c.spend })),
    alerts: [
      ...p.alerts.slice(0, 3).map((a) => ({
        kind: "fatigue" as const,
        creativeId: a.creativeId,
        campaignId: null,
        name: a.name,
        detail: `CTR down ${Math.round(a.drop * 100)}% over 5 days`,
        href: "/performance#fatigue",
      })),
      ...p.disapproved.slice(0, 3).map((d) => ({
        kind: "disapproved" as const,
        creativeId: null,
        campaignId: d.campaignId,
        name: d.adName,
        detail: d.reasons[0] ?? "Disapproved by the platform",
        href: `/campaigns/${d.campaignId}`,
      })),
    ],
  };
}

// ---------- CSV export ----------

export async function performanceCsv(orgId: string, brandId: string | null, days: number): Promise<string> {
  const { since, until } = rangeFor(days);
  const rows = await loadMetricRows(orgId, brandId, since, until);
  const header = ["date", "platform", "creative", "ad", "ad_external_id", "currency", "spend", "impressions", "reach", "clicks", "ctr", "conversions", "conversion_value", "cpa", "roas", "video_views", "thruplays"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const m = r.m;
    const ctr = m.impressions ? m.clicks / m.impressions : 0;
    const cpa = m.conversions ? m.spendMinor / m.conversions / 100 : "";
    const roas = m.spendMinor ? (m.conversionValueMinor ?? 0) / m.spendMinor : "";
    lines.push(
      [
        m.date,
        r.platform,
        csv(r.creativeName ?? (r.ad.raw as AdRaw | null)?.creativeName ?? ""),
        csv(r.ad.name),
        csv(r.ad.externalId),
        m.currency ?? "",
        (m.spendMinor / 100).toFixed(2),
        m.impressions,
        m.reach ?? "",
        m.clicks,
        ctr.toFixed(4),
        m.conversions,
        ((m.conversionValueMinor ?? 0) / 100).toFixed(2),
        typeof cpa === "number" ? cpa.toFixed(2) : "",
        typeof roas === "number" ? roas.toFixed(2) : "",
        m.videoViews ?? "",
        m.thruplays ?? "",
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csv(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ---------- provider context for a connected account ----------

/**
 * Decrypts the account's tokens, refreshes them when they expire within 24 h, and returns
 * the provider plus a context factory. Marks the account `expired` when refresh fails.
 */
export async function accountContext(account: typeof adAccounts.$inferSelect) {
  const provider = providerForAccount(account.platform, account.externalId);
  let tokens = decryptTokens(account);
  const soon = Date.now() + 24 * 3600_000;
  const expiresAt = tokens.expiresAt?.getTime();
  if (expiresAt !== undefined && expiresAt < soon) {
    try {
      tokens = await provider.oauth.refresh(tokens);
      await db.update(adAccounts).set({ ...encryptTokens(tokens), status: "connected" }).where(eq(adAccounts.id, account.id));
    } catch (err) {
      if (expiresAt < Date.now()) {
        await db.update(adAccounts).set({ status: "expired" }).where(eq(adAccounts.id, account.id));
        throw new Error(`${PLATFORM_LABELS[account.platform]} connection expired; reconnect the account (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
  return {
    provider,
    tokens,
    ctx: (operationId: string) => ({ tokens, accountExternalId: account.externalId, operationId }),
  };
}
