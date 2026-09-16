import { and, eq, inArray, max, notLike, sql } from "drizzle-orm";
import { db, dbReady, adAccounts, adSets, ads, campaigns, metricsDaily } from "@adcraft/db";
import { addDays, isoDate, type Metrics } from "@adcraft/ads";
import { registerJob } from "@/server/jobs";
import { accountContext, type AdRaw } from "@/server/ads";

const BACKFILL_DAYS = 7;
const OVERLAP_DAYS = 2;
/** Sandbox metrics are synthetic and free, so keep a full month on hand for the demo views. */
const SANDBOX_BACKFILL_DAYS = 30;

/**
 * insights.sync — hourly per connected account (PLAN.md section 4): fetch daily metrics
 * since max(date) − 2 days (7-day backfill on first run) and upsert `metrics_daily` keyed
 * (ad_id, date). Also refreshes each ad's review outcome.
 */
export async function runInsightsPipeline({ orgId, adAccountId }: { orgId: string; adAccountId?: string }) {
  await dbReady;
  const accounts = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.orgId, orgId), eq(adAccounts.status, "connected"), ...(adAccountId ? [eq(adAccounts.id, adAccountId)] : [])));
  const results: Array<{ adAccountId: string; rows: number; error?: string }> = [];
  for (const account of accounts) {
    try {
      const rows = await syncAccount(account);
      results.push({ adAccountId: account.id, rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[insights.sync] account ${account.id} failed`, err);
      results.push({ adAccountId: account.id, rows: 0, error: message });
    }
  }
  return { orgId, results };
}

async function syncAccount(account: typeof adAccounts.$inferSelect): Promise<number> {
  const adRows = await db
    .select({ id: ads.id, externalId: ads.externalId, raw: ads.raw, campaignId: adSets.campaignId })
    .from(ads)
    .innerJoin(adSets, eq(adSets.id, ads.adSetId))
    .innerJoin(campaigns, eq(campaigns.id, adSets.campaignId))
    .where(and(eq(campaigns.adAccountId, account.id), notLike(ads.externalId, "draft:%")));
  const now = new Date();
  if (adRows.length === 0) {
    await db.update(adAccounts).set({ lastSyncedAt: now }).where(eq(adAccounts.id, account.id));
    return 0;
  }
  const { provider, ctx } = await accountContext(account);
  const adIds = adRows.map((a) => a.id);
  const byExternal = new Map(adRows.map((a) => [a.externalId, a]));

  const [{ latest }] = await db
    .select({ latest: max(metricsDaily.date) })
    .from(metricsDaily)
    .where(inArray(metricsDaily.adId, adIds));
  const until = isoDate(now);
  const since = provider.sandbox ? addDays(until, -SANDBOX_BACKFILL_DAYS) : latest ? addDays(String(latest), -OVERLAP_DAYS) : addDays(until, -BACKFILL_DAYS);

  const metrics = await provider.fetchInsights(ctx(`insights:${account.id}:${until}`), {
    accountExternalId: account.externalId,
    since,
    until,
    adExternalIds: adRows.map((a) => a.externalId),
    currency: account.currency ?? undefined,
  });

  let written = 0;
  const values = metrics
    .map((m: Metrics) => {
      const ad = byExternal.get(m.adExternalId);
      if (!ad) return null;
      return {
        orgId: account.orgId,
        adId: ad.id,
        date: m.date,
        spendMinor: m.spendMinor,
        currency: m.currency,
        impressions: m.impressions,
        reach: m.reach ?? null,
        clicks: m.clicks,
        conversions: m.conversions,
        conversionValueMinor: m.conversionValueMinor ?? null,
        videoViews: m.videoViews ?? null,
        thruplays: m.thruplays ?? null,
        raw: m.raw ?? null,
        syncedAt: now,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  for (let i = 0; i < values.length; i += 200) {
    const batch = values.slice(i, i + 200);
    await db
      .insert(metricsDaily)
      .values(batch)
      .onConflictDoUpdate({
        target: [metricsDaily.adId, metricsDaily.date],
        set: {
          spendMinor: sql`excluded.spend_minor`,
          currency: sql`excluded.currency`,
          impressions: sql`excluded.impressions`,
          reach: sql`excluded.reach`,
          clicks: sql`excluded.clicks`,
          conversions: sql`excluded.conversions`,
          conversionValueMinor: sql`excluded.conversion_value_minor`,
          videoViews: sql`excluded.video_views`,
          thruplays: sql`excluded.thruplays`,
          raw: sql`excluded.raw`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
    written += batch.length;
  }

  // Review / delivery outcomes.
  try {
    const reviews = await provider.fetchAdReviews(ctx(`reviews:${account.id}`), adRows.map((a) => a.externalId));
    for (const ad of adRows) {
      const review = reviews[ad.externalId];
      if (!review) continue;
      const raw = { ...((ad.raw ?? {}) as AdRaw), review };
      await db.update(ads).set({ raw, lastSyncedAt: now }).where(eq(ads.id, ad.id));
    }
  } catch (err) {
    console.warn(`[insights.sync] review fetch failed for ${account.id}`, err);
  }

  const campaignIds = [...new Set(adRows.map((a) => a.campaignId))];
  if (campaignIds.length) await db.update(campaigns).set({ lastSyncedAt: now }).where(inArray(campaigns.id, campaignIds));
  await db.update(adAccounts).set({ lastSyncedAt: now }).where(eq(adAccounts.id, account.id));
  return written;
}

/** Every connected account across all organisations — the hourly cron entry point. */
export async function syncAllAccounts() {
  await dbReady;
  const rows = await db.select({ id: adAccounts.id, orgId: adAccounts.orgId }).from(adAccounts).where(eq(adAccounts.status, "connected"));
  const out: Array<{ adAccountId: string; rows: number; error?: string }> = [];
  for (const r of rows) {
    const res = await runInsightsPipeline({ orgId: r.orgId, adAccountId: r.id });
    out.push(...res.results);
  }
  return { accounts: rows.length, results: out };
}

registerJob("insights.sync", runInsightsPipeline);
