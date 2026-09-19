/**
 * TikTok Marketing API adapter (Business API v1.3).
 *
 * Endpoints used (all under https://business-api.tiktok.com/open_api/v1.3):
 *   GET  https://business-api.tiktok.com/portal/auth      — consent (returns auth_code)
 *   POST /oauth2/access_token/                             — auth_code → long-lived token (no refresh)
 *   GET  /oauth2/advertiser/get/, GET /advertiser/info/    — advertiser accounts
 *   GET  /tool/region/, GET /tool/interest_category/       — resolve countries / interests
 *   POST /campaign/create/, POST /adgroup/create/, POST /ad/create/
 *   POST /file/image/ad/upload/, POST /file/video/ad/upload/, GET /file/video/suggest_cover/
 *   GET  /identity/get/, POST /identity/create/            — advertiser identity shown on the ad
 *   POST /campaign|adgroup|ad/status/update/               — pause / resume / delete
 *   GET  /report/integrated/get/ (AUCTION_AD, stat_time_day) — daily metrics
 *   GET  /ad/get/ (secondary_status)                       — review outcomes
 */
import { chunk, fileToBlob, md5Hex, request, truncate, type Json } from "../http";
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
  CampaignUpdate,
} from "../types";
import { validateCreative } from "../validation";

export const TIKTOK_API_VERSION = "v1.3";
const API = `https://business-api.tiktok.com/open_api/${TIKTOK_API_VERSION}`;
const PORTAL_AUTH = "https://business-api.tiktok.com/portal/auth";

type Envelope<T> = { code: number; message: string; request_id?: string; data: T };

function isError(body: unknown) {
  return typeof body === "object" && body !== null && (body as Envelope<unknown>).code !== 0;
}

function env() {
  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !secret) throw new Error("TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set");
  return { appId, secret };
}

function auth(tokens: OAuthTokens) {
  return { "Access-Token": tokens.accessToken };
}

const STATUS: Record<LiveStatus, string> = { active: "ENABLE", paused: "DISABLE", archived: "DELETE" };

function objectiveType(o: Objective, extra?: Record<string, unknown>) {
  switch (o) {
    case "awareness":
      return "REACH";
    case "engagement":
      return "VIDEO_VIEWS";
    case "leads":
      return extra?.pixelId ? "WEB_CONVERSIONS" : "TRAFFIC";
    case "sales":
      return extra?.pixelId ? "WEB_CONVERSIONS" : "TRAFFIC";
    case "traffic":
    default:
      return "TRAFFIC";
  }
}

function optimisation(o: Objective, extra?: Record<string, unknown>) {
  switch (o) {
    case "awareness":
      return { optimization_goal: "REACH", billing_event: "CPM" };
    case "engagement":
      return { optimization_goal: "VIDEO_VIEW", billing_event: "CPV" };
    case "leads":
    case "sales":
      return extra?.pixelId
        ? { optimization_goal: "CONVERT", billing_event: "OCPM", pixel_id: extra.pixelId, optimization_event: o === "sales" ? "SHOPPING" : "FORM" }
        : { optimization_goal: "CLICK", billing_event: "CPC" };
    case "traffic":
    default:
      return { optimization_goal: "CLICK", billing_event: "CPC" };
  }
}

function ageGroups(t: Targeting) {
  const bands: Array<[string, number, number]> = [
    ["AGE_13_17", 13, 17],
    ["AGE_18_24", 18, 24],
    ["AGE_25_34", 25, 34],
    ["AGE_35_44", 35, 44],
    ["AGE_45_54", 45, 54],
    ["AGE_55_100", 55, 100],
  ];
  const min = t.ageMin || 18;
  const max = t.ageMax || 100;
  const picked = bands.filter(([, lo, hi]) => hi >= min && lo <= max).map(([id]) => id);
  return picked.length ? picked : ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"];
}

function gender(t: Targeting) {
  if (t.genders.length === 1) return t.genders[0] === "male" ? "GENDER_MALE" : "GENDER_FEMALE";
  return "GENDER_UNLIMITED";
}

const CTA: Array<[RegExp, string]> = [
  [/shop|buy|order/i, "SHOP_NOW"],
  [/sign ?up|join|subscribe/i, "SIGN_UP"],
  [/book/i, "BOOK_NOW"],
  [/download/i, "DOWNLOAD_NOW"],
  [/offer|deal|save/i, "GET_QUOTE"],
  [/contact/i, "CONTACT_US"],
  [/watch/i, "WATCH_NOW"],
  [/apply/i, "APPLY_NOW"],
];
function ctaType(text: string | undefined) {
  for (const [re, type] of CTA) if (text && re.test(text)) return type;
  return "LEARN_MORE";
}

