import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";
import { users } from "./auth";

// Release 3: public API keys and outbound webhooks.

/** Bearer keys for /api/v1. Only a SHA-256 hash is stored; `prefix` identifies the key in the UI. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hashedKey: text("hashed_key").notNull().unique(),
    prefix: text("prefix").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("api_keys_org_idx").on(t.orgId)],
);

/** Outbound webhook endpoints. Payloads are signed with HMAC-SHA256 over the raw body using `secret`. */
export const webhooks = pgTable(
  "webhooks",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    /** Event names, e.g. ["creative.rendered", "approval.approved"]. Empty = all events. */
    events: jsonb("events").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("webhooks_org_idx").on(t.orgId)],
);
