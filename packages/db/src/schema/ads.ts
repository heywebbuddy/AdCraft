import { bigint, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./orgs";
import { brands } from "./brands";
import { variants } from "./creative";
import { adAccountStatus, adPlatform, campaignStatus } from "./enums";

/** Fields every mirrored platform object carries (PLAN.md section 4 rules). */
const platformMirror = {
  externalId: text("external_id").notNull(),
  platform: adPlatform("platform").notNull(),
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
};

export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    platform: adPlatform("platform").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name"),
    currency: text("currency"),
    timezone: text("timezone"),
    status: adAccountStatus("status").notNull().default("connected"),
    /** Encrypted at rest (KMS) — never store plaintext tokens here. */
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("ad_accounts_platform_external_idx").on(t.orgId, t.platform, t.externalId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    objective: text("objective"),
    status: campaignStatus("status").notNull().default("draft"),
    dailyBudgetMinor: bigint("daily_budget_minor", { mode: "number" }),
    operationId: text("operation_id"),
    ...platformMirror,
    ...timestamps,
  },
  (t) => [
    index("campaigns_account_idx").on(t.adAccountId),
    uniqueIndex("campaigns_platform_external_idx").on(t.platform, t.externalId),
  ],
);

export const adSets = pgTable(
  "ad_sets",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    targeting: jsonb("targeting").$type<Record<string, unknown>>(),
    placements: jsonb("placements").$type<string[]>(),
    dailyBudgetMinor: bigint("daily_budget_minor", { mode: "number" }),
    operationId: text("operation_id"),
    ...platformMirror,
    ...timestamps,
  },
  (t) => [
    index("ad_sets_campaign_idx").on(t.campaignId),
    uniqueIndex("ad_sets_platform_external_idx").on(t.platform, t.externalId),
  ],
);

export const ads = pgTable(
  "ads",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adSetId: uuid("ad_set_id").notNull().references(() => adSets.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => variants.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    /** Platform creative object id (Meta ad creative, TikTok video id, Google asset). */
    externalCreativeId: text("external_creative_id"),
    operationId: text("operation_id"),
    ...platformMirror,
    ...timestamps,
  },
  (t) => [
    index("ads_ad_set_idx").on(t.adSetId),
    uniqueIndex("ads_platform_external_idx").on(t.platform, t.externalId),
  ],
);

// TODO: partition by date once volume requires it (PLAN.md section 4, analytics DB).
export const metricsDaily = pgTable(
  "metrics_daily",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    spendMinor: bigint("spend_minor", { mode: "number" }).notNull().default(0),
    currency: text("currency"),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    reach: bigint("reach", { mode: "number" }),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    conversions: bigint("conversions", { mode: "number" }).notNull().default(0),
    conversionValueMinor: bigint("conversion_value_minor", { mode: "number" }),
    videoViews: bigint("video_views", { mode: "number" }),
    thruplays: bigint("thruplays", { mode: "number" }),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("metrics_daily_ad_date_idx").on(t.adId, t.date),
    index("metrics_daily_org_date_idx").on(t.orgId, t.date),
  ],
);

export const generationEvents = pgTable(
  "generation_events",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    briefId: uuid("brief_id"),
    creativeId: uuid("creative_id"),
    renderId: uuid("render_id"),
    capability: text("capability").notNull(), // text | image | video | presenter | voice | music
    provider: text("provider").notNull(), // anthropic | fal | heygen | elevenlabs ...
    model: text("model").notNull(),
    status: text("status").notNull().default("started"), // started | succeeded | failed | canceled
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    credits: integer("credits").notNull().default(0),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    units: numeric("units", { precision: 12, scale: 4 }),
    /** Idempotency key from the Inngest step. */
    operationId: text("operation_id"),
    error: text("error"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("generation_events_org_created_idx").on(t.orgId, t.createdAt),
    uniqueIndex("generation_events_operation_idx").on(t.operationId),
  ],
);