function tiktokTime(iso: string | undefined) {
  if (!iso) return undefined;
  return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
}

async function locationIds(ctx: AdsContext, countries: string[], objective: string): Promise<string[]> {
  const res = await request<Envelope<{ region_info: Array<{ location_id: string; region_code?: string; level?: string; name: string }> }>>(
    "tiktok",
    `${API}/tool/region/`,
    { headers: auth(ctx.tokens), query: { advertiser_id: ctx.accountExternalId, placements: JSON.stringify(["PLACEMENT_TIKTOK"]), objective_type: objective }, isError },
  );
  const want = new Set((countries.length ? countries : ["US"]).map((c) => c.toUpperCase()));
  const ids = (res.data.region_info ?? [])
    .filter((r) => (r.level ?? "COUNTRY") === "COUNTRY" && r.region_code && want.has(r.region_code.toUpperCase()))
    .map((r) => r.location_id);
  if (!ids.length) throw new Error(`TikTok has no deliverable region for ${[...want].join(", ")}`);
  return ids;
}

async function interestIds(ctx: AdsContext, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  try {
    const res = await request<Envelope<{ interest_categories: Array<{ interest_category_id: string; interest_category_name: string; sub_categories?: unknown[] }> }>>(
      "tiktok",
      `${API}/tool/interest_category/`,
      { headers: auth(ctx.tokens), query: { advertiser_id: ctx.accountExternalId, version: 2 }, isError },
    );
    const flat: Array<{ id: string; name: string }> = [];
    const walk = (list: unknown[]) => {
      for (const item of list as Array<{ interest_category_id: string; interest_category_name: string; sub_categories?: unknown[] }>) {
        flat.push({ id: item.interest_category_id, name: item.interest_category_name });
        if (item.sub_categories) walk(item.sub_categories);
      }
    };
    walk(res.data.interest_categories ?? []);
    const out = new Set<string>();
    for (const n of names) {
      const hit = flat.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? flat.find((f) => f.name.toLowerCase().includes(n.toLowerCase()));
      if (hit) out.add(hit.id);
    }
    return [...out];
  } catch {
    return [];
  }
}

async function ensureIdentity(ctx: AdsContext, displayName: string, imageId?: string): Promise<string> {
  const existing = await request<Envelope<{ identity_list: Array<{ identity_id: string; display_name: string }> }>>("tiktok", `${API}/identity/get/`, {
    headers: auth(ctx.tokens),
    query: { advertiser_id: ctx.accountExternalId, identity_type: "CUSTOMIZED_USER" },
    isError,
  });
  const match = existing.data.identity_list?.find((i) => i.display_name === displayName) ?? existing.data.identity_list?.[0];
  if (match) return match.identity_id;
  const created = await request<Envelope<{ identity_id: string }>>("tiktok", `${API}/identity/create/`, {
    headers: auth(ctx.tokens),
    json: { advertiser_id: ctx.accountExternalId, display_name: truncate(displayName, 30), ...(imageId ? { image_uri: imageId } : {}) },
    isError,
  });
  return created.data.identity_id;
}

function reviewFrom(secondary: string | undefined, opStatus: string | undefined): AdReview {
  const s = secondary ?? "";
  const status: AdReview["status"] = s.includes("REJECT")
    ? "disapproved"
    : s.includes("AUDIT") || s.includes("REVIEW")
      ? "pending"
      : s
        ? "approved"
        : "unknown";
  return { status, effectiveStatus: secondary ?? opStatus, reasons: s.includes("REJECT") ? [s] : undefined, checkedAt: new Date() };
}

export class TikTokAdsProvider implements AdsProvider {
  readonly platform = "tiktok" as const;
  readonly label = "TikTok";
  readonly sandbox = false;

