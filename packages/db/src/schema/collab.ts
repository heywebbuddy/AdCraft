import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";
import { users } from "./auth";
import { brands } from "./brands";
import { creatives, variants } from "./creative";
import { creativeKind, membershipRole } from "./enums";

// Release 3: team, review & approvals, client share links, templates, audit log.

export const approvalStatus = pgEnum("approval_status", ["draft", "in_review", "approved", "changes_requested"]);
export const shareLinkKind = pgEnum("share_link_kind", ["review", "gallery"]);

/** Pending invitations to join an organisation. Accepted via /invite/[token]. */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRole("role").notNull().default("editor"),
    token: text("token").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("invites_org_idx").on(t.orgId), index("invites_email_idx").on(t.email)],
);

/** Review comments on a creative (optionally pinned to one variant). External reviewers have no authorId. */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    creativeId: uuid("creative_id").notNull().references(() => creatives.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => variants.id, { onDelete: "set null" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Display name for external reviewers (share links) or a snapshot of the member's name. */
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_creative_idx").on(t.creativeId, t.createdAt)],
);

/** One approval record per creative; status moves draft → in_review → approved | changes_requested. */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    creativeId: uuid("creative_id").notNull().references(() => creatives.id, { onDelete: "cascade" }),
    status: approvalStatus("status").notNull().default("draft"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    /** Name of an external reviewer who decided through a share link. */
    decidedByName: text("decided_by_name"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("approvals_creative_idx").on(t.creativeId)],
);

/** Public, token-addressed links: review one creative, or a gallery of a brand's approved creatives. */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    creativeId: uuid("creative_id").references(() => creatives.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    kind: shareLinkKind("kind").notNull().default("review"),
    allowComments: boolean("allow_comments").notNull().default(true),
    allowApprove: boolean("allow_approve").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("share_links_org_idx").on(t.orgId), index("share_links_creative_idx").on(t.creativeId)],
);

/** Saved creative documents reusable across briefs; `isShared` makes a template visible to every brand in the org. */
export const templates = pgTable(
  "templates",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: creativeKind("kind").notNull().default("static"),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    isShared: boolean("is_shared").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("templates_org_idx").on(t.orgId), index("templates_brand_idx").on(t.brandId)],
);

/** Who did what, for the Agency tier audit trail. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. "member.invited", "approval.approved", "share_link.created". */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_created_idx").on(t.orgId, t.createdAt)],
);
