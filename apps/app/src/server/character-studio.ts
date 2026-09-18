import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, dbReady, characters, products } from "@adcraft/db";
import { isFalConfigured, isHeyGenConfigured, listAllVoices, LOOK_PACKS } from "@adcraft/ai";
import { listBrandVoices, resolveVoice, toCatalogVoice } from "./brand-voices";
import { getPresenterGroups } from "./presenter-library";
import { getCatalog } from "./model-catalog";
import { CREDIT_COSTS } from "./billing";

export async function studioModels() {
  const c = await getCatalog();
  return c.list("image").map(m => ({ ...m, creditsPerUnit: m.credits, enabled: m.enabled !== false, connected: m.connected }));
}

export async function characterStudioData(orgId: string, brandId: string) {
  await dbReady;
  const [people, items, models, voices, catalog, library, ownVoices] = await Promise.all([
    db.select().from(characters).where(and(eq(characters.orgId, orgId), eq(characters.brandId, brandId))).orderBy(desc(characters.createdAt)),
    db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.brandId, brandId))).orderBy(desc(products.createdAt)),
    studioModels(), listAllVoices(), getCatalog(), getPresenterGroups(), listBrandVoices(orgId, brandId),
  ]);
  return {
    characters: await Promise.all(people.map(async c => ({ id: c.id, name: c.name, description: c.description, personality: c.personality, voiceId: c.voiceId, voice: await resolveVoice(orgId, c.voiceId), imageModel: c.imageModel, motion: c.motion ?? {}, portraitUrl: c.portraitKey ? `/api/files/${c.portraitKey}` : null, status: c.status, error: c.error, onHeyGen: Boolean(c.heygen?.lookId), looks: c.looks.map(l => ({ id: l.id, name: l.name, url: `/api/files/${l.imageKey}`, heygen: Boolean(l.heygenLookId), packId: l.packId ?? null })) }))),
    products: items.map(p => ({ id: p.id, name: p.name, description: p.description ?? "", imageUrl: p.imageKey ? `/api/files/${p.imageKey}` : null })),
    models,
    /** A sensible starting voice for new characters and library presenters. */
    defaultVoice: voices[0] ?? null,
    /** Catalogue size for the voice library tab (the list itself is searched server-side). */
    /** This workspace's clones and designed voices (HeyGen private voices). */
    ownVoices: ownVoices.map(toCatalogVoice),
    /** HeyGen look packs and single templates the API resolves for any workspace. */
    lookPacks: LOOK_PACKS.map(p => ({ id: p.id, name: p.name, kind: p.kind, description: p.description, palette: p.palette, previews: p.previews, looks: p.looks, type: p.type })),
    heygenLookCredits: CREDIT_COSTS.heygenLook,
    voiceStats: { total: voices.length + ownVoices.length, owned: ownVoices.length, elevenlabs: voices.filter(v => v.provider === "elevenlabs").length, heygen: voices.filter(v => v.provider === "heygen").length, languages: new Set(voices.map(v => v.language).filter(Boolean)).size },
    /** HeyGen's public presenter library: people (groups); looks load on demand via loadPresenterLooks. */
    presenterGroups: library.groups,
    presenterLibraryLoading: library.loading,
    videoModels: catalog.list("video").map(m => ({ id: m.id, label: m.label, default: m.id === catalog.default("video").id, notes: m.notes ?? "" })),
    videoConnected: isFalConfigured && isHeyGenConfigured,
    heygenConnected: isHeyGenConfigured,
    missingVideoProviders: [!isFalConfigured && "fal.ai", !isHeyGenConfigured && "HeyGen"].filter(Boolean) as string[],
  };
}
export type CharacterStudioData = Awaited<ReturnType<typeof characterStudioData>>;
