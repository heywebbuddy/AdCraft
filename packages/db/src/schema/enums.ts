import { pgEnum } from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", ["owner", "editor", "viewer"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing", "active", "past_due", "canceled", "incomplete", "paused",
]);
export const creditReason = pgEnum("credit_reason", [
  "subscription_grant", "top_up", "generation", "refund", "adjustment", "expiry",
]);
export const creativeKind = pgEnum("creative_kind", ["static", "video", "ugc"]);
export const conceptStatus = pgEnum("concept_status", ["proposed", "selected", "rejected"]);
export const renderStatus = pgEnum("render_status", ["queued", "running", "succeeded", "failed"]);
export const adPlatform = pgEnum("ad_platform", ["meta", "tiktok", "google"]);
export const adAccountStatus = pgEnum("ad_account_status", ["connected", "expired", "revoked", "error"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "paused", "active", "archived", "error"]);
export const generationStatus = pgEnum("generation_status", ["started", "succeeded", "failed", "canceled"]);
export const aiCapability = pgEnum("ai_capability", ["text", "image", "video", "presenter", "voice", "music"]);
