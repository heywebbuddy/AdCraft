import type {
  AdAccount,
  AdInput,
  AdReview,
  AdSetInput,
  CampaignInput,
  CreatedAd,
  CreatedObject,
  Creative,
  CreativeUpload,
  InsightsQuery,
  LiveStatus,
  Metrics,
  OAuthTokens,
  Placement,
  Platform,
  UploadedCreative,
  ValidationIssue,
} from "./types";

/** Context passed on every call: which connected account, plus an idempotency key for writes. */
export interface AdsContext {
  tokens: OAuthTokens;
  accountExternalId: string;
  /**
   * Idempotency key. The pipeline stores platform ids after each create and never calls
   * a create twice for the same operationId; adapters that support native idempotency
   * (Google request ids, TikTok signatures) also pass it through.
   */
  operationId: string;
}

export interface AdsOAuth {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refresh(tokens: OAuthTokens): Promise<OAuthTokens>;
}

export interface AdsProvider {
  readonly platform: Platform;
  /** Human label, e.g. "Meta" or "Sandbox Meta". */
  readonly label: string;
  /** True when this provider simulates the platform because its env is missing. */
  readonly sandbox: boolean;

  oauth: AdsOAuth;

  listAdAccounts(tokens: OAuthTokens): Promise<AdAccount[]>;

  createCampaign(ctx: AdsContext, input: CampaignInput): Promise<CreatedObject>;
  createAdSet(ctx: AdsContext, input: AdSetInput): Promise<CreatedObject>;
  uploadCreative(ctx: AdsContext, input: CreativeUpload): Promise<UploadedCreative>;
  createAd(ctx: AdsContext, input: AdInput): Promise<CreatedAd>;

  setStatus(ctx: AdsContext, target: { level: "campaign" | "adSet" | "ad"; externalId: string }, status: LiveStatus): Promise<void>;

  /** Daily rows, one per (ad, date). */
  fetchInsights(ctx: AdsContext, query: InsightsQuery): Promise<Metrics[]>;

  /** Review / delivery state for ads we created. Keyed by ad external id. */
  fetchAdReviews(ctx: AdsContext, adExternalIds: string[]): Promise<Record<string, AdReview>>;

  /** Pre-flight policy/spec validation before any write. Pure and synchronous. */
  validate(input: { creative: Creative; placement: Placement }): ValidationIssue[];
}

export class AdsApiError extends Error {
  constructor(
    public readonly platform: Platform,
    public readonly endpoint: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`${platform} ${endpoint} → ${status}: ${summarise(body)}`);
    this.name = "AdsApiError";
  }
}

function summarise(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 300);
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body);
  }
}
