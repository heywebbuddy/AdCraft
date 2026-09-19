import "server-only";
import { onHeyGenVoices, primeHeyGenVoices, type CatalogVoice } from "@adcraft/ai";
import { db, dbReady, platformSettings } from "@adcraft/db";
import { getPlatformSetting } from "./platform-settings";

const KEY = "voice_catalog.heygen";
let hydrated: Promise<void> | null = null;

/**
 * HeyGen's library is ~3,000 voices and takes 10–40 s to fetch, which is why the picker used to
 * fail right after a deploy. Keep the last good copy in platform_settings: a new process primes
 * the in-memory cache from it immediately and refreshes in the background.
 */
export function hydrateVoiceCatalog(): Promise<void> {
  hydrated ??= (async () => {
    onHeyGenVoices(async (snapshot) => {
      // Written by the system, not a user: updated_by stays null (it is a foreign key to users).
      await dbReady;
      await db
        .insert(platformSettings)
        .values({ key: KEY, value: snapshot, updatedBy: null, updatedAt: new Date() })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: snapshot, updatedBy: null, updatedAt: new Date() } });
    });
    try {
      const saved = await getPlatformSetting<{ at: number; list: CatalogVoice[] }>(KEY);
      primeHeyGenVoices(saved);
    } catch (err) {
      console.warn("[voices] no saved catalogue", err instanceof Error ? err.message : err);
    }
  })();
  return hydrated;
}
