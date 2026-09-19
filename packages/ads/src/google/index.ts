/**
 * Google Ads adapter (REST API v25, OAuth + developer token). Covers Demand Gen / YouTube.
 *
 * Endpoints used (all under https://googleads.googleapis.com/v25):
 *   GET  https://accounts.google.com/o/oauth2/v2/auth, POST https://oauth2.googleapis.com/token
 *   GET  /customers:listAccessibleCustomers, POST /customers/{cid}/googleAds:search (customer fields)
 *   POST /customers/{cid}/googleAds:mutate            — campaign budget + campaign in one atomic call
 *   POST /customers/{cid}/adGroups:mutate, /adGroupCriteria:mutate, /campaignCriteria:mutate
 *   POST /geoTargetConstants:suggest                  — country → geo target constant
 *   POST /customers/{cid}/assets:mutate               — image assets (base64)
 *   POST /customers/{cid}/adGroupAds:mutate           — Demand Gen multi-asset ad
 *   POST /customers/{cid}/campaigns|adGroups|adGroupAds:mutate (update status)
 *   POST /customers/{cid}/googleAds:searchStream      — daily metrics and policy summaries
 *
 * Headers: Authorization: Bearer <oauth>, developer-token, login-customer-id (MCC, optional).
 */
import { base64, chunk, request, truncate, type Json } from "../http";
import type { AdsContext, AdsProvider } from "../provider";
import type {
  AdAccount,
  AdInput,
  AdReview,
  AdSetInput,
  CampaignInput,
  CreatedAd,
  CreatedObject,
  CreativeUpload,
  InsightsQuery,
  LiveStatus,
  Metrics,
  OAuthTokens,
  Objective,
  Targeting,
  UploadedCreative,
  ValidationIssue,
} from "../types";
import { validateCreative } from "../validation";

export const GOOGLE_ADS_API_VERSION = "v25";
const API = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/adwords";

function env() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!clientId || !clientSecret || !developerToken) throw new Error("GOOGLE_ADS_CLIENT_ID / CLIENT_SECRET / DEVELOPER_TOKEN are not set");
  return { clientId, clientSecret, developerToken, loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "") };
}

function headers(tokens: OAuthTokens) {
  const { developerToken, loginCustomerId } = env();
  return {
    authorization: `Bearer ${tokens.accessToken}`,
    "developer-token": developerToken,
    ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
  };
}

function isError(body: unknown) {
  return typeof body === "object" && body !== null && "error" in (body as Json);
}

const STATUS: Record<LiveStatus, string> = { active: "ENABLED", paused: "PAUSED", archived: "REMOVED" };

function bidding(o: Objective) {
  return o === "leads" || o === "sales" ? { maximizeConversions: {} } : { targetSpend: {} };
}

const AGE_BANDS: Array<[string, number, number]> = [
  ["AGE_RANGE_18_24", 18, 24],
  ["AGE_RANGE_25_34", 25, 34],
  ["AGE_RANGE_35_44", 35, 44],
  ["AGE_RANGE_45_54", 45, 54],
  ["AGE_RANGE_55_64", 55, 64],
  ["AGE_RANGE_65_UP", 65, 120],
];

function ageRanges(t: Targeting) {
  const min = t.ageMin || 18;
  const max = t.ageMax || 120;
  const picked = AGE_BANDS.filter(([, lo, hi]) => hi >= min && lo <= max).map(([id]) => id);
  return picked.length ? picked : AGE_BANDS.map(([id]) => id);
}

const CTA: Array<[RegExp, string]> = [
  [/shop|buy/i, "Shop now"],
  [/order/i, "Order now"],
  [/sign ?up|join/i, "Sign up"],
  [/subscribe/i, "Subscribe"],
  [/book/i, "Book now"],
  [/download/i, "Download"],
  [/quote|offer/i, "Get quote"],
  [/contact/i, "Contact us"],
  [/apply/i, "Apply now"],
  [/start|try/i, "Start now"],
  [/visit/i, "Visit site"],
];
function ctaText(text: string | undefined) {
  for (const [re, t] of CTA) if (text && re.test(text)) return t;
  return "Learn more";
}

function gaqlDate(iso: string | undefined) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : undefined;
}

function customerPath(accountExternalId: string) {
  return `customers/${accountExternalId.replace(/-/g, "")}`;
}

function idFromResource(resourceName: string) {
  // customers/1/adGroupAds/22~333 → 333
  const tail = resourceName.split("/").pop() ?? "";
  return tail.includes("~") ? tail.split("~")[1]! : tail;
}

