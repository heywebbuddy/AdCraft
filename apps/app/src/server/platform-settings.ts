import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, dbReady, platformSettings } from "@adcraft/db";
import type { PlanId } from "./billing";

/**
 * Platform-wide settings edited from /admin/settings and stored in `platform_settings`
 * (one row per key, JSON value). Everything has a default so a fresh database behaves
 * exactly like today.
 */

export type PlanFeatures = { video: boolean; ugc: boolean; publishing: boolean };

export type PlatformSettings = {
  /** Shown to every signed-in user at the top of the app when non-empty. */
  maintenanceBanner: string;
  /** When false, /welcome refuses to create new workspaces. */
  signupsEnabled: boolean;
  /** Credits granted to a brand-new workspace (onboarding). */
  trialCredits: number;
  planFeatures: Record<PlanId, PlanFeatures>;
};

export type ModelOverride = { creditsPerUnit?: number; enabled?: boolean };
export type ModelOverrides = Record<string, ModelOverride>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  maintenanceBanner: "",
  signupsEnabled: true,
  trialCredits: 50,
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
  return {
    maintenanceBanner: typeof banner === "string" ? banner : DEFAULT_SETTINGS.maintenanceBanner,
    signupsEnabled: typeof signups === "boolean" ? signups : DEFAULT_SETTINGS.signupsEnabled,
    trialCredits: typeof trial === "number" && Number.isFinite(trial) && trial >= 0 ? Math.round(trial) : DEFAULT_SETTINGS.trialCredits,
    planFeatures: merged,
  };
});

/**
 * Per-model overrides saved from /admin/models under the key "models":
 * `{ [modelId]: { creditsPerUnit?: number; enabled?: boolean } }`.
 * Other code can call this to price generations or hide disabled models in pickers.
 */
export const getModelOverrides = cache(async (): Promise<ModelOverrides> => {
  const all = await readAll();
  const raw = all.get("models");
  if (!raw || typeof raw !== "object") return {};
  const out: ModelOverrides = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const entry: ModelOverride = {};
    if (typeof o.creditsPerUnit === "number" && Number.isFinite(o.creditsPerUnit) && o.creditsPerUnit >= 0) entry.creditsPerUnit = o.creditsPerUnit;
    if (typeof o.enabled === "boolean") entry.enabled = o.enabled;
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
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