  oauth = {
    authorizeUrl: (state: string, redirectUri: string) => {
      const { appId } = env();
      const u = new URL(PORTAL_AUTH);
      u.searchParams.set("app_id", appId);
      u.searchParams.set("state", state);
      u.searchParams.set("redirect_uri", redirectUri);
      return u.toString();
    },
    exchangeCode: async (code: string): Promise<OAuthTokens> => {
      const { appId, secret } = env();
      const res = await request<Envelope<{ access_token: string; advertiser_ids: string[]; scope: number[] }>>("tiktok", `${API}/oauth2/access_token/`, {
        json: { app_id: appId, secret, auth_code: code },
        isError,
      });
      // TikTok access tokens are long-lived and do not expire; there is no refresh grant.
      return { accessToken: res.data.access_token, scope: JSON.stringify(res.data.scope ?? []) };
    },
    refresh: async (tokens: OAuthTokens) => tokens,
  };

  async listAdAccounts(tokens: OAuthTokens): Promise<AdAccount[]> {
    const { appId, secret } = env();
    const list = await request<Envelope<{ list: Array<{ advertiser_id: string; advertiser_name: string }> }>>("tiktok", `${API}/oauth2/advertiser/get/`, {
      headers: auth(tokens),
      query: { app_id: appId, secret },
      isError,
    });
    const ids = (list.data.list ?? []).map((a) => a.advertiser_id);
    if (!ids.length) return [];
    const info = await request<Envelope<{ list: Array<{ advertiser_id: string; name: string; currency: string; timezone: string; status: string }> }>>(
      "tiktok",
      `${API}/advertiser/info/`,
      { headers: auth(tokens), query: { advertiser_ids: JSON.stringify(ids.slice(0, 100)), fields: JSON.stringify(["advertiser_id", "name", "currency", "timezone", "status"]) }, isError },
    );
    return (info.data.list ?? []).map((a) => ({
      platform: "tiktok" as const,
      externalId: a.advertiser_id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone,
      raw: a as unknown as Json,
    }));
  }

  async createCampaign(ctx: AdsContext, input: CampaignInput): Promise<CreatedObject> {
    const res = await request<Envelope<{ campaign_id: string }>>("tiktok", `${API}/campaign/create/`, {
      headers: auth(ctx.tokens),
      json: {
        advertiser_id: ctx.accountExternalId,
        campaign_name: input.name,
        objective_type: objectiveType(input.objective, input.extra),
        budget_mode: "BUDGET_MODE_INFINITE",
        operation_status: STATUS[input.status],
      },
      isError,
    });
    return { platform: "tiktok", externalId: res.data.campaign_id, status: input.status, raw: { ...res.data, operationId: ctx.operationId } };
  }

  async createAdSet(ctx: AdsContext, input: AdSetInput): Promise<CreatedObject> {
    const objective = objectiveType(input.objective, input.extra);
    const [locations, interests] = await Promise.all([locationIds(ctx, input.targeting.countries, objective), interestIds(ctx, input.targeting.interests)]);
    const start = tiktokTime(input.schedule?.startAt) ?? tiktokTime(new Date(Date.now() + 10 * 60_000).toISOString());
    const end = tiktokTime(input.schedule?.endAt);
    const body: Json = {
      advertiser_id: ctx.accountExternalId,
      campaign_id: input.campaignExternalId,
      adgroup_name: input.name,
      promotion_type: "WEBSITE",
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: locations,
      age_groups: ageGroups(input.targeting),
      gender: gender(input.targeting),
      ...(interests.length ? { interest_category_ids: interests } : {}),
      budget_mode: "BUDGET_MODE_DAY",
      budget: Math.max(20, input.budget.dailyCents / 100),
      schedule_type: end ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
      schedule_start_time: start,
      ...(end ? { schedule_end_time: end } : {}),
      ...optimisation(input.objective, input.extra),
      bid_type: "BID_TYPE_NO_BID",
      pacing: "PACING_MODE_SMOOTH",
      operation_status: STATUS[input.status],
    };
    const res = await request<Envelope<{ adgroup_id: string }>>("tiktok", `${API}/adgroup/create/`, { headers: auth(ctx.tokens), json: body, isError });
    return { platform: "tiktok", externalId: res.data.adgroup_id, status: input.status, raw: { ...res.data, request: body, operationId: ctx.operationId } };
  }

