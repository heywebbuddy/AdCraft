import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, dbReady, characters, products } from "@adcraft/db";
import { imageModels, videoModels, isFalConfigured, isOpenAIConfigured, isHeyGenConfigured, isElevenLabsConfigured, listVoices } from "@adcraft/ai";
import { getModelOverrides } from "./platform-settings";

export async function studioModels() {
  const overrides = await getModelOverrides();
  return imageModels.map(m => ({ ...m, creditsPerUnit: Math.ceil(overrides[m.id]?.creditsPerUnit ?? m.creditsPerUnit), enabled: overrides[m.id]?.enabled !== false, connected: m.provider === "openai" ? isOpenAIConfigured() : isFalConfigured }));
}

export async function characterStudioData(orgId: string, brandId: string) {
  await dbReady;
  const [people, items, models, voices, overrides] = await Promise.all([
    db.select().from(characters).where(and(eq(characters.orgId, orgId), eq(characters.brandId, brandId))).orderBy(desc(characters.createdAt)),
    db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.brandId, brandId))).orderBy(desc(products.createdAt)),
    studioModels(), listVoices(), getModelOverrides(),
  ]);
  return {
    characters: people.map(c => ({ id: c.id, name: c.name, description: c.description, personality: c.personality, voiceId: c.voiceId, imageModel: c.imageModel, portraitUrl: c.portraitKey ? `/api/files/${c.portraitKey}` : null, status: c.status, error: c.error, looks: c.looks.map(l => ({ id: l.id, name: l.name, url: `/api/files/${l.imageKey}` })) })),
    products: items.map(p => ({ id: p.id, name: p.name, description: p.description ?? "", imageUrl: p.imageKey ? `/api/files/${p.imageKey}` : null })),
    models, voices,
    videoModels: videoModels.filter(m => overrides[m.id]?.enabled !== false),
    videoConnected: isFalConfigured && isHeyGenConfigured && isElevenLabsConfigured,
    missingVideoProviders: [!isFalConfigured && "fal.ai", !isHeyGenConfigured && "HeyGen", !isElevenLabsConfigured && "ElevenLabs"].filter(Boolean) as string[],
  };
}
export type CharacterStudioData = Awaited<ReturnType<typeof characterStudioData>>;
