import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, brands, brandKits, type BrandKitData } from "@adcraft/db";
import { withDefaults } from "@/lib/brand-kit";

export type Brand = typeof brands.$inferSelect;
export type BrandKit = typeof brandKits.$inferSelect;

export async function getBrand(orgId: string, brandId: string) {
  const [row] = await db.select().from(brands).where(and(eq(brands.orgId, orgId), eq(brands.id, brandId))).limit(1);
  return row ?? null;
}

/** The active kit (or the latest one if none is flagged active). */
export async function getActiveKit(orgId: string, brandId: string) {
  const rows = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.orgId, orgId), eq(brandKits.brandId, brandId)))
    .orderBy(desc(brandKits.isActive), desc(brandKits.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function listKitVersions(orgId: string, brandId: string) {
  return db
    .select({ id: brandKits.id, version: brandKits.version, isActive: brandKits.isActive, createdAt: brandKits.createdAt })
    .from(brandKits)
    .where(and(eq(brandKits.orgId, orgId), eq(brandKits.brandId, brandId)))
    .orderBy(desc(brandKits.version));
}

/** Active kit data per brand for a set of brands (for the list page). */
export async function activeKitsFor(orgId: string, brandIds: string[]) {
  if (brandIds.length === 0) return new Map<string, BrandKitData>();
  const rows = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.orgId, orgId), inArray(brandKits.brandId, brandIds)))
    .orderBy(desc(brandKits.isActive), desc(brandKits.version));
  const map = new Map<string, BrandKitData>();
  for (const r of rows) if (!map.has(r.brandId)) map.set(r.brandId, withDefaults(r.data));
  return map;
}
