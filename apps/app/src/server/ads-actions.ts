"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { spendApprovalThreshold } from "./platform-settings";
import { revalidatePath } from "next/cache";
import { db, dbReady, adAccounts, adSets, ads, campaigns } from "@adcraft/db";
import { hasErrors, isObjective, type Gender, type LiveStatus, type Targeting } from "@adcraft/ads";
import { requireOrg } from "@/server/org";
import { dispatch } from "@/server/jobs";
import { accountContext, isPending, listPublishableCreatives, placementsForPlatform, pendingExternalId, safePlacement, type AdRaw, type CampaignRaw } from "@/server/ads";
import "@/pipelines";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}
function multi(fd: FormData, key: string) {
  return fd
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}
function num(fd: FormData, key: string) {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? n : NaN;
}

function requireEditor(role: string) {
  if (role === "viewer") throw new Error("Viewers cannot publish campaigns");
}

/** `/campaigns/new` submit: writes the draft graph and dispatches publish.campaign. */
export async function createCampaignAction(formData: FormData) {
  const ctx = await requireOrg();
  requireEditor(ctx.role);
  await dbReady;

  const adAccountId = str(formData, "adAccountId");
  const objective = str(formData, "objective");
  const name = str(formData, "name");
  const mode: LiveStatus = str(formData, "mode") === "active" ? "active" : "paused";
  const countries = multi(formData, "countries").map((c) => c.toUpperCase());
  const ageMin = num(formData, "ageMin");
  const ageMax = num(formData, "ageMax");
  const genders = multi(formData, "genders").filter((g): g is Gender => g === "male" || g === "female");
  const interests = str(formData, "interests")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const placementIds = multi(formData, "placements");
  const dailyBudget = num(formData, "dailyBudget");
  const currency = (str(formData, "currency") || "USD").toUpperCase();
  const startAt = str(formData, "startAt");
  const endAt = str(formData, "endAt");
  const variantIds = multi(formData, "variants");
  const pageId = str(formData, "pageId");
  const pixelId = str(formData, "pixelId");
  const landingUrl = str(formData, "landingUrl");

  const back: (error: string) => never = (error) => redirect(`/campaigns/new?error=${encodeURIComponent(error)}&account=${encodeURIComponent(adAccountId)}`);
  // Guardrail: above the workspace's daily-spend threshold, only an owner may publish active.
  const threshold = await spendApprovalThreshold(ctx.org.id);
  if (mode === "active" && threshold !== null && ctx.role !== "owner" && dailyBudget > threshold) back(`Daily budgets above ${threshold} need an owner to switch the campaign on. Publish it as paused and ask an owner to resume it.`);

  const [account] = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.id, adAccountId), eq(adAccounts.orgId, ctx.org.id)))
    .limit(1);
  if (!account) back("Pick a connected ad account.");
  if (account.status !== "connected") back(`${account.name ?? "That account"} is ${account.status}; reconnect it first.`);
  if (!isObjective(objective)) back("Pick an objective.");
  if (!name) back("Give the campaign a name.");
  if (!(dailyBudget > 0)) back("Set a daily budget.");
  if (!(ageMin >= 13 && ageMax <= 100 && ageMin <= ageMax)) back("Age range must be between 13 and 100.");
  const allowed = new Set(placementsForPlatform(account.platform).map((p) => p.id));
  const placements = placementIds.filter((p) => allowed.has(p));
  if (placements.length === 0) back("Pick at least one placement.");
  if (variantIds.length === 0) back("Pick at least one finished creative.");
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) back("The end date must be after the start date.");
  if (landingUrl && !/^https?:\/\/\S+$/i.test(landingUrl)) back("The landing page must be a full URL (https://…).");

  // Re-validate the chosen variants server-side: finished render, matching placement, no hard failures.
  const publishable = await listPublishableCreatives(ctx.org.id, ctx.brand?.id ?? null, { landingUrl: landingUrl || undefined });
  const chosen: Array<{ creative: (typeof publishable)[number]; variant: (typeof publishable)[number]["variants"][number] }> = [];
  for (const id of variantIds) {
    let hit: (typeof chosen)[number] | null = null;
    for (const c of publishable) {
      const v = c.variants.find((x) => x.variantId === id);
      if (v) hit = { creative: c, variant: v };
    }
    if (!hit) back("One of the chosen creatives is no longer available.");
    if (!placements.includes(hit.variant.placementId)) back(`${hit.creative.name} (${hit.variant.placementLabel}) does not match the chosen placements.`);
    if (hasErrors(hit.variant.issues)) back(`${hit.creative.name} (${hit.variant.placementLabel}) has validation errors; fix them before publishing.`);
    chosen.push(hit);
  }

  const targeting: Targeting = { countries: countries.length ? countries : ["US"], ageMin, ageMax, genders, interests };
  const schedule = { startAt: startAt ? new Date(startAt).toISOString() : undefined, endAt: endAt ? new Date(endAt).toISOString() : undefined };
  const extra: Record<string, unknown> = { brandName: ctx.brand?.name ?? ctx.org.name };
  if (pageId) extra.pageId = pageId;
  if (pixelId) extra.pixelId = pixelId;
  const raw: CampaignRaw = {
    objective,
    targeting,
    placements,
    schedule,
    currency,
    brandId: ctx.brand?.id ?? null,
    extra,
    publishMode: mode,
    error: null,
    log: [{ at: new Date().toISOString(), message: `Draft created by ${ctx.viewer.name}` }],
  };

  const campaignId = randomUUID();
  const dailyBudgetMinor = Math.round(dailyBudget * 100);
  await db.insert(campaigns).values({
    id: campaignId,
    orgId: ctx.org.id,
    adAccountId: account.id,
    name,
    objective,
    status: "draft",
    dailyBudgetMinor,
    operationId: randomUUID(),
    externalId: pendingExternalId(campaignId),
    platform: account.platform,
    raw,
  });

  const setId = randomUUID();
  const placementLabels = placements.map((p) => safePlacement(p)?.label ?? p);
  await db.insert(adSets).values({
    id: setId,
    orgId: ctx.org.id,
    campaignId,
    name: `${name} · ${placementLabels.length > 2 ? `${placements.length} placements` : placementLabels.join(" + ")}`,
    status: "draft",
    targeting: targeting as unknown as Record<string, unknown>,
    placements,
    dailyBudgetMinor,
    operationId: randomUUID(),
    externalId: pendingExternalId(setId),
    platform: account.platform,
    raw: {},
  });

  await db.insert(ads).values(
    chosen.map(({ creative, variant }) => {
      const adId = randomUUID();
      const adRaw: AdRaw = {
        renderId: variant.renderId,
        placementId: variant.placementId,
        copy: creative.copy,
        creativeName: creative.name,
      };
      return {
        id: adId,
        orgId: ctx.org.id,
        adSetId: setId,
        variantId: variant.variantId,
        name: `${creative.name} · ${variant.placementLabel}`,
        status: "draft" as const,
        operationId: randomUUID(),
        externalId: pendingExternalId(adId),
        platform: account.platform,
        raw: adRaw,
      };
    }),
  );

  await dispatch("publish.campaign", { orgId: ctx.org.id, campaignId });
  redirect(`/campaigns/${campaignId}`);
}

