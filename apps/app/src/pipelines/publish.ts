import { and, eq, inArray } from "drizzle-orm";
import { db, dbReady, adAccounts, adSets, ads, brandKits, campaigns, renders, variants } from "@adcraft/db";
import { getStorage } from "@adcraft/storage";
import type { AdInput, AdsContext, AdsProvider, Creative, LiveStatus, Objective, Targeting, UploadedCreative } from "@adcraft/ads";
import { registerJob } from "@/server/jobs";
import { accountContext, isPending, type AdRaw, type CampaignRaw } from "@/server/ads";

/**
 * publish.campaign — creates the campaign graph on the platform in order
 * (campaign → ad sets → upload creative → ads). Every write is idempotent: a row whose
 * external id is already real is skipped, and each create carries its `operationId`, so a
 * retry after a crash resumes where it stopped and never duplicates platform objects.
 */
export async function runPublishPipeline({ orgId, campaignId }: { orgId: string; campaignId: string }) {
  await dbReady;
  const [row] = await db
    .select({ c: campaigns, a: adAccounts })
    .from(campaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error(`Campaign ${campaignId} not found in org ${orgId}`);
  const campaign = row.c;
  const raw = (campaign.raw ?? {}) as CampaignRaw;
  const mode: LiveStatus = raw.publishMode ?? "paused";
  const log = (message: string) => {
    raw.log = [...(raw.log ?? []).slice(-30), { at: new Date().toISOString(), message }];
  };

  const fail = async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed: ${message}`);
    await db
      .update(campaigns)
      .set({ status: "error", raw: { ...raw, error: message.slice(0, 2000) } })
      .where(eq(campaigns.id, campaignId));
    console.error(`[publish.campaign] ${campaignId} failed`, err);
    return { campaignId, status: "error" as const, error: message };
  };

  try {
    if (row.a.status !== "connected") throw new Error(`Ad account ${row.a.name ?? row.a.externalId} is ${row.a.status}; reconnect it before publishing.`);
    const { provider, ctx } = await accountContext(row.a);
    const objective: Objective = (campaign.objective as Objective | null) ?? raw.objective ?? "traffic";
    const currency = raw.currency ?? row.a.currency ?? "USD";
    const budget = { dailyCents: campaign.dailyBudgetMinor ?? 0, currency };
    const extra: Record<string, unknown> = { ...(raw.extra ?? {}) };
    raw.error = null;

    // Google Demand Gen ads need a square logo asset: upload the brand kit logo once per campaign.
    if (provider.platform === "google" && !provider.sandbox && !extra.logoAsset) {
      const logo = await loadBrandLogo(orgId, raw.brandId ?? row.a.brandId ?? null);
      if (logo) {
        const up = await provider.uploadCreative(ctx(`${campaign.operationId ?? campaign.id}:logo`), {
          creative: { ...logo.creative },
          bytes: logo.bytes,
          fileName: "logo.png",
        });
        extra.logoAsset = up.externalId;
        raw.extra = extra;
      }
    }

    // 1. Campaign.
    let campaignExternalId = campaign.externalId;
    if (isPending(campaignExternalId)) {
      const created = await provider.createCampaign(ctx(campaign.operationId ?? campaign.id), {
        name: campaign.name,
        objective,
        status: mode,
        budget,
        schedule: raw.schedule,
        extra,
      });
      campaignExternalId = created.externalId;
      log(`Campaign created on ${provider.label}: ${created.externalId}`);
      await db
        .update(campaigns)
        .set({ externalId: created.externalId, raw: { ...raw, extra, platform: created.raw ?? {} }, lastSyncedAt: new Date() })
        .where(eq(campaigns.id, campaignId));
    }

    // 2. Ad sets.
    const sets = await db.select().from(adSets).where(eq(adSets.campaignId, campaignId)).orderBy(adSets.createdAt);
    for (const set of sets) {
      if (!isPending(set.externalId)) continue;
      const created = await provider.createAdSet(ctx(set.operationId ?? set.id), {
        campaignExternalId,
        name: set.name,
        objective,
        status: mode,
        targeting: (set.targeting as Targeting | null) ?? raw.targeting ?? { countries: ["US"], ageMin: 18, ageMax: 65, genders: [], interests: [] },
        placements: set.placements ?? raw.placements ?? [],
        budget: { dailyCents: set.dailyBudgetMinor ?? budget.dailyCents, currency },
        schedule: raw.schedule,
        extra,
      });
      set.externalId = created.externalId;
      log(`Ad set "${set.name}" created: ${created.externalId}`);
      await db.update(adSets).set({ externalId: created.externalId, status: mode, raw: created.raw ?? {}, lastSyncedAt: new Date() }).where(eq(adSets.id, set.id));
    }

    // 3. Ads (upload creative, then create).
    const adRows = sets.length
      ? await db
          .select({ ad: ads, variant: variants })
          .from(ads)
          .leftJoin(variants, eq(variants.id, ads.variantId))
          .where(
            inArray(
              ads.adSetId,
              sets.map((s) => s.id),
            ),
          )
          .orderBy(ads.createdAt)
      : [];
    const storage = getStorage();
    for (const { ad, variant } of adRows) {
      if (!isPending(ad.externalId)) continue;
      const set = sets.find((s) => s.id === ad.adSetId)!;
      const adRaw = (ad.raw ?? {}) as AdRaw;
      try {
        const render = adRaw.renderId ? (await db.select().from(renders).where(eq(renders.id, adRaw.renderId)).limit(1))[0] : undefined;
        if (!render?.outputKey) throw new Error(`Ad "${ad.name}" has no finished render to upload.`);
        const creative: Creative = {
          kind: render.mimeType?.startsWith("video/") ? "video" : "image",
          variantId: ad.variantId ?? "",
          placementId: variant?.placementId ?? adRaw.placementId ?? "",
          width: variant?.width ?? 0,
          height: variant?.height ?? 0,
          fileBytes: render.fileBytes ?? 0,
          mimeType: render.mimeType ?? "image/png",
          durationSec: variant?.durationSec ?? undefined,
          headline: adRaw.copy?.headline ?? "",
          primaryText: adRaw.copy?.primaryText ?? "",
          description: adRaw.copy?.description,
          cta: adRaw.copy?.cta ?? "Learn more",
          landingUrl: adRaw.copy?.landingUrl ?? "",
          brandName: (extra.brandName as string | undefined) ?? undefined,
        };

        // Upload once: the platform creative id is stored before the ad is created.
        let uploaded: UploadedCreative;
        if (ad.externalCreativeId && adRaw.platform?.uploaded) {
          uploaded = adRaw.platform.uploaded as UploadedCreative;
        } else {
          const obj = await storage.get(render.outputKey);
          if (!obj) throw new Error(`Render file ${render.outputKey} is missing from storage.`);
          uploaded = await provider.uploadCreative(ctx(`${ad.operationId ?? ad.id}:upload`), {
            creative,
            bytes: obj.body,
            fileName: `${ad.name.replace(/[^\w.-]+/g, "_").slice(0, 60)}.${extOf(render.mimeType)}`,
          });
          adRaw.platform = { ...(adRaw.platform ?? {}), uploaded };
          await db.update(ads).set({ externalCreativeId: uploaded.externalId, raw: adRaw }).where(eq(ads.id, ad.id));
          log(`Uploaded creative for "${ad.name}": ${uploaded.externalId}`);
        }

        const input: AdInput = { adSetExternalId: set.externalId, name: ad.name, status: mode, creative, uploaded, objective, extra };
        const created = await createAdIdempotent(provider, ctx(ad.operationId ?? ad.id), input);
        adRaw.review = created.review;
        adRaw.error = null;
        adRaw.platform = { ...(adRaw.platform ?? {}), ...(created.raw ?? {}) };
        await db
          .update(ads)
          .set({ externalId: created.externalId, externalCreativeId: created.creativeExternalId ?? uploaded.externalId, status: mode, raw: adRaw, lastSyncedAt: new Date() })
          .where(eq(ads.id, ad.id));
        log(`Ad "${ad.name}" created: ${created.externalId}${created.review ? ` (${created.review.status})` : ""}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        adRaw.error = message.slice(0, 1000);
        await db.update(ads).set({ status: "error", raw: adRaw }).where(eq(ads.id, ad.id));
        throw err;
      }
    }

    log(`Published ${mode === "active" ? "active" : "as paused"}.`);
    await db
      .update(campaigns)
      .set({ status: mode, raw: { ...raw, extra, error: null }, lastSyncedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    return { campaignId, status: mode, ads: adRows.length };
  } catch (err) {
    return fail(err);
  }
}

async function createAdIdempotent(provider: AdsProvider, ctx: AdsContext, input: AdInput) {
  return provider.createAd(ctx, input);
}

function extOf(mime: string | null | undefined) {
  return ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" } as Record<string, string>)[mime ?? ""] ?? "bin";
}

async function loadBrandLogo(orgId: string, brandId: string | null) {
  if (!brandId) return null;
  const [kit] = await db
    .select({ data: brandKits.data })
    .from(brandKits)
    .where(and(eq(brandKits.orgId, orgId), eq(brandKits.brandId, brandId), eq(brandKits.isActive, true)))
    .limit(1);
  const url = kit?.data.logoUrl;
  const key = url?.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;
  if (!key) return null;
  const obj = await getStorage().get(key);
  if (!obj) return null;
  const creative: Creative = {
    kind: "image",
    variantId: "logo",
    placementId: "",
    width: 0,
    height: 0,
    fileBytes: obj.body.byteLength,
    mimeType: obj.contentType,
    headline: "",
    primaryText: "",
    cta: "",
    landingUrl: "",
  };
  return { creative, bytes: obj.body };
}

registerJob("publish.campaign", runPublishPipeline);
