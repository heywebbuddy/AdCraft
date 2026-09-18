"use server";

import "@/pipelines";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, dbReady, products } from "@adcraft/db";
import { getStorage, objectKey, extFromMime } from "@adcraft/storage";
import { requireOrg } from "./org";
import { importProductFromUrl } from "./product-import";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { dispatch } from "./jobs";
import { getProduct, productAttributes, type ProductAttributes } from "./library-data";
import { IMAGE_TYPES, MAX_PRODUCT_EDGE, MAX_UPLOAD_BYTES } from "@/lib/uploads";

type Prepared = { key: string; attributes: Pick<ProductAttributes, "width" | "height" | "bytes" | "originalName"> };

function field(formData: FormData, name: string) {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function fileOf(formData: FormData, name: string): File | null {
  const f = formData.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}

/**
 * Validate, normalise (auto-rotate, ≤ 2048px on the long edge) and store a product
 * photo. Returns the storage key plus dimensions for `products.attributes`.
 */
async function storeProductImage(orgId: string, file: File): Promise<Prepared | { error: string }> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return { error: "type" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "size" };
  const input = Buffer.from(await file.arrayBuffer());
  let pipeline = sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_PRODUCT_EDGE, height: MAX_PRODUCT_EDGE, fit: "inside", withoutEnlargement: true });
  pipeline = file.type === "image/png" ? pipeline.png() : file.type === "image/webp" ? pipeline.webp({ quality: 92 }) : pipeline.jpeg({ quality: 90, mozjpeg: true });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const ext = extFromMime(file.type);
  const key = objectKey(orgId, "products", ext);
  await getStorage().put(key, data, { contentType: file.type });
  return { key, attributes: { width: info.width, height: info.height, bytes: info.size, originalName: file.name } };
}

export async function createProduct(formData: FormData) {
  await dbReady;
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");

  const name = field(formData, "name");
  const file = fileOf(formData, "image");
  if (!name) redirect("/library/new?error=name");
  if (!file) redirect("/library/new?error=image");

  const stored = await storeProductImage(ctx.org.id, file);
  if ("error" in stored) redirect(`/library/new?error=${stored.error}`);

  const [product] = await db
    .insert(products)
    .values({
      orgId: ctx.org.id,
      brandId: ctx.brand.id,
      name,
      description: field(formData, "description") || null,
      price: field(formData, "price") || null,
      url: field(formData, "url") || null,
      imageKey: stored.key,
      attributes: { ...stored.attributes, cutout: { status: "processing", updatedAt: new Date().toISOString() } } satisfies ProductAttributes,
    })
    .returning();

  await dispatch("product.cutout", { orgId: ctx.org.id, productId: product.id });
  revalidatePath("/library");
  redirect(`/library/${product.id}`);
}

/** "Import from a URL" on the library: metadata + photo from a product page, then cutout. */
export async function importProduct(formData: FormData) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  const url = field(formData, "url");
  let productId: string;
  try {
    const result = await importProductFromUrl(ctx.org.id, ctx.brand.id, url);
    productId = result.productId;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    redirect(`/library/new?error=url&detail=${encodeURIComponent(err instanceof Error ? err.message : "Could not read that page.")}`);
  }
  revalidatePath("/library");
  redirect(`/library/${productId}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  await dbReady;
  const ctx = await requireOrg();
  const product = await getProduct(ctx.org.id, productId);
  if (!product) redirect("/library");

  const name = field(formData, "name");
  if (!name) redirect(`/library/${productId}?error=name`);

  const patch: Partial<typeof products.$inferInsert> = {
    name,
    description: field(formData, "description") || null,
    price: field(formData, "price") || null,
    url: field(formData, "url") || null,
  };

  let redoCutout = false;
  const file = fileOf(formData, "image");
  if (file) {
    const stored = await storeProductImage(ctx.org.id, file);
    if ("error" in stored) redirect(`/library/${productId}?error=${stored.error}`);
    const storage = getStorage();
    if (product.imageKey) await storage.delete(product.imageKey).catch(() => {});
    if (product.cutoutKey) await storage.delete(product.cutoutKey).catch(() => {});
    patch.imageKey = stored.key;
    patch.cutoutKey = null;
    patch.attributes = { ...stored.attributes, cutout: { status: "processing", updatedAt: new Date().toISOString() } } satisfies ProductAttributes;
    redoCutout = true;
  }

  await db.update(products).set(patch).where(eq(products.id, productId));
  if (redoCutout) await dispatch("product.cutout", { orgId: ctx.org.id, productId });
  revalidatePath("/library");
  revalidatePath(`/library/${productId}`);
  redirect(`/library/${productId}?saved=1`);
}

export async function redoCutout(productId: string) {
  await dbReady;
  const ctx = await requireOrg();
  const product = await getProduct(ctx.org.id, productId);
  if (!product) redirect("/library");
  if (!product.imageKey) redirect(`/library/${productId}?error=image`);

  const attrs = productAttributes(product);
  await db
    .update(products)
    .set({ attributes: { ...attrs, cutout: { status: "processing", updatedAt: new Date().toISOString() } } satisfies ProductAttributes })
    .where(eq(products.id, productId));
  await dispatch("product.cutout", { orgId: ctx.org.id, productId });
  revalidatePath(`/library/${productId}`);
  redirect(`/library/${productId}`);
}

export async function deleteProduct(productId: string) {
  await dbReady;
  const ctx = await requireOrg();
  const product = await getProduct(ctx.org.id, productId);
  if (!product) redirect("/library");

  const storage = getStorage();
  if (product.imageKey) await storage.delete(product.imageKey).catch(() => {});
  if (product.cutoutKey) await storage.delete(product.cutoutKey).catch(() => {});
  await db.delete(products).where(eq(products.id, productId));
  revalidatePath("/library");
  redirect("/library?deleted=1");
}