async function loadOwnedCampaign(orgId: string, campaignId: string) {
  await dbReady;
  const [row] = await db
    .select({ c: campaigns, a: adAccounts })
    .from(campaigns)
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error("Campaign not found");
  return row;
}

/** Pause / resume / archive the campaign (and mirror the state on our rows). */
export async function setCampaignStatusAction(campaignId: string, status: LiveStatus) {
  const ctx = await requireOrg();
  requireEditor(ctx.role);
  const { c, a } = await loadOwnedCampaign(ctx.org.id, campaignId);
  const raw = (c.raw ?? {}) as CampaignRaw;
  if (status === "active" && ctx.role !== "owner") {
    const threshold = await spendApprovalThreshold(ctx.org.id);
    if (threshold !== null && (c.dailyBudgetMinor ?? 0) > threshold * 100) throw new Error(`Daily budgets above ${threshold} need an owner to switch the campaign on.`);
  }
  if (isPending(c.externalId)) {
    if (status === "archived") {
      await db.update(campaigns).set({ status: "archived", raw: { ...raw, error: null } }).where(eq(campaigns.id, c.id));
      revalidatePath(`/campaigns/${campaignId}`);
      revalidatePath("/campaigns");
      return;
    }
    throw new Error("This campaign has not been published yet.");
  }
  const { provider, ctx: pctx } = await accountContext(a);
  await provider.setStatus(pctx(`${c.operationId ?? c.id}:status:${status}`), { level: "campaign", externalId: c.externalId }, status);
  const now = new Date();
  await db
    .update(campaigns)
    .set({ status, lastSyncedAt: now, raw: { ...raw, error: null, log: [...(raw.log ?? []).slice(-30), { at: now.toISOString(), message: `${status} by ${ctx.viewer.name}` }] } })
    .where(eq(campaigns.id, c.id));
  const sets = await db.select({ id: adSets.id }).from(adSets).where(eq(adSets.campaignId, c.id));
  if (sets.length) {
    const setIds = sets.map((s) => s.id);
    await db.update(adSets).set({ status }).where(inArray(adSets.id, setIds));
    await db
      .update(ads)
      .set({ status })
      .where(and(inArray(ads.adSetId, setIds), inArray(ads.status, ["active", "paused"])));
  }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

/** Pause / resume one ad. */
export async function setAdStatusAction(adId: string, status: LiveStatus) {
  const ctx = await requireOrg();
  requireEditor(ctx.role);
  await dbReady;
  const [row] = await db
    .select({ ad: ads, c: campaigns, a: adAccounts })
    .from(ads)
    .innerJoin(adSets, eq(adSets.id, ads.adSetId))
    .innerJoin(campaigns, eq(campaigns.id, adSets.campaignId))
    .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(ads.id, adId), eq(ads.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("Ad not found");
  if (isPending(row.ad.externalId)) throw new Error("This ad has not been published yet.");
  const { provider, ctx: pctx } = await accountContext(row.a);
  await provider.setStatus(pctx(`${row.ad.operationId ?? row.ad.id}:status:${status}`), { level: "ad", externalId: row.ad.externalId }, status);
  await db.update(ads).set({ status, lastSyncedAt: new Date() }).where(eq(ads.id, adId));
  revalidatePath(`/campaigns/${row.c.id}`);
}

/** Pause every ad of one creative from the performance table (each ad through its own platform). */
export async function pauseAdsAction(adIds: string[]) {
  for (const id of adIds.slice(0, 20)) {
    try {
      await setAdStatusAction(id, "paused");
    } catch (err) {
      console.warn("[ads] pause failed", id, err instanceof Error ? err.message : err);
    }
  }
  revalidatePath("/performance");
}

/** "Sync now": pull review outcomes and metrics for the campaign's account. */
export async function syncCampaignAction(campaignId: string) {
  const ctx = await requireOrg();
  const { a } = await loadOwnedCampaign(ctx.org.id, campaignId);
  await dispatch("insights.sync", { orgId: ctx.org.id, adAccountId: a.id });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/performance");
  redirect(`/campaigns/${campaignId}?syncing=1`);
}

/** Re-run publish after an error; idempotent, so already-created objects are kept. */
export async function retryPublishAction(campaignId: string) {
  const ctx = await requireOrg();
  requireEditor(ctx.role);
  const { c } = await loadOwnedCampaign(ctx.org.id, campaignId);
  const raw = (c.raw ?? {}) as CampaignRaw;
  await db.update(campaigns).set({ status: "draft", raw: { ...raw, error: null } }).where(eq(campaigns.id, c.id));
  await dispatch("publish.campaign", { orgId: ctx.org.id, campaignId });
  revalidatePath(`/campaigns/${campaignId}`);
}

/** Sync every connected account in the org (the /performance "Sync now"). */
export async function syncAllAction() {
  const ctx = await requireOrg();
  await dispatch("insights.sync", { orgId: ctx.org.id });
  revalidatePath("/performance");
  redirect("/performance?syncing=1");
}

/** Forget the tokens; campaigns stay for history. */
export async function disconnectAccountAction(adAccountId: string) {
  const ctx = await requireOrg();
  requireEditor(ctx.role);
  await dbReady;
  await db
    .update(adAccounts)
    .set({ status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null })
    .where(and(eq(adAccounts.id, adAccountId), eq(adAccounts.orgId, ctx.org.id)));
  revalidatePath("/campaigns");
}
