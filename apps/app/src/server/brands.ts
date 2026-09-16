"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, dbReady, brands, brandKits, type BrandKitData } from "@adcraft/db";
import { getStorage, objectKey, extFromMime } from "@adcraft/storage";
import { requireOrg } from "./org";
import { switchBrand } from "./onboarding";
import { getBrand, getActiveKit } from "./brands-data";
import { COLOR_FIELDS, CTA_STYLES, DEFAULT_KIT, KIT_FONTS, KIT_TONES, normalizeHex, withDefaults } from "@/lib/brand-kit";
import { LOGO_TYPES, MAX_LOGO_EDGE, MAX_UPLOAD_BYTES } from "@/lib/uploads";

function field(formData: FormData, name: string) {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function lines(s: string) {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function normaliseWebsite(s: string) {
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export async function createBrand(formData: FormData) {
  await dbReady;
  const ctx = await requireOrg();
  const name = field(formData, "name");
  if (!name) redirect("/brands/new?error=name");

  const [brand] = await db
    .insert(brands)
    .values({ orgId: ctx.org.id, name, website: normaliseWebsite(field(formData, "website")), industry: field(formData, "industry") || null })
    .returning();
  await db.insert(brandKits).values({ orgId: ctx.org.id, brandId: brand.id, version: 1, isActive: true, data: DEFAULT_KIT });

  await switchBrand(brand.id);
  revalidatePath("/", "layout");
  redirect(`/brands/${brand.id}?created=1`);
}

/** Stores a logo (svg as-is, raster normalised to ≤ 1024px PNG). Returns the file URL. */
async function storeLogo(orgId: string, file: File): Promise<string | { error: string }> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return { error: "logo-type" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "logo-size" };
  const input = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  if (file.type === "image/svg+xml") {
    const key = objectKey(orgId, "logos", extFromMime(file.type));
    await storage.put(key, input, { contentType: file.type });
    return `/api/files/${key}`;
  }
  const png = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: MAX_LOGO_EDGE, height: MAX_LOGO_EDGE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const key = objectKey(orgId, "logos", "png");
  await storage.put(key, png, { contentType: "image/png" });
  return `/api/files/${key}`;
}

/**
 * Save brand details and write a new brand_kits version. Earlier versions are
 * kept (isActive=false) so generations can reference the kit they were made with.
 */
export async function saveBrandKit(brandId: string, formData: FormData) {
  await dbReady;
  const ctx = await requireOrg();
  const brand = await getBrand(ctx.org.id, brandId);
  if (!brand) redirect("/brands");

  const name = field(formData, "name");
  if (!name) redirect(`/brands/${brandId}?error=name`);

  const current = withDefaults((await getActiveKit(ctx.org.id, brandId))?.data);

  let logoUrl = current.logoUrl;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const stored = await storeLogo(ctx.org.id, logo);
    if (typeof stored !== "string") redirect(`/brands/${brandId}?error=${stored.error}`);
    logoUrl = stored;
  } else if (field(formData, "removeLogo") === "1") {
    logoUrl = undefined;
  }

  const colors = Object.fromEntries(
    COLOR_FIELDS.map(({ key }) => [key, normalizeHex(field(formData, `color.${key}`), current.colors[key] ?? DEFAULT_KIT.colors[key] ?? "#000000")]),
  ) as BrandKitData["colors"];

  const pickFont = (v: string, fallback: string) => ((KIT_FONTS as readonly string[]).includes(v) ? v : fallback);
  const tone = formData
    .getAll("tone")
    .map(String)
    .filter((t) => (KIT_TONES as readonly string[]).includes(t));
  const ctaStyle = field(formData, "ctaStyle");

  const data: BrandKitData = {
    colors,
    fonts: { heading: pickFont(field(formData, "font.heading"), current.fonts.heading), body: pickFont(field(formData, "font.body"), current.fonts.body) },
    logoUrl,
    logoDarkUrl: current.logoDarkUrl,
    voice: { tone, doSay: lines(field(formData, "doSay")), dontSay: lines(field(formData, "dontSay")) },
    tagline: field(formData, "tagline") || undefined,
    ctaStyle: CTA_STYLES.some((c) => c.id === ctaStyle) ? ctaStyle : current.ctaStyle,
  };

  await db
    .update(brands)
    .set({ name, website: normaliseWebsite(field(formData, "website")), industry: field(formData, "industry") || null })
    .where(eq(brands.id, brandId));

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${brandKits.version}), 0)::int` })
    .from(brandKits)
    .where(and(eq(brandKits.orgId, ctx.org.id), eq(brandKits.brandId, brandId)));
  await db
    .update(brandKits)
    .set({ isActive: false })
    .where(and(eq(brandKits.brandId, brandId), eq(brandKits.isActive, true)));
  await db.insert(brandKits).values({ orgId: ctx.org.id, brandId, version: (max ?? 0) + 1, isActive: true, data });

  revalidatePath("/", "layout");
  revalidatePath("/brands");
  revalidatePath(`/brands/${brandId}`);
  redirect(`/brands/${brandId}?saved=1`);
}

export async function selectBrand(brandId: string) {
  await dbReady;
  const ctx = await requireOrg();
  const brand = await getBrand(ctx.org.id, brandId);
  if (!brand) redirect("/brands");
  await switchBrand(brandId);
  revalidatePath("/", "layout");
  redirect("/brands");
}
