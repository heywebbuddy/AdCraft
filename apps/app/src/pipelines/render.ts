import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, dbReady, creatives, renders, variants } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import { getPlacement } from "@adcraft/specs";
import { documentRenderKey, normalizeDocument, renderStatic, type AssetRef, type StaticAdDocument } from "@adcraft/render";
import { registerJob } from "@/server/jobs";

const ENGINE = "satori";

/** Reads scene / cutout / logo bytes for the renderer from our own storage. */
export async function loadStoredAsset(ref: AssetRef): Promise<Buffer | null> {
  const storage = getStorage();
  const key = ref.key ?? (ref.url?.startsWith("/api/files/") ? ref.url.slice("/api/files/".length) : undefined);
  if (!key) return null;
  const obj = await storage.get(key);
  return obj?.body ?? null;
}

function hashOf(doc: StaticAdDocument, size: { width: number; height: number }) {
  return createHash("sha1").update(documentRenderKey(doc)).update(`|${size.width}x${size.height}|${ENGINE}`).digest("hex");
}

/**
 * render.variants — render the creative's document at every variant size.
 * Idempotent: a variant whose latest succeeded render carries the same document
 * hash is skipped, so re-dispatching after an unrelated change costs nothing.
 */
export async function runRenderPipeline({ orgId, creativeId }: { orgId: string; creativeId: string }) {
  await dbReady;
  const [creative] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.orgId, orgId))).limit(1);
  if (!creative) throw new Error(`Creative ${creativeId} not found in org ${orgId}`);
  const baseDoc = normalizeDocument(creative.document as unknown as StaticAdDocument);
  const storage = getStorage();

  const vs = await db.select().from(variants).where(eq(variants.creativeId, creativeId)).orderBy(variants.createdAt);
  const results: Array<{ variantId: string; status: "skipped" | "succeeded" | "failed"; renderId?: string }> = [];

  for (const v of vs) {
    const doc: StaticAdDocument = v.overrides ? normalizeDocument({ ...baseDoc, ...(v.overrides as Partial<StaticAdDocument>) }) : baseDoc;
    const docHash = hashOf(doc, v);

    const existing = await db
      .select({ id: renders.id, status: renders.status, meta: renders.meta, outputKey: renders.outputKey })
      .from(renders)
      .where(and(eq(renders.variantId, v.id), eq(renders.status, "succeeded")))
      .orderBy(renders.createdAt);
    if (existing.some((r) => r.outputKey && (r.meta as { docHash?: string } | null)?.docHash === docHash)) {
      results.push({ variantId: v.id, status: "skipped" });
      continue;
    }

    let safeZone: { top: number; right: number; bottom: number; left: number } | undefined;
    try {
      safeZone = getPlacement(v.placementId).safeZone;
    } catch {
      safeZone = undefined;
    }

    const [row] = await db
      .insert(renders)
      .values({ orgId, variantId: v.id, status: "queued", engine: ENGINE, meta: { docHash, placementId: v.placementId, ratio: v.ratio, template: doc.template } })
      .returning({ id: renders.id });
    const startedAt = Date.now();
    await db.update(renders).set({ status: "running" }).where(eq(renders.id, row.id));

    try {
      const png = await renderStatic(doc, { width: v.width, height: v.height, ratio: v.ratio as never, safeZone }, { loadAsset: loadStoredAsset });
      const key = objectKey(orgId, "renders", "png");
      await storage.put(key, png, { contentType: "image/png" });
      await db
        .update(renders)
        .set({
          status: "succeeded",
          outputKey: key,
          mimeType: "image/png",
          fileBytes: png.byteLength,
          error: null,
          meta: { docHash, placementId: v.placementId, ratio: v.ratio, template: doc.template, durationMs: Date.now() - startedAt, width: v.width, height: v.height },
        })
        .where(eq(renders.id, row.id));
      results.push({ variantId: v.id, status: "succeeded", renderId: row.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(renders)
        .set({ status: "failed", error: message.slice(0, 2000), meta: { docHash, placementId: v.placementId, ratio: v.ratio, template: doc.template, durationMs: Date.now() - startedAt } })
        .where(eq(renders.id, row.id));
      results.push({ variantId: v.id, status: "failed", renderId: row.id });
      console.error(`[render.variants] ${creativeId} ${v.placementId} failed`, err);
    }
  }

  // Touch the creative so lists ordered by updatedAt surface fresh renders.
  await db.update(creatives).set({ updatedAt: new Date() }).where(eq(creatives.id, creativeId));
  return { creativeId, results };
}

registerJob("render.variants", runRenderPipeline);
