import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";

export const brands = pgTable(
  "brands",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    industry: text("industry"),
    ...timestamps,
  },
  (t) => [index("brands_org_idx").on(t.orgId)],
);

export type BrandKitData = {
  colors: { primary: string; secondary?: string; accent?: string; background?: string; text?: string };
  fonts: { heading: string; body: string };
  logoUrl?: string;
  logoDarkUrl?: string;
  voice?: { tone: string[]; doSay?: string[]; dontSay?: string[] };
  tagline?: string;
  ctaStyle?: string;
};

export const brandKits = pgTable(
  "brand_kits",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    data: jsonb("data").$type<BrandKitData>().notNull(),
    ...timestamps,
  },
  (t) => [index("brand_kits_brand_idx").on(t.brandId)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    price: text("price"),
    url: text("url"),
    /** Original upload (R2 key). */
    imageKey: text("image_key"),
    /** Background-removed cutout (R2 key), used as generation reference. */
    cutoutKey: text("cutout_key"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("products_brand_idx").on(t.brandId)],
);
