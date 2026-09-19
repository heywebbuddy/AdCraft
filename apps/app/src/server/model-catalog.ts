import "server-only";
import { cache } from "react";
import { db, dbReady, aiModels } from "@adcraft/db";
import {
  BUILT_IN_MODELS,
  allModels,
  defaultModel,
  getModel,
  isAnthropicConfigured,
  isFalConfigured,
  isOpenAIConfigured,
  isXaiConfigured,
  isReplicateConfigured,
  isRunwayConfigured,
  listModels,
  mergeCatalog,
  registerModels,
  type Capability,
  type ModelSpec,
} from "@adcraft/ai";

/**
 * The live model catalog: built-in specs merged with `ai_models` rows (admin edits and
 * additions), registered into @adcraft/ai so adapters resolve custom models too.
 *
 * Call `await getCatalog()` (or `hydrateModels()`) before reading models on the server —
 * pages, actions and pipelines all go through here. Cached per request via React `cache`;
 * jobs call `hydrateModels()` directly at the start of each run.
 */

export type CatalogModel = ModelSpec & {
  /** The provider behind this model has credentials on this server. */
  connected: boolean;
  /** Credits per unit after admin overrides (already merged into the spec). */
  credits: number;
};

/** Whether the provider behind a spec has credentials here. */
export function providerConnected(spec: ModelSpec): boolean {
  if (spec.apiKeyEnv) return Boolean(process.env[spec.apiKeyEnv]?.trim());
  switch (spec.provider) {
    case "fal":
      return isFalConfigured;
    case "openai":
      return isOpenAIConfigured();
    case "xai":
      return isXaiConfigured();
    case "replicate":
      return isReplicateConfigured();
    case "runway":
      return isRunwayConfigured();
    case "anthropic":
      return isAnthropicConfigured();
    case "elevenlabs":
      return Boolean(process.env.ELEVENLABS_API_KEY);
    case "heygen":
      return Boolean(process.env.HEYGEN_API_KEY);
    default:
      return false;
  }
}

const decorate = (m: ModelSpec): CatalogModel => ({ ...m, connected: providerConnected(m), credits: Math.ceil(m.creditsPerUnit) });

async function loadRows() {
  await dbReady;
  const rows = await db.select().from(aiModels);
  return rows.map((r) => ({ id: r.id, kind: r.kind, spec: r.spec as Partial<ModelSpec>, enabled: r.enabled, isDefault: r.isDefault }));
}

/** Read the catalog from the database and register it. Safe to call repeatedly. */
export async function hydrateModels(): Promise<ModelSpec[]> {
  try {
    const merged = mergeCatalog(await loadRows());
    registerModels(merged);
    return merged;
  } catch (err) {
    // A missing table (fresh database before migrations) must not take generation down.
    console.warn("[models] catalog unavailable, using built-ins", err instanceof Error ? err.message : err);
    registerModels(BUILT_IN_MODELS);
    return BUILT_IN_MODELS;
  }
}

export const getCatalog = cache(async () => {
  await hydrateModels();
  return {
    /** Every model including disabled ones (admin views). */
    all: (kind?: Capability) => allModels().filter((m) => !kind || m.kind === kind).map(decorate),
    /** Enabled models of a kind, for pickers. */
    list: (kind: Capability) => listModels(kind).map(decorate),
    /** Enabled *and* connected models of a kind — what a user can actually run. */
    available: (kind: Capability) => listModels(kind).map(decorate).filter((m) => m.connected),
    get: (id: string) => {
      const m = getModel(id);
      return m ? decorate(m) : undefined;
    },
    /** The default for a kind, preferring one that is connected. */
    default: (kind: Capability) => {
      const d = decorate(defaultModel(kind));
      if (d.connected) return d;
      return listModels(kind).map(decorate).find((m) => m.connected) ?? d;
    },
  };
});

/** Credits per unit for a model id (admin overrides applied), falling back to `fallback`. */
export async function creditsFor(modelId: string, fallback = 2): Promise<number> {
  const c = await getCatalog();
  return c.get(modelId)?.credits ?? fallback;
}
