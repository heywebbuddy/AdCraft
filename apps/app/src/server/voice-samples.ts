import "server-only";
import { eq } from "drizzle-orm";
import { db, dbReady, platformSettings } from "@adcraft/db";
import { getStorage } from "@adcraft/storage";

/**
 * Voice samples we generated for HeyGen voices that ship without one. Bytes live in our
 * storage under a platform (not org) prefix; the id → key map lives in platform_settings
 * so every workspace shares the same one-time sample.
 */
const KEY = "voiceSamples";

async function readMap(): Promise<Record<string, string>> {
  await dbReady;
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, KEY)).limit(1);
  return (row?.value as Record<string, string> | undefined) ?? {};
}

export async function getVoiceSample(voiceId: string): Promise<string | null> {
  const map = await readMap();
  return map[voiceId] ? getStorage().url(map[voiceId]!) : null;
}

/** Copy HeyGen's temporary audio URL into our storage and remember it. */
export async function storeVoiceSample(voiceId: string, sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Could not fetch the sample (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const key = `platform/voice-samples/${voiceId}.mp3`;
  await getStorage().put(key, bytes, { contentType: "audio/mpeg" });
  const map = await readMap();
  map[voiceId] = key;
  await db
    .insert(platformSettings)
    .values({ key: KEY, value: map, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: map, updatedAt: new Date() } });
  return getStorage().url(key);
}
