import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, dbReady, platformSettings } from "@adcraft/db";
import { groupIdsByType, isHeyGenLibraryConfigured, listAvatarGroups, listGroupLooks, seedAvatarGroups, type AvatarGroup, type AvatarLook } from "@adcraft/ai";

/**
 * The HeyGen presenter library as the app sees it.
 *
 * Building the index means ~70 paged API calls (≈1,400 groups, plus the studio and
 * digital-twin look sets that tell us each person's kind) — a couple of minutes. So the
 * index is built once in the background, persisted as a snapshot in `platform_settings`
 * ("heygenLibrary"), served instantly after that, and refreshed in the background when a
 * day old. A request that arrives before the first build completes gets `loading: true`.
 */

const SNAPSHOT_KEY = "heygenLibrary";
const DAY = 24 * 60 * 60_000;

export type PresenterGroup = { id: string; name: string; gender: "male" | "female" | null; previewUrl: string | null; looksCount: number; kind: "studio" | "twin" | "photo" };
export type PresenterLook = {
  id: string;
  groupId: string;
  name: string;
  type: AvatarLook["type"];
  orientation: AvatarLook["orientation"] | null;
  previewUrl: string | null;
  previewVideoUrl: string | null;
  gender: "male" | "female" | null;
  engines: AvatarLook["engines"];
  defaultVoiceId: string | null;
};

type Snapshot = { at: number; groups: AvatarGroup[]; studio: string[]; twin: string[] };

let memory: Snapshot | null = null;
let building: Promise<Snapshot | null> | null = null;

async function readSnapshot(): Promise<Snapshot | null> {
  await dbReady;
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, SNAPSHOT_KEY)).limit(1);
  const v = row?.value as Partial<Snapshot> | undefined;
  return v?.at && Array.isArray(v.groups) && v.groups.length ? { at: v.at, groups: v.groups, studio: v.studio ?? [], twin: v.twin ?? [] } : null;
}

async function writeSnapshot(snap: Snapshot) {
  await dbReady;
  await db
    .insert(platformSettings)
    .values({ key: SNAPSHOT_KEY, value: snap, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: snap, updatedAt: new Date() } });
}

/** Full index build: groups + per-type group sets. Runs at most once at a time. */
export function buildPresenterLibrary(): Promise<Snapshot | null> {
  if (building) return building;
  building = (async () => {
    try {
      const groups = await listAvatarGroups();
      if (!groups.length) return null;
      const [studio, twin] = await Promise.all([groupIdsByType("studio_avatar"), groupIdsByType("digital_twin")]);
      const snap: Snapshot = { at: Date.now(), groups, studio: [...studio], twin: [...twin] };
      memory = snap;
      await writeSnapshot(snap);
      console.log(`[presenters] library indexed: ${groups.length} people, ${studio.size} filmed, ${twin.size} twins`);
      return snap;
    } catch (err) {
      console.warn("[presenters] library build failed", err instanceof Error ? err.message : err);
      return null;
    } finally {
      building = null;
    }
  })();
  return building;
}

function toGroups(snap: Snapshot): PresenterGroup[] {
  const studio = new Set(snap.studio);
  const twin = new Set(snap.twin);
  return [...snap.groups].sort((a, b) => (a.name.trim() ? 0 : 1) - (b.name.trim() ? 0 : 1) || a.name.localeCompare(b.name)).map((g) => ({
    id: g.id,
    name: g.name,
    gender: g.gender ?? null,
    previewUrl: g.previewUrl ?? null,
    looksCount: g.looksCount,
    kind: studio.has(g.id) ? "studio" : twin.has(g.id) ? "twin" : "photo",
  }));
}

/**
 * Groups for the picker. `loading` is true only before the very first index exists;
 * callers can poll (router.refresh) until it flips.
 */
export const getPresenterGroups = cache(async (): Promise<{ groups: PresenterGroup[]; loading: boolean; indexedAt: number | null }> => {
  if (!isHeyGenLibraryConfigured()) return { groups: [], loading: false, indexedAt: null };
  if (!memory) {
    const stored = await readSnapshot();
    if (stored) {
      memory = stored;
      seedAvatarGroups(stored.groups, stored.at);
    }
  }
  if (!memory) {
    void buildPresenterLibrary();
    return { groups: [], loading: true, indexedAt: null };
  }
  if (Date.now() - memory.at > DAY) void buildPresenterLibrary();
  return { groups: toGroups(memory), loading: false, indexedAt: memory.at };
});

export async function getPresenterLooks(groupId: string): Promise<PresenterLook[]> {
  const looks = await listGroupLooks(groupId);
  return looks.map((l) => ({
    id: l.id,
    groupId: l.groupId,
    name: l.name,
    type: l.type,
    orientation: l.orientation ?? null,
    previewUrl: l.previewUrl ?? null,
    previewVideoUrl: l.previewVideoUrl ?? null,
    gender: l.gender ?? null,
    engines: l.engines,
    defaultVoiceId: l.defaultVoiceId ?? null,
  }));
}