  async uploadCreative(ctx: AdsContext, input: CreativeUpload): Promise<UploadedCreative> {
    const form = new FormData();
    form.set("advertiser_id", ctx.accountExternalId);
    form.set("upload_type", "UPLOAD_BY_FILE");
    if (input.creative.kind === "video") {
      form.set("video_file", fileToBlob(input.bytes, input.creative.mimeType), input.fileName);
      form.set("video_signature", md5Hex(input.bytes));
      form.set("file_name", input.fileName);
      const res = await request<Envelope<Array<{ video_id: string; video_cover_url?: string }>>>("tiktok", `${API}/file/video/ad/upload/`, {
        headers: auth(ctx.tokens),
        form,
        isError,
      });
      const v = res.data?.[0];
      if (!v) throw new Error("TikTok video upload returned no video_id");
      return { externalId: v.video_id, kind: "video", url: v.video_cover_url, raw: v as unknown as Json };
    }
    form.set("image_file", fileToBlob(input.bytes, input.creative.mimeType), input.fileName);
    form.set("image_signature", md5Hex(input.bytes));
    form.set("file_name", input.fileName);
    const res = await request<Envelope<{ image_id: string; image_url?: string }>>("tiktok", `${API}/file/image/ad/upload/`, { headers: auth(ctx.tokens), form, isError });
    return { externalId: res.data.image_id, kind: "image", url: res.data.image_url, raw: res.data as unknown as Json };
  }

  async createAd(ctx: AdsContext, input: AdInput): Promise<CreatedAd> {
    const c = input.creative;
    const identityId = (input.extra?.identityId as string | undefined) ?? (await ensureIdentity(ctx, c.brandName ?? "Adcraft", input.uploaded.kind === "image" ? input.uploaded.externalId : undefined));
    let creative: Json;
    if (input.uploaded.kind === "video") {
      // A cover image is mandatory for SINGLE_VIDEO; let TikTok suggest one from the video.
      const covers = await request<Envelope<{ list: Array<{ id: string; url: string }> }>>("tiktok", `${API}/file/video/suggest_cover/`, {
        headers: auth(ctx.tokens),
        query: { advertiser_id: ctx.accountExternalId, video_id: input.uploaded.externalId, poster_number: 1 },
        isError,
      });
      const cover = covers.data.list?.[0]?.id;
      creative = { ad_format: "SINGLE_VIDEO", video_id: input.uploaded.externalId, ...(cover ? { image_ids: [cover] } : {}) };
    } else {
      creative = { ad_format: "SINGLE_IMAGE", image_ids: [input.uploaded.externalId] };
    }
    const body = {
      advertiser_id: ctx.accountExternalId,
      adgroup_id: input.adSetExternalId,
      creatives: [
        {
          ad_name: input.name,
          identity_type: "CUSTOMIZED_USER",
          identity_id: identityId,
          ...creative,
          ad_text: truncate(c.primaryText || c.headline, 100),
          call_to_action: ctaType(c.cta),
          landing_page_url: c.landingUrl,
          display_name: truncate(c.brandName ?? "Adcraft", 30),
          // TODO(tiktok): AI-generated content label — TikTok requires disclosure for realistic AI people
          // (validate() warns); the API field is not exposed in v1.3 ad/create, so set it in Ads Manager.
        },
      ],
    };
    const res = await request<Envelope<{ ad_ids: string[] }>>("tiktok", `${API}/ad/create/`, { headers: auth(ctx.tokens), json: body, isError });
    const adId = res.data.ad_ids?.[0];
    if (!adId) throw new Error("TikTok ad/create returned no ad id");
    if (input.status === "paused") await this.setStatus(ctx, { level: "ad", externalId: adId }, "paused");
    const reviews = await this.fetchAdReviews(ctx, [adId]).catch(() => ({}) as Record<string, AdReview>);
    return {
      platform: "tiktok",
      externalId: adId,
      status: input.status,
      creativeExternalId: input.uploaded.externalId,
      review: reviews[adId],
      raw: { ad_id: adId, identityId, operationId: ctx.operationId },
    };
  }

  async setStatus(ctx: AdsContext, target: { level: "campaign" | "adSet" | "ad"; externalId: string }, status: LiveStatus) {
    const path = target.level === "campaign" ? "campaign" : target.level === "adSet" ? "adgroup" : "ad";
    const key = target.level === "campaign" ? "campaign_ids" : target.level === "adSet" ? "adgroup_ids" : "ad_ids";
    await request("tiktok", `${API}/${path}/status/update/`, {
      headers: auth(ctx.tokens),
      json: { advertiser_id: ctx.accountExternalId, [key]: [target.externalId], operation_status: STATUS[status] },
      isError,
    });
  }

