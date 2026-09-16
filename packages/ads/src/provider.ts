import type { Ad, AdAccount, AdSet, Campaign, Creative, Metrics, OAuthTokens, ObjectStatus, Platform, ValidationIssue } from "./types";

/** Context passed on every call: which connected account, plus an idempotency key for writes. */
export interface AdsContext {
  tokens: OAuthTokens;
  accountExternalId: string;
  /** Idempotency key — the adapter must not create duplicates for the same id. */
  operationId?: string;
}

export interface AdsProvider {
  readonly platform: Platform;

  /** Build the OAuth authorization URL for the user to connect an account. */
  connect(input: { redirectUri: string; state: string }): Promise<{ authorizeUrl: string }>;
  /** Exchange the OAuth callback code for tokens. */
  exchangeCode(input: { code: string; redirectUri: string }): Promise<OAuthTokens>;
  refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens>;

  listAccounts(tokens: OAuthTokens): Promise<AdAccount[]>;

  createCampaign(ctx: AdsContext, campaign: Omit<Campaign, keyof import("./types").PlatformRef>): Promise<Campaign>;
  createAdSet(ctx: AdsContext, adSet: Omit<AdSet, keyof import("./types").PlatformRef>): Promise<AdSet>;
  uploadCreative(ctx: AdsContext, creative: Creative): Promise<Creative & { externalId: string }>;
  createAd(ctx: AdsContext, ad: Omit<Ad, keyof import("./types").PlatformRef>): Promise<Ad>;

  setStatus(ctx: AdsContext, object: { level: "campaign" | "adSet" | "ad"; externalId: string }, status: ObjectStatus): Promise<void>;

  fetchInsights(ctx: AdsContext, input: { adExternalIds: string[]; since: string; until: string }): Promise<Metrics[]>;

  /** Pre-flight policy/spec validation before any write. */
  validate(input: { creative: Creative; placements: string[] }): Promise<ValidationIssue[]>;
}
