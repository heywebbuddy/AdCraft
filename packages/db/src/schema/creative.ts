import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";
import { brands, products } from "./brands";
import { conceptStatus, creativeKind, renderStatus } from "./enums";

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("projects_brand_idx").on(t.brandId)],
);

export type BriefData = {
  objective: string; // awareness | conversion | ...
  audience: string;
  offer?: string;
  keyMessages?: string[];
  platforms: string[]; // meta | tiktok | google | youtube
  formats: Array<"static" | "video" | "ugc">;
  ratios?: string[];
  constraints?: string[];
};

export const briefs = pgTable(
  "briefs",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    data: jsonb("data").$type<BriefData>().notNull(),
    ...timestamps,
  },
  (t) => [index("briefs_project_idx").on(t.projectId)],
);

export type ConceptData = {
  hook: string;
  angle: string;
  headline: string;
  primaryText: string;
  description?: string;
  cta: string;
  visualDirection: string;
  script?: string;
};

export const concepts = pgTable(
  "concepts",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id").notNull().references(() => briefs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: creativeKind("kind").notNull(),
    status: conceptStatus("status").notNull().default("proposed"),
    data: jsonb("data").$type<ConceptData>().notNull(),
    model: text("model"),
    ...timestamps,
  },
  (t) => [index("concepts_brief_idx").on(t.briefId)],
);

export const creatives = pgTable(
  "creatives",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
    kind: creativeKind("kind").notNull(),
    name: text("name").notNull(),
    /** Layered document (static) or storyboard/timeline (video/ugc). */
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (t) => [index("creatives_concept_idx").on(t.conceptId)],
);

export const variants = pgTable(
  "variants",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    creativeId: uuid("creative_id").notNull().references(() => creatives.id, { onDelete: "cascade" }),
    /** Placement spec id from @adcraft/specs, e.g. "meta.feed.1x1". */
    placementId: text("placement_id").notNull(),
    ratio: text("ratio").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    durationSec: integer("duration_sec"),
    /** Per-variant overrides on top of the creative document. */
    overrides: jsonb("overrides").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("variants_creative_idx").on(t.creativeId)],
);

export const renders = pgTable(
  "renders",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
    status: renderStatus("status").notNull().default("queued"),
    engine: text("engine").notNull(), // satori | playwright | remotion-lambda
    outputKey: text("output_key"),
    mimeType: text("mime_type"),
    fileBytes: integer("file_bytes"),
    error: text("error"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("renders_variant_idx").on(t.variantId)],
);