async function search<T = Json>(ctx: AdsContext, query: string): Promise<T[]> {
  const res = await request<Array<{ results?: T[] }>>("google", `${API}/${customerPath(ctx.accountExternalId)}/googleAds:searchStream`, {
    headers: headers(ctx.tokens),
    json: { query },
    isError,
  });
  return (Array.isArray(res) ? res : []).flatMap((b) => b.results ?? []);
}

async function geoConstants(ctx: AdsContext, countries: string[]): Promise<string[]> {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const out: string[] = [];
  for (const code of countries.length ? countries : ["US"]) {
    const name = names.of(code.toUpperCase()) ?? code;
    const res = await request<{ geoTargetConstantSuggestions?: Array<{ geoTargetConstant: { resourceName: string; targetType: string; countryCode?: string } }> }>(
      "google",
      `${API}/geoTargetConstants:suggest`,
      { headers: headers(ctx.tokens), json: { locale: "en", countryCode: code.toUpperCase(), locationNames: { names: [name] } }, isError },
    );
    const hit = res.geoTargetConstantSuggestions?.find((s) => s.geoTargetConstant.targetType === "Country") ?? res.geoTargetConstantSuggestions?.[0];
    if (hit) out.push(hit.geoTargetConstant.resourceName);
  }
  return out;
}

function reviewFrom(row: { policySummary?: { approvalStatus?: string; reviewStatus?: string; policyTopicEntries?: Array<{ topic?: string; type?: string }> }; status?: string }): AdReview {
  const approval = row.policySummary?.approvalStatus;
  const review = row.policySummary?.reviewStatus;
  const status: AdReview["status"] =
    approval === "DISAPPROVED"
      ? "disapproved"
      : review === "REVIEW_IN_PROGRESS" || review === "UNDER_APPEAL" || !approval
        ? "pending"
        : "approved";
  const reasons = row.policySummary?.policyTopicEntries?.map((e) => `${e.topic ?? "policy"} (${e.type ?? "issue"})`);
  return { status, effectiveStatus: `${approval ?? "UNKNOWN"}/${review ?? "UNKNOWN"}`, reasons: reasons?.length ? reasons : undefined, checkedAt: new Date() };
}

export class GoogleAdsProvider implements AdsProvider {
  readonly platform = "google" as const;
  readonly label = "Google Ads";
  readonly sandbox = false;

