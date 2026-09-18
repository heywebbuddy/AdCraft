import "server-only";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db, dbReady, generationEvents, creatives, briefs, characters } from "@adcraft/db";

/**
 * The Activity tray: what is running in the workspace right now, and what finished in the
 * last day. Built from generation events (root ones only — a video run logs a sub-event per
 * scene, which is noise here) plus characters in flight.
 */
export type ActivityItem = {
  id: string;
  kind: "concepts" | "static" | "video" | "ugc" | "character" | "looks" | "avatar" | "publish" | "other";
  title: string;
  detail: string | null;
  status: "running" | "succeeded" | "failed";
  href: string;
  startedAt: Date;
  finishedAt: Date | null;
};

const ROOT_MODELS_PREFIX = /^heygen-(photo|prompt|digital_twin|looks)$/;

function classify(e: typeof generationEvents.$inferSelect): ActivityItem["kind"] {
  const meta = (e.meta ?? {}) as Record<string, unknown>;
  if (e.capability === "text") return "concepts";
  if (e.model === "heygen-looks") return "looks";
  if (ROOT_MODELS_PREFIX.test(e.model)) return "avatar";
  if (meta.characterId) return "character";
  if (meta.kind === "ugc") return "ugc";
  if (e.capability === "video" || meta.kind === "video") return "video";
  if (e.capability === "image") return "static";
  return "other";
}

export async function loadActivity(orgId: string, brandId: string | null): Promise<{ running: ActivityItem[]; recent: ActivityItem[] }> {
  await dbReady;
  const since = new Date(Date.now() - 24 * 3600_000);
  // Root events: those with a creative, brief or character behind them, not per-scene sub-events.
  const rows = await db
    .select()
    .from(generationEvents)
    .where(
      and(
        eq(generationEvents.orgId, orgId),
        gte(generationEvents.createdAt, since),
        // Root-level work: anything with a label (jobs the user started), video roots, character jobs, concepts.
        or(eq(generationEvents.status, "started"), sql`${generationEvents.meta} ->> 'root' = 'true'`, sql`${generationEvents.meta} ? 'characterId'`, sql`${generationEvents.meta} ? 'label'`, eq(generationEvents.capability, "text")),
        // Not the per-scene / per-step children of a video run.
        sql`coalesce(${generationEvents.meta} ->> 'step', '') not in ('broll', 'presenter', 'voice', 'scene', 'music')`,
      ),
    )
    .orderBy(desc(generationEvents.createdAt))
    .limit(60);

  const creativeIds = [...new Set(rows.map((r) => r.creativeId).filter((x): x is string => Boolean(x)))];
  const briefIds = [...new Set(rows.map((r) => r.briefId).filter((x): x is string => Boolean(x)))];
  const characterIds = [...new Set(rows.map((r) => ((r.meta ?? {}) as Record<string, unknown>).characterId).filter((x): x is string => typeof x === "string"))];
  const [creativeRows, briefRows, characterRows] = await Promise.all([
    creativeIds.length ? db.select({ id: creatives.id, name: creatives.name, kind: creatives.kind }).from(creatives).where(inArray(creatives.id, creativeIds)) : [],
    briefIds.length ? db.select({ id: briefs.id, title: briefs.title }).from(briefs).where(inArray(briefs.id, briefIds)) : [],
    characterIds.length ? db.select({ id: characters.id, name: characters.name, brandId: characters.brandId }).from(characters).where(inArray(characters.id, characterIds)) : [],
  ]);
  const creativeById = new Map(creativeRows.map((c) => [c.id, c]));
  const briefById = new Map(briefRows.map((b) => [b.id, b]));
  const characterById = new Map(characterRows.map((c) => [c.id, c]));

  const seen = new Set<string>();
  const items: ActivityItem[] = [];
  for (const e of rows) {
    const meta = (e.meta ?? {}) as Record<string, unknown>;
    let kind = classify(e);
    let title = "Generation";
    let href = "/creatives";
    if (e.creativeId && creativeById.has(e.creativeId)) {
      const c = creativeById.get(e.creativeId)!;
      title = c.name;
      href = c.kind === "static" ? `/creatives/${c.id}` : `/videos/${c.id}`;
      if (kind === "other" || kind === "static") kind = c.kind === "static" ? "static" : c.kind === "ugc" ? "ugc" : "video";
      if (seen.has(e.creativeId)) continue;
      seen.add(e.creativeId);
    } else if (e.briefId && briefById.has(e.briefId)) {
      title = briefById.get(e.briefId)!.title;
      href = `/briefs/${e.briefId}`;
      kind = "concepts";
    } else if (typeof meta.characterId === "string" && characterById.has(meta.characterId)) {
      const c = characterById.get(meta.characterId)!;
      if (brandId && c.brandId !== brandId) continue;
      title = typeof meta.label === "string" ? meta.label : c.name;
      href = "/characters?view=characters";
    } else if (typeof meta.label === "string") {
      title = meta.label;
      if (typeof meta.productId === "string") { href = `/library/${meta.productId}`; kind = "other"; }
    } else continue;
    const detail = typeof meta.step === "string" ? meta.step : typeof meta.detail === "string" ? meta.detail : e.status === "failed" ? (e.error ?? "Failed").slice(0, 120) : null;
    items.push({
      id: e.id,
      kind,
      title,
      detail,
      status: e.status === "started" ? "running" : e.status === "succeeded" ? "succeeded" : "failed",
      href,
      startedAt: e.createdAt,
      finishedAt: e.status === "started" ? null : new Date(e.createdAt.getTime() + (e.durationMs ?? 0)),
    });
  }
  return { running: items.filter((i) => i.status === "running"), recent: items.filter((i) => i.status !== "running").slice(0, 12) };
}

/** Counts only, for the topbar badge (cheap; polled). */
export async function runningCount(orgId: string): Promise<number> {
  await dbReady;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), eq(generationEvents.status, "started"), isNull(generationEvents.renderId), gte(generationEvents.createdAt, new Date(Date.now() - 6 * 3600_000))));
  return row?.n ?? 0;
}
