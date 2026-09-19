import "server-only";
import { inngest } from "@/inngest/client";
import { hydrateModels } from "./model-catalog";

/**
 * Background work runs as Inngest functions in production. Locally, when no
 * INNGEST_EVENT_KEY is configured, the same pipeline function runs inline in the
 * server process (fire-and-forget) so the product works without the Inngest dev server.
 *
 * Every pipeline is a plain async function in `src/pipelines/*` registered here; the
 * Inngest function in `src/inngest/functions.ts` wraps the same function.
 */
export type JobName =
  | "character.generate"
  | "character.looks"
  | "avatar.create"
  | "concepts.generate"
  | "static.generate"
  | "product.cutout"
  | "render.variants"
  | "video.generate"
  | "ugc.generate"
  | "publish.campaign"
  | "insights.sync";

export type JobPayloads = {
  "character.generate": { orgId: string; characterId: string; eventId: string; model: string; prompt: string; lookName: string };
  /** HeyGen looks for a character: a Look Pack / template (`packId` + `gender`) or a prompt. */
  "character.looks": { orgId: string; characterId: string; eventId: string; source: "pack" | "prompt" | "remix"; packId?: string; gender?: "female" | "male"; prompt?: string; /** remix: any HeyGen library look used as a single template (two looks). */ templateLookId?: string; lookName: string; aspectRatio?: "16:9" | "9:16"; credits: number; meta?: Record<string, unknown> };
  /** A character born on HeyGen: digital twin from footage, photo avatar, or prompt character. */
  "avatar.create": { orgId: string; characterId: string; eventId: string; type: "digital_twin" | "photo" | "prompt"; sourceKey?: string; prompt?: string; aspectRatio?: "16:9" | "9:16" | "1:1"; rerouteUrl?: string; meta?: Record<string, unknown> };
  "concepts.generate": { orgId: string; briefId: string; count?: number };
  "static.generate": { orgId: string; creativeId: string; model?: string; mode?: "editable" | "ai"; instructions?: string; onlyMissing?: boolean };
  "product.cutout": { orgId: string; productId: string };
  "render.variants": { orgId: string; creativeId: string };
  "video.generate": { orgId: string; creativeId: string; model?: string };
  "ugc.generate": { orgId: string; creativeId: string };
  "publish.campaign": { orgId: string; campaignId: string };
  "insights.sync": { orgId: string; adAccountId?: string };
};

type Handler<N extends JobName> = (data: JobPayloads[N]) => Promise<unknown>;
const registry = new Map<JobName, Handler<JobName>>();

export function registerJob<N extends JobName>(name: N, handler: Handler<N>) {
  registry.set(name, handler as Handler<JobName>);
}

export const inngestConfigured = Boolean(process.env.INNGEST_EVENT_KEY);

/** Cloud Inngest must fail loudly. Local `INNGEST_DEV=1` talks to :8288 and is optional. */
function canFallbackInline() {
  return process.env.NODE_ENV !== "production" || process.env.INNGEST_DEV === "1";
}

async function runInline<N extends JobName>(name: N, data: JobPayloads[N]) {
  const handler = registry.get(name);
  if (!handler) throw new Error(`No inline handler registered for job ${name}`);
  // Jobs resolve models through the catalog (admin edits, custom models); load it first.
  await hydrateModels();
  void Promise.resolve()
    .then(() => handler(data))
    .catch((err) => console.error(`[jobs] ${name} failed`, err));
  return { mode: "inline" as const };
}

export async function dispatch<N extends JobName>(name: N, data: JobPayloads[N]) {
  if (inngestConfigured) {
    try {
      await inngest.send({ name: name.replace(".", "/") as never, data: data as never });
      return { mode: "inngest" as const };
    } catch (err) {
      if (!canFallbackInline()) throw err;
      console.warn(`[jobs] Inngest unreachable for ${name}; running inline`, err);
    }
  }
  return runInline(name, data);
}
