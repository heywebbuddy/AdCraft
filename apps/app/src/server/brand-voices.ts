import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, dbReady, brandVoices } from "@adcraft/db";
import { deleteHeyGenVoice, findVoice, getHeyGenVoice, type CatalogVoice } from "@adcraft/ai";
import { getStorage } from "@adcraft/storage";

/**
 * A workspace's own voices on HeyGen (instant clones, designed voices).
 *
 * The HeyGen account is shared by every workspace, so `brand_voices` is the source of truth
 * for who owns a private voice. Rows start `processing` (clones) and are refreshed against
 * HeyGen on read; their preview is copied into our storage because HeyGen's preview URLs
 * are signed and expire.
 */

export type BrandVoice = typeof brandVoices.$inferSelect;

export function toCatalogVoice(v: BrandVoice): CatalogVoice {
  return {
    id: v.voiceId,
    provider: "heygen",
    name: v.name,
    style: v.kind === "clone" ? "Your clone" : "Designed for you",
    gender: v.gender === "male" || v.gender === "female" ? v.gender : undefined,
    language: v.language ?? undefined,
    previewUrl: v.sampleKey ? getStorage().url(v.sampleKey) : undefined,
    owned: v.kind,
    status: v.status === "ready" ? undefined : v.status,
  };
}

/** Copy a HeyGen preview into our storage; returns the key. */
export async function storeBrandVoiceSample(orgId: string, voiceId: string, sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Could not fetch the voice preview (${res.status}).`);
  const key = `org/${orgId}/voices/${voiceId}.mp3`;
  await getStorage().put(key, Buffer.from(await res.arrayBuffer()), { contentType: "audio/mpeg" });
  return key;
}

/** Ask HeyGen about voices still training and persist what changed. */
async function refresh(rows: BrandVoice[]): Promise<BrandVoice[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (row.status !== "processing") return row;
      try {
        const v = await getHeyGenVoice(row.voiceId);
        if (v.status === "processing") return row;
        const patch: Partial<BrandVoice> =
          v.status === "failed"
            ? { status: "failed", error: v.failureMessage ?? "HeyGen could not clone this recording. Try a cleaner one." }
            : { status: "ready", error: null, gender: v.gender ?? row.gender, language: v.language ?? row.language, sampleKey: v.previewUrl ? await storeBrandVoiceSample(row.orgId, row.voiceId, v.previewUrl).catch(() => null) : row.sampleKey };
        const [updated] = await db.update(brandVoices).set({ ...patch, updatedAt: new Date() }).where(eq(brandVoices.id, row.id)).returning();
        return updated ?? row;
      } catch {
        return row;
      }
    }),
  );
}

export async function listBrandVoices(orgId: string, brandId: string): Promise<BrandVoice[]> {
  await dbReady;
  const rows = await db.select().from(brandVoices).where(and(eq(brandVoices.orgId, orgId), eq(brandVoices.brandId, brandId))).orderBy(brandVoices.createdAt);
  return refresh(rows);
}

/** A voice id → catalogue entry, checking the workspace's own voices before the shared catalogue. */
export async function resolveVoice(orgId: string, voiceId: string): Promise<CatalogVoice | null> {
  if (!voiceId) return null;
  await dbReady;
  const [own] = await db.select().from(brandVoices).where(and(eq(brandVoices.orgId, orgId), eq(brandVoices.voiceId, voiceId))).limit(1);
  if (own) return toCatalogVoice((await refresh([own]))[0]!);
  return findVoice(voiceId);
}

/** Remove a workspace voice here and on HeyGen (frees a clone slot). */
export async function deleteBrandVoice(orgId: string, brandId: string, id: string): Promise<void> {
  await dbReady;
  const [row] = await db.select().from(brandVoices).where(and(eq(brandVoices.id, id), eq(brandVoices.orgId, orgId), eq(brandVoices.brandId, brandId))).limit(1);
  if (!row) return;
  await deleteHeyGenVoice(row.voiceId);
  if (row.sampleKey) await getStorage().delete(row.sampleKey).catch(() => undefined);
  await db.delete(brandVoices).where(eq(brandVoices.id, row.id));
}

/** Delete HeyGen voices nobody kept (designed batches the user closed without choosing). */
export async function discardHeyGenVoices(voiceIds: string[]): Promise<void> {
  if (!voiceIds.length) return;
  await dbReady;
  // Never delete a voice some workspace has saved.
  const kept = new Set((await db.select({ voiceId: brandVoices.voiceId }).from(brandVoices).where(inArray(brandVoices.voiceId, voiceIds))).map((r) => r.voiceId));
  await Promise.all(voiceIds.filter((id) => !kept.has(id)).map((id) => deleteHeyGenVoice(id).catch(() => undefined)));
}
