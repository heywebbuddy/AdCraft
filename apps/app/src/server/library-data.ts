import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, products } from "@adcraft/db";

export type CutoutStatus = "processing" | "ready" | "failed";

/** Shape of `products.attributes` (jsonb). */
export type ProductAttributes = {
  width?: number;
  height?: number;
  bytes?: number;
  originalName?: string;
  cutout?: { status: CutoutStatus; error?: string; updatedAt?: string; model?: string; removed?: boolean };
};

export type Product = typeof products.$inferSelect;

export function productAttributes(p: Pick<Product, "attributes">): ProductAttributes {
  return (p.attributes ?? {}) as ProductAttributes;
}

export function cutoutStatus(p: Pick<Product, "attributes" | "cutoutKey">): CutoutStatus {
  const a = productAttributes(p);
  if (a.cutout?.status) return a.cutout.status;
  return p.cutoutKey ? "ready" : "processing";
}

export function fileUrl(key: string | null | undefined) {
  return key ? `/api/files/${key}` : null;
}

export async function listProducts(orgId: string, brandId: string) {
  return db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.brandId, brandId)))
    .orderBy(desc(products.createdAt));
}

export async function getProduct(orgId: string, productId: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.id, productId)))
    .limit(1);
  return row ?? null;
}
