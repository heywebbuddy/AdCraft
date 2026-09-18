import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, dbReady, characters, products } from "@adcraft/db";
import { isFalConfigured, isHeyGenConfigured, listAllVoices, findVoice } from "@adcraft/ai";
import { getPresenterGroups } from "./presenter-library";
import { getCatalog } from "./model-catalog";

export async function studioModels() {
  const c = await getCatalog();
  return c.list("image").map(m => ({ ...m, creditsPerUnit: m.credits, enabled: m.enabled !== false, connected: m.connected }));
}

export async function characterStudioData(orgId: string, brandId: string) {
  await dbReady;
  const [people, items, models, voices, catalog, library] = await Promise.all([
    db.select().from(characters).where(and(eq(characters.orgId, orgId), eq(characters.brandId, brandId))).orderBy(desc(characters.createdAt)),
    db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.brandId, brandId))).orderBy(desc(products.createdAt)),
    studioModels(), listAllVoices(), getCatalog(), getPresenterGroups(),
  ]);
  return {
    characters: await Promise.all(people.map(async c => ({ id: c.id, name: c.name, description: c.description, personality: c.personality, voiceId: c.voiceId, voice: await findVoice(c.voiceId), imageModel: c.imageModel, motion: c.motion ?? {}, portraitUrl: c.portraitKey ? `/api/files/${c.portraitKey}` : null, status: c.status, error: c.error, looks: c.looks.map(l => ({ id: l.id, name: l.name, url: `/api/files/${l.imageKey}` })) }))),
    products: items.map(p => ({ id: p.id, name: p.name, description: p.description ?? "", imageUrl: p.imageKey ? `/api/files/${p.imageKey}` : null })),
    models,
    /** A sensible starting voice for new characters and library presenters. */
    defaultVoice: voices[0] ?? null,
    /** Catalogue size for the voice library tab (the list itself is searched server-side). */
    voiceStats: { total: voices.length, elevenlabs: voices.filter(v => v.provider === "elevenlabs").length, heygen: voices.filter(v => v.provider === "heygen").length, languages: new Set(voices.map(v => v.language).filter(Boolean)).size },
    /** HeyGen's public presenter library: people (groups); looks load on demand via loadPresenterLooks. */
    presenterGroups: library.groups,
    presenterLibraryLoading: library.loading,
    videoModels: catalog.list("video").map(m => ({ id: m.id, label: m.label, default: m.id === catalog.default("video").id, notes: m.notes ?? "" })),
    videoConnected: isFalConfigured && isHeyGenConfigured,
    missingVideoProviders: [!isFalConfigured && "fal.ai", !isHeyGenConfigured && "HeyGen"].filter(Boolean) as string[],
  };
}
export type CharacterStudioData = Awaited<ReturnType<typeof characterStudioData>>;
