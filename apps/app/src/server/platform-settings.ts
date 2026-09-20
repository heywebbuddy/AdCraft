import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, dbReady, platformSettings, organizations, type OrgSettings } from "@adcraft/db";
import type { PlanId } from "./billing";

/**
 * Platform-wide settings edited from /admin/settings and stored in `platform_settings`
 * (one row per key, JSON value). Everything has a default so a fresh database behaves
 * exactly like today.
 */

export type PlanFeatures = { video: boolean; ugc: boolean; publishing: boolean };

export type Guardrails = {
  /** Default daily-budget threshold (major units) above which non-owners publish paused. null = off. */
  spendApprovalAbove: number | null;
  /** HeyGen custom-voice slots (clones + designed) one workspace may hold; the account has 10 in total. */
  heygenVoicesPerWorkspace: number;
  /** Provider spend (USD) one workspace may generate in a calendar month before generation is refused. null = off. */
  monthlyCostCapUsd: number | null;
  /** Server-action calls per minute per workspace before we ask users to slow down. */
  actionsPerMinute: number;
};

export type PlatformSettings = {
  /** Shown to every signed-in user at the top of the app when non-empty. */
  maintenanceBanner: string;
  guardrails: Guardrails;
  /** When false, /welcome refuses to create new workspaces. */
  signupsEnabled: boolean;
  /** Credits granted to a brand-new workspace (onboarding). */
  trialCredits: number;
  planFeatures: Record<PlanId, PlanFeatures>;
};

export type ModelOverride = { creditsPerUnit?: number; enabled?: boolean };
export type ModelOverrides = Record<string, ModelOverride>;

export const DEFAULT_GUARDRAILS: Guardrails = { spendApprovalAbove: 100, heygenVoicesPerWorkspace: 2, monthlyCostCapUsd: 200, actionsPerMinute: 120 };

export const DEFAULT_SETTINGS: PlatformSettings = {
  maintenanceBanner: "",
  guardrails: DEFAULT_GUARDRAILS,
  signupsEnabled: true,
  trialCredits: 10,
  planFeatures: {
    starter: { video: true, ugc: true, publishing: true },
    studio: { video: true, ugc: true, publishing: true },
    agency: { video: true, ugc: true, publishing: true },
  },
};

async function readAll(): Promise<Map<string, unknown>> {
  await dbReady;
  const rows = await db.select().from(platformSettings);
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** Every platform setting with defaults applied. Cached per request. */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const all = await readAll();
  const banner = all.get("maintenanceBanner");
  const signups = all.get("signupsEnabled");
  const trial = all.get("trialCredits");
  const features = (all.get("planFeatures") ?? {}) as Partial<Record<PlanId, Partial<PlanFeatures>>>;
  const merged = { ...DEFAULT_SETTINGS.planFeatures } as Record<PlanId, PlanFeatures>;
  for (const plan of Object.keys(merged) as PlanId[]) {
    merged[plan] = { ...DEFAULT_SETTINGS.planFeatures[plan], ...(features[plan] ?? {}) };
  }
  const g = (all.get("guardrails") ?? {}) as Partial<Guardrails>;
  const num = (v: unknown, d: number | null) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : v === null ? null : d);
  return {
    maintenanceBanner: typeof banner === "string" ? banner : DEFAULT_SETTINGS.maintenanceBanner,
    guardrails: {
      spendApprovalAbove: num(g.spendApprovalAbove, DEFAULT_GUARDRAILS.spendApprovalAbove),
      heygenVoicesPerWorkspace: num(g.heygenVoicesPerWorkspace, DEFAULT_GUARDRAILS.heygenVoicesPerWorkspace) ?? DEFAULT_GUARDRAILS.heygenVoicesPerWorkspace,
      monthlyCostCapUsd: num(g.monthlyCostCapUsd, DEFAULT_GUARDRAILS.monthlyCostCapUsd),
      actionsPerMinute: num(g.actionsPerMinute, DEFAULT_GUARDRAILS.actionsPerMinute) ?? DEFAULT_GUARDRAILS.actionsPerMinute,
    },
    signupsEnabled: typeof signups === "boolean" ? signups : DEFAULT_SETTINGS.signupsEnabled,
    trialCredits: typeof trial === "number" && Number.isFinite(trial) && trial >= 0 ? Math.round(trial) : DEFAULT_SETTINGS.trialCredits,
    planFeatures: merged,
  };
});

/**
 * Compatibility view of the catalog as `{ [modelId]: { creditsPerUnit, enabled } }`.
 * New code should use `getCatalog()` from ./model-catalog directly.
 */
export const getModelOverrides = cache(async (): Promise<ModelOverrides> => {
  const { getCatalog } = await import("./model-catalog");
  const c = await getCatalog();
  return Object.fromEntries(c.all().map((m) => [m.id, { creditsPerUnit: m.credits, enabled: m.enabled !== false }]));
});

/** Metadata (who/when) for the admin settings page. */
export async function settingsMeta(): Promise<Record<string, { updatedBy: string | null; updatedAt: Date }>> {
  await dbReady;
  const rows = await db.select().from(platformSettings);
  return Object.fromEntries(rows.map((r) => [r.key, { updatedBy: r.updatedBy, updatedAt: r.updatedAt }]));
}

/** Upsert one setting. */
export async function setPlatformSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  await dbReady;
  await db
    .insert(platformSettings)
    .values({ key, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
}

export async function getPlatformSetting<T = unknown>(key: string): Promise<T | undefined> {
  await dbReady;
  const row = await db.query.platformSettings.findFirst({ where: eq(platformSettings.key, key) });
  return row?.value as T | undefined;
}

/** A workspace's own guardrail overrides (owners edit these in Settings). */
export const getOrgSettings = cache(async (orgId: string): Promise<OrgSettings> => {
  await dbReady;
  const [row] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return row?.settings ?? {};
});

export async function setOrgSettings(orgId: string, patch: Partial<OrgSettings>): Promise<void> {
  await dbReady;
  const current = await getOrgSettings(orgId);
  await db.update(organizations).set({ settings: { ...current, ...patch }, updatedAt: new Date() }).where(eq(organizations.id, orgId));
}

/** Daily budget (major units) above which non-owners may only publish paused; null = no rule. */
export async function spendApprovalThreshold(orgId: string): Promise<number | null> {
  const [platform, org] = await Promise.all([getPlatformSettings(), getOrgSettings(orgId)]);
  return org.spendApprovalAbove === undefined ? platform.guardrails.spendApprovalAbove : org.spendApprovalAbove;
}

/** Whether a plan may use a feature, per admin flags. Trial follows Starter. */
export async function planAllows(plan: string | null | undefined, feature: keyof PlanFeatures): Promise<boolean> {
  const settings = await getPlatformSettings();
  const key = (plan && plan in settings.planFeatures ? plan : "starter") as PlanId;
  return settings.planFeatures[key]?.[feature] ?? true;
}