  async updateCampaign(ctx: AdsContext, input: CampaignUpdate) {
    if (input.name) {
      await request("tiktok", `${API}/campaign/update/`, { headers: auth(ctx.tokens), json: { advertiser_id: ctx.accountExternalId, campaign_id: input.campaignExternalId, campaign_name: input.name }, isError });
    }
    const set: Record<string, unknown> = {};
    if (input.budget) {
      set.budget_mode = "BUDGET_MODE_DAY";
      set.budget = Math.max(20, input.budget.dailyCents / 100);
    }
    if (input.schedule?.startAt) set.schedule_start_time = tiktokTime(input.schedule.startAt);
    if (input.schedule?.endAt) {
      set.schedule_type = "SCHEDULE_START_END";
      set.schedule_end_time = tiktokTime(input.schedule.endAt);
    } else if (input.schedule && "endAt" in input.schedule) set.schedule_type = "SCHEDULE_FROM_NOW";
    if (input.name) set.adgroup_name = input.name;
    if (!Object.keys(set).length) return;
    for (const s of input.adSets) {
      await request("tiktok", `${API}/adgroup/update/`, { headers: auth(ctx.tokens), json: { advertiser_id: ctx.accountExternalId, adgroup_id: s.externalId, ...set }, isError });
    }
  }

  async fetchAdReviews(ctx: AdsContext, adExternalIds: string[]): Promise<Record<string, AdReview>> {
    const out: Record<string, AdReview> = {};
    for (const ids of chunk(adExternalIds, 100)) {
      const res = await request<Envelope<{ list: Array<{ ad_id: string; secondary_status?: string; operation_status?: string }> }>>("tiktok", `${API}/ad/get/`, {
        headers: auth(ctx.tokens),
        query: {
          advertiser_id: ctx.accountExternalId,
          filtering: JSON.stringify({ ad_ids: ids }),
          fields: JSON.stringify(["ad_id", "secondary_status", "operation_status"]),
          page_size: 100,
        },
        isError,
      });
      for (const r of res.data.list ?? []) out[r.ad_id] = reviewFrom(r.secondary_status, r.operation_status);
    }
    return out;
  }

  async fetchInsights(ctx: AdsContext, query: InsightsQuery): Promise<Metrics[]> {
    const rows: Metrics[] = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const res = await request<Envelope<{ list: Array<{ dimensions: { ad_id: string; stat_time_day: string }; metrics: Record<string, string> }>; page_info?: { total_page?: number } }>>(
        "tiktok",
        `${API}/report/integrated/get/`,
        {
          headers: auth(ctx.tokens),
          query: {
            advertiser_id: ctx.accountExternalId,
            report_type: "BASIC",
            data_level: "AUCTION_AD",
            dimensions: JSON.stringify(["ad_id", "stat_time_day"]),
            metrics: JSON.stringify(["spend", "impressions", "reach", "clicks", "conversion", "video_play_actions", "video_watched_6s"]),
            start_date: query.since,
            end_date: query.until,
            page,
            page_size: 1000,
            ...(query.adExternalIds?.length ? { filtering: JSON.stringify([{ field_name: "ad_ids", filter_type: "IN", filter_value: JSON.stringify(query.adExternalIds) }]) } : {}),
          },
          isError,
        },
      );
      for (const r of res.data.list ?? []) {
        const m = r.metrics;
        rows.push({
          adExternalId: r.dimensions.ad_id,
          date: r.dimensions.stat_time_day.slice(0, 10),
          spendMinor: Math.round(Number(m.spend ?? 0) * 100),
          currency: query.currency ?? "USD",
          impressions: Number(m.impressions ?? 0),
          reach: Number(m.reach ?? 0),
          clicks: Number(m.clicks ?? 0),
          conversions: Number(m.conversion ?? 0),
          // TODO(tiktok): conversion value needs a pixel event metric (e.g. total_complete_payment_rate); not requested yet.
          videoViews: Number(m.video_play_actions ?? 0),
          thruplays: Number(m.video_watched_6s ?? 0),
          raw: { ...m },
        });
      }
      totalPages = res.data.page_info?.total_page ?? 1;
      page += 1;
    }
    return rows;
  }

  validate(input: Parameters<AdsProvider["validate"]>[0]): ValidationIssue[] {
    const issues = validateCreative("tiktok", input.creative, input.placement);
    if (input.creative.kind === "video" && (input.creative.durationSec ?? 5) < 5) {
      issues.push({ level: "error", code: "duration", message: "TikTok videos must be at least 5 seconds." });
    }
    return issues;
  }
}

export const tiktokProvider: AdsProvider = new TikTokAdsProvider();
