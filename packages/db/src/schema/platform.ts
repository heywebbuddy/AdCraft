import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
