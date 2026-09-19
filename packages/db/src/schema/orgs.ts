import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { creditReason, membershipRole, subscriptionStatus } from "./enums";
import { users } from "./auth";

/** Per-workspace guardrails, edited by owners in Settings; null means "use the platform default". */
export type OrgSettings = {
  /** Daily ad budget (major units) above which only an owner may publish active. */
  spendApprovalAbove?: number | null;
  /** Generation credits a workspace may spend per calendar month; null = its plan grant only. */
  monthlyCreditCap?: number | null;
  /** Require an approved review before a creative can be added to a campaign. */
  approvalBeforePublish?: boolean;
  /** Email the workspace when long jobs finish (videos, characters, twins). */
  notifyOnFinish?: boolean;
  /** ISO timestamp set when an owner asks us to delete the workspace. */
  deletionRequestedAt?: string;
  deletionReason?: string;
};

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  /** Set by a platform admin; members are locked out of the workspace while set. */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("editor"),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId)],
);

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  plan: text("plan").notNull(), // starter | pro | scale | enterprise
  status: subscriptionStatus("status").notNull().default("trialing"),
  creditsPerPeriod: integer("credits_per_period").notNull().default(0),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAt: timestamp("cancel_at", { withTimezone: true }),
  ...timestamps,
});

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    /** Positive = grant, negative = spend. Balance is SUM(delta). */
    delta: integer("delta").notNull(),
    reason: creditReason("reason").notNull(),
    /** Idempotency key (e.g. generation event id, stripe invoice id). */
    referenceId: text("reference_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_ledger_org_created_idx").on(t.orgId, t.createdAt),
    uniqueIndex("credit_ledger_reference_idx").on(t.orgId, t.reason, t.referenceId),
  ],
);