  oauth = {
    authorizeUrl: (state: string, redirectUri: string) => {
      const { clientId } = env();
      const u = new URL(AUTH_URL);
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", SCOPE);
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      u.searchParams.set("state", state);
      return u.toString();
    },
    exchangeCode: async (code: string, redirectUri: string): Promise<OAuthTokens> => {
      const { clientId, clientSecret } = env();
      const res = await request<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>("google", TOKEN_URL, {
        urlencoded: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" },
      });
      return { accessToken: res.access_token, refreshToken: res.refresh_token, expiresAt: new Date(Date.now() + res.expires_in * 1000), scope: res.scope };
    },
    refresh: async (tokens: OAuthTokens): Promise<OAuthTokens> => {
      if (!tokens.refreshToken) throw new Error("Google Ads connection has no refresh token; reconnect the account");
      const { clientId, clientSecret } = env();
      const res = await request<{ access_token: string; expires_in: number }>("google", TOKEN_URL, {
        urlencoded: { refresh_token: tokens.refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" },
      });
      return { ...tokens, accessToken: res.access_token, expiresAt: new Date(Date.now() + res.expires_in * 1000) };
    },
  };

  async listAdAccounts(tokens: OAuthTokens): Promise<AdAccount[]> {
    const list = await request<{ resourceNames?: string[] }>("google", `${API}/customers:listAccessibleCustomers`, { headers: headers(tokens), isError });
    const out: AdAccount[] = [];
    for (const rn of list.resourceNames ?? []) {
      const cid = rn.split("/")[1]!;
      try {
        const res = await request<{ results?: Array<{ customer: { id: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean } }> }>(
          "google",
          `${API}/customers/${cid}/googleAds:search`,
          { headers: headers(tokens), json: { query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer" }, isError },
        );
        const c = res.results?.[0]?.customer;
        if (!c || c.manager) continue;
        out.push({ platform: "google", externalId: c.id, name: c.descriptiveName ?? `Customer ${c.id}`, currency: c.currencyCode ?? "USD", timezone: c.timeZone ?? "UTC", raw: c as unknown as Json });
      } catch {
        /* inaccessible / cancelled customer: skip */
      }
    }
    return out;
  }

  async createCampaign(ctx: AdsContext, input: CampaignInput): Promise<CreatedObject> {
    const cp = customerPath(ctx.accountExternalId);
    const res = await request<{ mutateOperationResponses?: Array<{ campaignBudgetResult?: { resourceName: string }; campaignResult?: { resourceName: string } }> }>(
      "google",
      `${API}/${cp}/googleAds:mutate`,
      {
        headers: headers(ctx.tokens),
        json: {
          mutateOperations: [
            {
              campaignBudgetOperation: {
                create: { resourceName: `${cp}/campaignBudgets/-1`, name: `${input.name} · budget`, amountMicros: String(input.budget.dailyCents * 10_000), deliveryMethod: "STANDARD", explicitlyShared: false },
              },
            },
            {
              campaignOperation: {
                create: {
                  name: input.name,
                  status: STATUS[input.status],
                  advertisingChannelType: "DEMAND_GEN",
                  campaignBudget: `${cp}/campaignBudgets/-1`,
                  ...bidding(input.objective),
                  ...(gaqlDate(input.schedule?.startAt) ? { startDate: gaqlDate(input.schedule?.startAt) } : {}),
                  ...(gaqlDate(input.schedule?.endAt) ? { endDate: gaqlDate(input.schedule?.endAt) } : {}),
                },
              },
            },
          ],
          partialFailure: false,
        },
        isError,
      },
    );
    const campaign = res.mutateOperationResponses?.find((r) => r.campaignResult)?.campaignResult?.resourceName;
    const budget = res.mutateOperationResponses?.find((r) => r.campaignBudgetResult)?.campaignBudgetResult?.resourceName;
    if (!campaign) throw new Error("Google Ads mutate returned no campaign resource");
    return { platform: "google", externalId: campaign, status: input.status, raw: { resourceName: campaign, budget, operationId: ctx.operationId } };
  }

  async createAdSet(ctx: AdsContext, input: AdSetInput): Promise<CreatedObject> {
    const cp = customerPath(ctx.accountExternalId);
    const ag = await request<{ results?: Array<{ resourceName: string }> }>("google", `${API}/${cp}/adGroups:mutate`, {
      headers: headers(ctx.tokens),
      json: { operations: [{ create: { name: input.name, campaign: input.campaignExternalId, status: STATUS[input.status] } }] },
      isError,
    });
    const adGroup = ag.results?.[0]?.resourceName;
    if (!adGroup) throw new Error("Google Ads adGroups:mutate returned no resource");

    // Demographics on the ad group.
    const criteria: Json[] = ageRanges(input.targeting).map((type) => ({ create: { adGroup, ageRange: { type } } }));
    if (input.targeting.genders.length === 1) criteria.push({ create: { adGroup, gender: { type: input.targeting.genders[0]!.toUpperCase() } } });
    await request("google", `${API}/${cp}/adGroupCriteria:mutate`, { headers: headers(ctx.tokens), json: { operations: criteria, partialFailure: true }, isError });

    // Locations on the campaign.
    const geos = await geoConstants(ctx, input.targeting.countries);
    if (geos.length) {
      await request("google", `${API}/${cp}/campaignCriteria:mutate`, {
        headers: headers(ctx.tokens),
        json: { operations: geos.map((g) => ({ create: { campaign: input.campaignExternalId, location: { geoTargetConstant: g } } })), partialFailure: true },
        isError,
      });
    }
    // TODO(google): interests → Demand Gen audience (Audience resource with affinity/in-market segments). Recorded in raw only.
    return { platform: "google", externalId: adGroup, status: input.status, raw: { resourceName: adGroup, geos, interests: input.targeting.interests, operationId: ctx.operationId } };
  }

  async uploadCreative(ctx: AdsContext, input: CreativeUpload): Promise<UploadedCreative> {
    if (input.creative.kind === "video") {
      // Demand Gen video ads reference YouTube videos; the Ads API cannot ingest video bytes.
      // TODO(google): upload via the YouTube Data API and pass the video id as a YOUTUBE_VIDEO asset.
      throw new Error("Google Ads video creative must be hosted on YouTube; upload the video to the brand's channel first.");
    }
    const cp = customerPath(ctx.accountExternalId);
    const res = await request<{ results?: Array<{ resourceName: string }> }>("google", `${API}/${cp}/assets:mutate`, {
      headers: headers(ctx.tokens),
      json: { operations: [{ create: { name: input.fileName, type: "IMAGE", imageAsset: { data: base64(input.bytes) } } }] },
      isError,
    });
    const rn = res.results?.[0]?.resourceName;
    if (!rn) throw new Error("Google Ads assets:mutate returned no resource");
    return { externalId: rn, kind: "image", raw: { resourceName: rn } };
  }

  async createAd(ctx: AdsContext, input: AdInput): Promise<CreatedAd> {
    const cp = customerPath(ctx.accountExternalId);
    const c = input.creative;
    const ratio = c.width / c.height;
    const slot = Math.abs(ratio - 1) < 0.03 ? "squareMarketingImages" : ratio > 1.5 ? "marketingImages" : "portraitMarketingImages";
    const logo = (input.extra?.logoAsset as string | undefined) ?? (slot === "squareMarketingImages" ? input.uploaded.externalId : undefined);
    if (!logo) throw new Error("Google Demand Gen ads need a square logo asset; add a logo to the brand kit or include a 1:1 creative.");
    const ad: Json = {
      name: input.name,
      finalUrls: [c.landingUrl],
      demandGenMultiAssetAd: {
        [slot]: [{ asset: input.uploaded.externalId }],
        logoImages: [{ asset: logo }],
        headlines: [{ text: truncate(c.headline || c.brandName || "Learn more", 40) }],
        descriptions: [{ text: truncate(c.description || c.primaryText || c.headline, 90) }],
        businessName: truncate(c.brandName ?? "Adcraft", 25),
        callToActionText: ctaText(c.cta),
        leadFormOnly: false,
      },
    };
    const res = await request<{ results?: Array<{ resourceName: string }> }>("google", `${API}/${cp}/adGroupAds:mutate`, {
      headers: headers(ctx.tokens),
      json: { operations: [{ create: { adGroup: input.adSetExternalId, status: STATUS[input.status], ad } }] },
      isError,
    });
    const rn = res.results?.[0]?.resourceName;
    if (!rn) throw new Error("Google Ads adGroupAds:mutate returned no resource");
    const reviews = await this.fetchAdReviews(ctx, [rn]).catch(() => ({}) as Record<string, AdReview>);
    return { platform: "google", externalId: rn, status: input.status, creativeExternalId: input.uploaded.externalId, review: reviews[rn], raw: { resourceName: rn, slot, logo, operationId: ctx.operationId } };
  }

  async setStatus(ctx: AdsContext, target: { level: "campaign" | "adSet" | "ad"; externalId: string }, status: LiveStatus) {
    const cp = customerPath(ctx.accountExternalId);
    const path = target.level === "campaign" ? "campaigns" : target.level === "adSet" ? "adGroups" : "adGroupAds";
    await request("google", `${API}/${cp}/${path}:mutate`, {
      headers: headers(ctx.tokens),
      json: { operations: [{ update: { resourceName: target.externalId, status: STATUS[status] }, updateMask: "status" }] },
      isError,
    });
  }

  async fetchAdReviews(ctx: AdsContext, adExternalIds: string[]): Promise<Record<string, AdReview>> {
    const out: Record<string, AdReview> = {};
    for (const ids of chunk(adExternalIds, 200)) {
      const rows = await search<{ adGroupAd: { resourceName: string; status?: string; policySummary?: Json } }>(
        ctx,
        `SELECT ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE ad_group_ad.ad.id IN (${ids.map(idFromResource).join(",")})`,
      );
      for (const r of rows) out[r.adGroupAd.resourceName] = reviewFrom(r.adGroupAd as never);
    }
    return out;
  }

  async fetchInsights(ctx: AdsContext, query: InsightsQuery): Promise<Metrics[]> {
    const where = [`segments.date BETWEEN '${query.since}' AND '${query.until}'`];
    if (query.adExternalIds?.length) where.push(`ad_group_ad.ad.id IN (${query.adExternalIds.map(idFromResource).join(",")})`);
    const rows = await search<{
      adGroupAd: { resourceName: string };
      segments: { date: string };
      metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number; conversionsValue?: number; videoViews?: string };
      customer?: { currencyCode?: string };
    }>(
      ctx,
      `SELECT ad_group_ad.resource_name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.video_views, customer.currency_code FROM ad_group_ad WHERE ${where.join(" AND ")}`,
    );
    return rows.map((r) => ({
      adExternalId: r.adGroupAd.resourceName,
      date: r.segments.date,
      spendMinor: Math.round(Number(r.metrics.costMicros ?? 0) / 10_000),
      currency: r.customer?.currencyCode ?? query.currency ?? "USD",
      impressions: Number(r.metrics.impressions ?? 0),
      clicks: Number(r.metrics.clicks ?? 0),
      conversions: Math.round(Number(r.metrics.conversions ?? 0)),
      conversionValueMinor: Math.round(Number(r.metrics.conversionsValue ?? 0) * 100),
      videoViews: Number(r.metrics.videoViews ?? 0),
      raw: r as unknown as Json,
    }));
  }

  validate(input: Parameters<AdsProvider["validate"]>[0]): ValidationIssue[] {
    const issues = validateCreative("google", input.creative, input.placement);
    if (input.creative.kind === "video") {
      issues.push({ level: "error", code: "platform", message: "Google video ads must be hosted on YouTube; direct upload is not supported yet." });
    }
    return issues;
  }
}

export const googleProvider: AdsProvider = new GoogleAdsProvider();
