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
  CampaignUpdate,
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

  /** Push name / daily budget / schedule changes to a campaign that is already on the platform. */
  updateCampaign(ctx: AdsContext, input: CampaignUpdate): Promise<void>;

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

/**
 * The platforms bury the sentence a human needs inside their error envelopes — Meta in
 * `error_user_title` / `error_user_msg`, TikTok in `message`, Google in `error.message`. Pull
 * that out so the activity log reads "Budget is too low — your ad set budget must be more than
 * ₹94.91" instead of a wall of JSON.
 */
function humanMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const meta = (b.error ?? b) as Record<string, unknown>;
  const title = typeof meta.error_user_title === "string" ? meta.error_user_title.trim() : "";
  const msg = typeof meta.error_user_msg === "string" ? meta.error_user_msg.trim() : "";
  if (title || msg) return [title, msg].filter(Boolean).join(" — ").slice(0, 300);
  const plain = typeof meta.message === "string" ? meta.message.trim() : "";
  const detail = typeof b.message === "string" && b.message.trim() !== plain ? b.message.trim() : "";
  const text = [plain, detail].filter(Boolean).join(" — ");
  return text && text.toLowerCase() !== "invalid parameter" ? text.slice(0, 300) : null;
}

function summarise(body: unknown): string {
  const human = humanMessage(body);
  if (human) return human;
  if (typeof body === "string") {
    if (/<!DOCTYPE|<html/i.test(body)) {
      const title = body.match(/<title>([^<]+)/i)?.[1]?.replace(/\s+/g, " ").trim();
      return title ? `HTML error (${title})` : "non-JSON error from the API";
    }
    return body.slice(0, 300);
  }
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body);
  }
}
