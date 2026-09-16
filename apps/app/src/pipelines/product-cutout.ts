import { eq } from "drizzle-orm";
import { db, dbReady, generationEvents, products } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import { removeBackground, BACKGROUND_REMOVAL_MODEL, isFalConfigured } from "@adcraft/ai";
import { registerJob } from "@/server/jobs";
import type { ProductAttributes } from "@/server/library-data";

/**
 * product.cutout — remove the background from a product's original photo and
 * store the PNG as `products.cutoutKey`. Records a generation_events row either way.
 */
export async function runProductCutout({ orgId, productId }: { orgId: string; productId: string }) {
  await dbReady;
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.orgId !== orgId) throw new Error(`Product ${productId} not found in org ${orgId}`);

  const attrs = (product.attributes ?? {}) as ProductAttributes;
  const startedAt = Date.now();
  const [event] = await db
    .insert(generationEvents)
    .values({
      orgId,
      capability: "image",
      provider: "fal",
      model: BACKGROUND_REMOVAL_MODEL,
      status: "started",
      credits: 0,
      units: "1",
      operationId: `product.cutout:${productId}:${startedAt}`,
      meta: { productId, brandId: product.brandId, label: `Cutout · ${product.name}`, detail: isFalConfigured ? "Removing background" : "Offline · original kept" },
    })
    .returning({ id: generationEvents.id });

  const finish = async (patch: Partial<typeof generationEvents.$inferInsert>) => {
    await db.update(generationEvents).set({ durationMs: Date.now() - startedAt, ...patch }).where(eq(generationEvents.id, event.id));
  };

  try {
    if (!product.imageKey) throw new Error("Product has no original image");
    const storage = getStorage();
    const original = await storage.get(product.imageKey);
    if (!original) throw new Error(`Original image ${product.imageKey} missing from storage`);

    const result = await removeBackground(original.body);
    const key = objectKey(orgId, "cutouts", "png");
    await storage.put(key, result.png, { contentType: "image/png" });
    if (product.cutoutKey && product.cutoutKey !== key) await storage.delete(product.cutoutKey).catch(() => {});

    const nextAttrs: ProductAttributes = {
      ...attrs,
      cutout: { status: "ready", updatedAt: new Date().toISOString(), model: BACKGROUND_REMOVAL_MODEL, removed: result.removed },
    };
    await db.update(products).set({ cutoutKey: key, attributes: nextAttrs }).where(eq(products.id, productId));
    await finish({
      status: "succeeded",
      costUsd: result.usage.costUsd !== undefined ? String(result.usage.costUsd) : null,
      meta: { productId, brandId: product.brandId, label: `Cutout · ${product.name}`, cutoutKey: key, removed: result.removed },
    });
    return { cutoutKey: key };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(products)
      .set({ attributes: { ...attrs, cutout: { status: "failed", error: message, updatedAt: new Date().toISOString(), model: BACKGROUND_REMOVAL_MODEL } } satisfies ProductAttributes })
      .where(eq(products.id, productId));
    await finish({ status: "failed", error: message });
    throw err;
  }
}

registerJob("product.cutout", runProductCutout);
