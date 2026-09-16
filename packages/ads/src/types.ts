/** Normalised ad-platform model. Every adapter maps its native objects to these. */

export type Platform = "meta" | "tiktok" | "google";
export type ObjectStatus = "draft" | "paused" | "active" | "archived" | "error";
export type Objective = "awareness" | "traffic" | "engagement" | "leads" | "sales" | "app_installs";

export interface PlatformRef {
  platform: Platform;
  externalId: string;
  raw?: Record<string, unknown>;
  lastSyncedAt?: Date;
}

export interface AdAccount extends PlatformRef {
  name: string;
  currency: string;
  timezone: string;
}

export interface Campaign extends PlatformRef {
  name: string;
  objective: Objective;
  status: ObjectStatus;
  /** Minor units (cents) in the account currency. */
  dailyBudgetMinor?: number;
  lifetimeBudgetMinor?: number;
  startAt?: Date;
  endAt?: Date;
}

export interface Targeting {
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: Array<"male" | "female" | "all">;
  interests?: string[];
  customAudienceIds?: string[];
  languages?: string[];
  /** Adapter-specific extras pass through untouched. */
  extra?: Record<string, unknown>;
}

export interface AdSet extends PlatformRef {
  campaignId: string;
  name: string;
  status: ObjectStatus;
  targeting: Targeting;
  /** Placement ids from @adcraft/specs, e.g. "meta.feed.1x1". */
  placements: string[];
  dailyBudgetMinor?: number;
  bidStrategy?: string;
  optimizationGoal?: string;
}

export type CreativeKind = "image" | "video";

export interface Creative extends Partial<PlatformRef> {
  kind: CreativeKind;
  /** Our variant id — the rendered asset. */
  variantId: string;
  /** Readable URL (R2 pre-signed) for upload. */
  assetUrl: string;
  width: number;
  height: number;
  durationSec?: number;
  headline?: string;
  primaryText?: string;
  description?: string;
  cta?: string;
  landingUrl: string;
  displayUrl?: string;
}

export interface Ad extends PlatformRef {
  adSetId: string;
  name: string;
  status: ObjectStatus;
  creative: Creative;
}

export interface Metrics {
  adExternalId: string;
  date: string; // YYYY-MM-DD
  spendMinor: number;
  currency: string;
  impressions: number;
  reach?: number;
  clicks: number;
  conversions: number;
  conversionValueMinor?: number;
  videoViews?: number;
  thruplays?: number;
  raw?: Record<string, unknown>;
}

export interface ValidationIssue {
  level: "error" | "warning";
  field?: string;
  message: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}
