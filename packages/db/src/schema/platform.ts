import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { organizations } from "./orgs";
import { users } from "./auth";

// Platform operations (PLAN.md section 14): admin-editable settings and per-org support notes.

/** Key/value settings edited from /admin/settings, e.g. "maintenanceBanner", "signupsEnabled", "trialCredits", "planFeatures", "models". */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Unhandled server errors, so a customer hitting a bug leaves a trace someone can read
 * (Admin → Errors) even when no external error tracker is configured. Pruned to 14 days.
 */
export const errorEvents = pgTable(
  "error_events",
  {
    id: id(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    route: text("route").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    message: text("message").notNull(),
    digest: text("digest"),
    stack: text("stack"),
    release: text("release"),
    count: integer("count").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("error_events_last_seen_idx").on(t.lastSeenAt)],
);

/** Internal notes a platform admin leaves on an organisation (never shown to customers). */
export const adminNotes = pgTable(
  "admin_notes",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_notes_org_created_idx").on(t.orgId, t.createdAt)],
);

/**
 * The model catalog as edited from /admin/models. A row whose id matches a built-in model
 * overrides that model's fields (credits, label, endpoints, options…); any other id is a
 * custom model whose `spec` must be complete. See packages/ai/src/models.ts `mergeCatalog`.
 */
export const aiModels = pgTable("ai_models", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"text" | "image" | "video">().notNull(),
  spec: jsonb("spec").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
