/**
 * Normalised ad-platform model. Every adapter (Meta, TikTok, Google, Sandbox) maps its
 * native objects to these shapes; the app never sees platform payloads except via `raw`.
 */
import type { PlacementSpec } from "@adcraft/specs";

export type Platform = "meta" | "tiktok" | "google";
export type ObjectStatus = "draft" | "paused" | "active" | "archived" | "error";
/** Status a caller may ask for on a live object (drafts and errors are internal states). */
export type LiveStatus = "active" | "paused" | "archived";
export type Objective = "awareness" | "traffic" | "engagement" | "leads" | "sales";
export type Gender = "male" | "female";
export type CreativeKind = "image" | "video";

export const OBJECTIVES: ReadonlyArray<{ id: Objective; label: string; hint: string }> = [
  { id: "awareness", label: "Awareness", hint: "Reach as many people as possible" },
  { id: "traffic", label: "Traffic", hint: "Send people to a page" },
  { id: "engagement", label: "Engagement", hint: "Likes, comments, views" },
  { id: "leads", label: "Leads", hint: "Collect sign-ups" },
  { id: "sales", label: "Sales", hint: "Purchases and revenue" },
];

export function isObjective(v: unknown): v is Objective {
  return OBJECTIVES.some((o) => o.id === v);
}

/** Fields every mirrored platform object carries (PLAN.md section 4 rules). */
export interface PlatformRef {
  platform: Platform;
  externalId: string;
  raw?: Record<string, unknown>;
  lastSyncedAt?: Date;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Absent means the token does not expire (TikTok) or expiry is unknown. */
  expiresAt?: Date;
  scope?: string;
}

export interface AdAccount extends PlatformRef {
  name: string;
  currency: string;
  timezone: string;
}

export interface Targeting {
  /** ISO 3166-1 alpha-2, upper case. */
  countries: string[];
  ageMin: number;
  ageMax: number;
  /** Empty means everyone. */
  genders: Gender[];
  /** Free-text interests; adapters resolve them to platform ids best-effort. */
  interests: string[];
}

export interface Budget {
  /** Minor units (cents) in the ad account currency. */
  dailyCents: number;
  currency: string;
}

export interface Schedule {
  /** ISO timestamps; `startAt` absent means "now". */
  startAt?: string;
  endAt?: string;
}

/** A placement from @adcraft/specs, e.g. "meta.feed.1x1". */
export type Placement = PlacementSpec;

export interface Campaign extends PlatformRef {
  name: string;
  objective: Objective;
  status: ObjectStatus;
  budget?: Budget;
  schedule?: Schedule;
}

export interface AdSet extends PlatformRef {
  campaignExternalId: string;
  name: string;
  status: ObjectStatus;
  targeting: Targeting;
  placements: string[];
  budget: Budget;
  schedule?: Schedule;
}

/** Copy attached to an ad. Adapters truncate/reshape per platform limits. */
export interface AdCopy {
  headline: string;
  primaryText: string;
  description?: string;
  cta: string;
  landingUrl: string;
  displayUrl?: string;
  /** Advertiser name shown next to the ad (TikTok identity, Google business name). */
  brandName?: string;
}

/** What an adapter needs to know about a creative before upload / validation. */
export interface Creative extends AdCopy {
  kind: CreativeKind;
  variantId: string;
  placementId: string;
  width: number;
  height: number;
  fileBytes: number;
  mimeType: string;
  durationSec?: number;
  /** Set when any layer was AI-generated (scene, presenter, voice). Platforms may require a label. */
  aiGenerated?: boolean;
  /** Set when the creative depicts a realistic person that was AI-generated (Meta/TikTok labels). */
  aiRealisticPeople?: boolean;
}

export interface Ad extends PlatformRef {
  adSetExternalId: string;
  name: string;
  status: ObjectStatus;
  creative: Creative;
  /** Platform creative object id (Meta ad creative, TikTok video/image id, Google asset). */
  creativeExternalId?: string;
  review?: AdReview;
}

export type ReviewStatus = "pending" | "approved" | "disapproved" | "unknown";

export interface AdReview {
  status: ReviewStatus;
  /** Platform effective status string, e.g. Meta effective_status. */
  effectiveStatus?: string;
  reasons?: string[];
  checkedAt: Date;
}

export interface Metrics {
  adExternalId: string;
  /** YYYY-MM-DD in the account timezone. */
  date: string;
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
  code:
    | "ratio"
    | "media"
    | "file_size"
    | "duration"
    | "text_length"
    | "landing_url"
    | "ai_disclosure"
    | "missing_copy"
    | "platform"
    | "claims";
  field?: string;
  message: string;
}

// ---------- inputs to provider writes ----------

export interface CampaignInput {
  name: string;
  objective: Objective;
  status: LiveStatus;
  budget: Budget;
  schedule?: Schedule;
  /** Adapter-specific extras (Meta page id, Google logo asset, ...). Stored on the campaign's raw. */
  extra?: Record<string, unknown>;
}

export interface AdSetInput {
  campaignExternalId: string;
  name: string;
  objective: Objective;
  status: LiveStatus;
  targeting: Targeting;
  placements: string[];
  budget: Budget;
  schedule?: Schedule;
  extra?: Record<string, unknown>;
}

export interface CreativeUpload {
  creative: Creative;
  bytes: Uint8Array;
  fileName: string;
}

export interface UploadedCreative {
  /** Image hash / video id / asset resource name. */
  externalId: string;
  kind: CreativeKind;
  /** Public URL the platform reported, when any. */
  url?: string;
  raw?: Record<string, unknown>;
}

export interface AdInput {
  adSetExternalId: string;
  name: string;
  status: LiveStatus;
  creative: Creative;
  uploaded: UploadedCreative;
  objective: Objective;
  extra?: Record<string, unknown>;
}

export interface CreatedObject extends PlatformRef {
  status: ObjectStatus;
}

export interface CreatedAd extends CreatedObject {
  creativeExternalId?: string;
  review?: AdReview;
}

export interface InsightsQuery {
  accountExternalId: string;
  since: string;
  until: string;
  /** Restrict to these ads; adapters may ignore when the platform cannot filter. */
  adExternalIds?: string[];
  /** Account currency, for platforms whose reports omit it (TikTok). */
  currency?: string;
}
