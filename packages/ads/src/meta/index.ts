/**
 * Meta Marketing API adapter (Graph API v21.0). Covers Facebook + Instagram.
 *
 * Endpoints used (all under https://graph.facebook.com/v21.0):
 *   GET  https://www.facebook.com/v21.0/dialog/oauth           — consent
 *   GET  /oauth/access_token                                    — code → short-lived token, then fb_exchange_token → 60-day token
 *   GET  /me/adaccounts                                          — ad accounts
 *   GET  /search?type=adinterest                                 — resolve interest names to ids
 *   POST /act_<id>/campaigns, /act_<id>/adsets, /act_<id>/adimages, /act_<id>/advideos,
 *        /act_<id>/adcreatives, /act_<id>/ads
 *   POST /<object_id> {status}                                   — pause / resume / archive
 *   GET  /act_<id>/insights?level=ad&time_increment=1            — daily metrics
 *   GET  /?ids=<ad ids>&fields=effective_status,ad_review_feedback — review outcomes
 */
import { base64, chunk, fileToBlob, request, truncate, type Json } from "../http";
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
  Gender,
  InsightsQuery,
  LiveStatus,
  Metrics,
  OAuthTokens,
  Objective,
  UploadedCreative,
  ValidationIssue,
} from "../types";
import { validateCreative } from "../validation";

export const META_API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
const DIALOG = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;
const SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"];

const OBJECTIVE: Record<Objective, string> = {
  awareness: "OUTCOME_AWARENESS",
  traffic: "OUTCOME_TRAFFIC",
  engagement: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
  sales: "OUTCOME_SALES",
};

const STATUS: Record<LiveStatus, string> = { active: "ACTIVE", paused: "PAUSED", archived: "ARCHIVED" };
const GENDER: Record<Gender, number> = { male: 1, female: 2 };

const CTA: Array<[RegExp, string]> = [
  [/shop|buy|order/i, "SHOP_NOW"],
  [/sign ?up|join|subscribe/i, "SIGN_UP"],
  [/book/i, "BOOK_NOW"],
  [/download|get the app/i, "DOWNLOAD"],
  [/offer|deal|save/i, "GET_OFFER"],
  [/contact|talk/i, "CONTACT_US"],
  [/watch/i, "WATCH_MORE"],
  [/apply/i, "APPLY_NOW"],
  [/try|start|free/i, "LEARN_MORE"],
];

function ctaType(text: string | undefined) {
  for (const [re, type] of CTA) if (text && re.test(text)) return type;
  return "LEARN_MORE";
}

function isError(body: unknown) {
  return typeof body === "object" && body !== null && "error" in (body as Json);
}

function env() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID / META_APP_SECRET are not set");
  return { appId, appSecret };
}

function auth(tokens: OAuthTokens) {
  return { authorization: `Bearer ${tokens.accessToken}` };
}

function actId(accountExternalId: string) {
  return accountExternalId.startsWith("act_") ? accountExternalId : `act_${accountExternalId}`;
}

function placementSpec(placements: string[]) {
  const feed = placements.some((p) => p.startsWith("meta.feed"));
  const stories = placements.some((p) => p.startsWith("meta.stories"));
  const facebook: string[] = [];
  const instagram: string[] = [];
  if (feed) {
    facebook.push("feed");
    instagram.push("stream");
  }
  if (stories) {
    facebook.push("story", "facebook_reels");
    instagram.push("story", "reels");
  }
  if (!feed && !stories) {
    facebook.push("feed");
    instagram.push("stream");
  }
  return { publisher_platforms: ["facebook", "instagram"], facebook_positions: facebook, instagram_positions: instagram };
}

function optimisation(objective: Objective, extra?: Record<string, unknown>) {
  switch (objective) {
    case "awareness":
      return { optimization_goal: "REACH", billing_event: "IMPRESSIONS" };
    case "engagement":
      return { optimization_goal: "POST_ENGAGEMENT", billing_event: "IMPRESSIONS" };
    case "leads":
      // Website leads need a pixel + custom event; without one Meta rejects OFFSITE_CONVERSIONS, so fall back to clicks.
      return extra?.pixelId
        ? { optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS", promoted_object: { pixel_id: extra.pixelId, custom_event_type: "LEAD" } }
        : { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };
    case "sales":
      return extra?.pixelId
        ? { optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS", promoted_object: { pixel_id: extra.pixelId, custom_event_type: "PURCHASE" } }
        : { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };
    case "traffic":
    default:
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };
  }
}

async function resolveInterests(tokens: OAuthTokens, names: string[]) {
  const out: Array<{ id: string; name: string }> = [];
  for (const q of names.slice(0, 10)) {
    try {
      const res = await request<{ data: Array<{ id: string; name: string }> }>("meta", `${GRAPH}/search`, {
        headers: auth(tokens),
        query: { type: "adinterest", q, limit: 1 },
        isError,
      });
      const hit = res.data?.[0];
      if (hit) out.push({ id: hit.id, name: hit.name });
    } catch {
      /* unknown interest: skip, keep the ad set broad */
    }
  }
  return out;
}

function sumActions(list: Array<{ action_type: string; value: string }> | undefined, types: string[]) {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const CONVERSION_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

function reviewFrom(effective: string | undefined, feedback: unknown): AdReview {
  const status: AdReview["status"] =
    effective === "DISAPPROVED" || effective === "WITH_ISSUES"
      ? "disapproved"
      : effective === "PENDING_REVIEW" || effective === "IN_PROCESS" || effective === "PREAPPROVED"
        ? "pending"
        : effective
          ? "approved"
          : "unknown";
  const reasons: string[] = [];
  if (feedback && typeof feedback === "object") {
    for (const v of Object.values(feedback as Record<string, unknown>)) {
      if (v && typeof v === "object") for (const [k, msg] of Object.entries(v as Record<string, unknown>)) reasons.push(`${k}: ${String(msg)}`);
    }
  }
  return { status, effectiveStatus: effective, reasons: reasons.length ? reasons : undefined, checkedAt: new Date() };
}

export class MetaAdsProvider implements AdsProvider {
  readonly platform = "meta" as const;
  readonly label = "Meta";
  readonly sandbox = false;

  oauth = {
    authorizeUrl: (state: string, redirectUri: string) => {
      const { appId } = env();
      const u = new URL(DIALOG);
      u.searchParams.set("client_id", appId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", SCOPES.join(","));
      return u.toString();
    },
    exchangeCode: async (code: string, redirectUri: string): Promise<OAuthTokens> => {
      const { appId, appSecret } = env();
      const short = await request<{ access_token: string; expires_in?: number }>("meta", `${GRAPH}/oauth/access_token`, {
        query: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
        isError,
      });
      // Swap for a long-lived (≈60 day) token.
      const long = await request<{ access_token: string; expires_in?: number }>("meta", `${GRAPH}/oauth/access_token`, {
        query: { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token },
        isError,
      });
      return {
        accessToken: long.access_token,
        expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86_400) * 1000),
        scope: SCOPES.join(","),
      };
    },
    // Meta has no refresh tokens: a still-valid long-lived token can be exchanged again.
    refresh: async (tokens: OAuthTokens): Promise<OAuthTokens> => {
      const { appId, appSecret } = env();
      const res = await request<{ access_token: string; expires_in?: number }>("meta", `${GRAPH}/oauth/access_token`, {
        query: { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: tokens.accessToken },
        isError,
      });
      return { ...tokens, accessToken: res.access_token, expiresAt: new Date(Date.now() + (res.expires_in ?? 60 * 86_400) * 1000) };
    },
  };

  async listAdAccounts(tokens: OAuthTokens): Promise<AdAccount[]> {
    const res = await request<{ data: Array<{ id: string; account_id: string; name: string; currency: string; timezone_name: string; account_status: number }> }>(
      "meta",
      `${GRAPH}/me/adaccounts`,
      { headers: auth(tokens), query: { fields: "id,account_id,name,currency,timezone_name,account_status", limit: 100 }, isError },
    );
    return (res.data ?? []).map((a) => ({
      platform: "meta" as const,
      externalId: a.account_id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      raw: a as unknown as Json,
    }));
  }

  async createCampaign(ctx: AdsContext, input: CampaignInput): Promise<CreatedObject> {
    const res = await request<{ id: string }>("meta", `${GRAPH}/${actId(ctx.accountExternalId)}/campaigns`, {
      headers: auth(ctx.tokens),
      json: {
        name: input.name,
        objective: OBJECTIVE[input.objective],
        status: STATUS[input.status],
        buying_type: "AUCTION",
        special_ad_categories: input.extra?.specialAdCategories ?? [],
        // Budget lives on the ad set (no Advantage campaign budget) so one campaign can hold per-placement sets later.
        // Meta now insists the choice is explicit: false = each ad set keeps its own daily budget.
        is_adset_budget_sharing_enabled: false,
      },
      isError,
    });
    return { platform: "meta", externalId: res.id, status: input.status, raw: { id: res.id, operationId: ctx.operationId } };
  }

  async createAdSet(ctx: AdsContext, input: AdSetInput): Promise<CreatedObject> {
    const interests = input.targeting.interests.length ? await resolveInterests(ctx.tokens, input.targeting.interests) : [];
    const targeting: Json = {
      geo_locations: { countries: input.targeting.countries.length ? input.targeting.countries : ["US"] },
      age_min: Math.max(18, input.targeting.ageMin || 18),
      age_max: Math.min(65, input.targeting.ageMax || 65),
      ...(input.targeting.genders.length === 1 ? { genders: input.targeting.genders.map((g) => GENDER[g]) } : {}),
      ...(interests.length ? { flexible_spec: [{ interests }] } : {}),
      targeting_automation: { advantage_audience: 0 },
      ...placementSpec(input.placements),
    };
    const res = await request<{ id: string }>("meta", `${GRAPH}/${actId(ctx.accountExternalId)}/adsets`, {
      headers: auth(ctx.tokens),
      json: {
        name: input.name,
        campaign_id: input.campaignExternalId,
        status: STATUS[input.status],
        daily_budget: input.budget.dailyCents,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        ...optimisation(input.objective, input.extra),
        targeting,
        ...(input.schedule?.startAt ? { start_time: input.schedule.startAt } : {}),
        ...(input.schedule?.endAt ? { end_time: input.schedule.endAt } : {}),
      },
      isError,
    });
    return { platform: "meta", externalId: res.id, status: input.status, raw: { id: res.id, targeting, interests, operationId: ctx.operationId } };
  }

  async uploadCreative(ctx: AdsContext, input: CreativeUpload): Promise<UploadedCreative> {
    const act = actId(ctx.accountExternalId);
    if (input.creative.kind === "video") {
      const form = new FormData();
      form.set("source", fileToBlob(input.bytes, input.creative.mimeType), input.fileName);
      form.set("title", input.fileName);
      const res = await request<{ id: string }>("meta", `${GRAPH}/${act}/advideos`, { headers: auth(ctx.tokens), form, isError });
      return { externalId: res.id, kind: "video", raw: { id: res.id } };
    }
    // adimages accepts a base64 `bytes` field (no multipart needed) and returns the hash keyed by "bytes".
    const res = await request<{ images: Record<string, { hash: string; url: string }> }>("meta", `${GRAPH}/${act}/adimages`, {
      headers: auth(ctx.tokens),
      urlencoded: { bytes: base64(input.bytes), name: input.fileName },
      isError,
    });
    const first = Object.values(res.images ?? {})[0];
    if (!first) throw new Error("Meta adimages returned no image hash");
    return { externalId: first.hash, kind: "image", url: first.url, raw: first as unknown as Json };
  }

  async createAd(ctx: AdsContext, input: AdInput): Promise<CreatedAd> {
    const act = actId(ctx.accountExternalId);
    const pageId = (input.extra?.pageId as string | undefined) ?? process.env.META_PAGE_ID;
    if (!pageId) throw new Error("Meta needs a Facebook Page id to publish ads (set META_PAGE_ID or enter it on the campaign).");
    const c = input.creative;
    const cta = { type: ctaType(c.cta), value: { link: c.landingUrl } };
    const storySpec: Json =
      input.uploaded.kind === "video"
        ? {
            page_id: pageId,
            ...(input.extra?.instagramActorId ? { instagram_actor_id: input.extra.instagramActorId } : {}),
            video_data: {
              video_id: input.uploaded.externalId,
              ...(input.extra?.thumbnailUrl ? { image_url: input.extra.thumbnailUrl } : {}),
              title: truncate(c.headline, 40),
              message: c.primaryText,
              link_description: c.description ? truncate(c.description, 30) : undefined,
              call_to_action: cta,
            },
          }
        : {
            page_id: pageId,
            ...(input.extra?.instagramActorId ? { instagram_actor_id: input.extra.instagramActorId } : {}),
            link_data: {
              image_hash: input.uploaded.externalId,
              link: c.landingUrl,
              message: c.primaryText,
              name: truncate(c.headline, 40),
              description: c.description ? truncate(c.description, 30) : undefined,
              call_to_action: cta,
            },
          };
    const creative = await request<{ id: string }>("meta", `${GRAPH}/${act}/adcreatives`, {
      headers: auth(ctx.tokens),
      json: {
        name: `${input.name} · creative`,
        object_story_spec: storySpec,
        // Keep the rendered asset pixel-exact: opt out of Advantage+ creative enhancements.
        degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } },
        // TODO(meta): AI disclosure. Meta exposes the "Made with AI" self-disclosure in Ads Manager; the
        // Marketing API field is not documented for v21 — surfaced as a warning by validate() for now.
      },
      isError,
    });
    const ad = await request<{ id: string }>("meta", `${GRAPH}/${act}/ads`, {
      headers: auth(ctx.tokens),
      json: { name: input.name, adset_id: input.adSetExternalId, creative: { creative_id: creative.id }, status: STATUS[input.status] },
      isError,
    });
    const reviews = await this.fetchAdReviews(ctx, [ad.id]).catch(() => ({}) as Record<string, AdReview>);
    return {
      platform: "meta",
      externalId: ad.id,
      status: input.status,
      creativeExternalId: creative.id,
      review: reviews[ad.id],
      raw: { id: ad.id, creativeId: creative.id, pageId, operationId: ctx.operationId },
    };
  }

  async setStatus(ctx: AdsContext, target: { externalId: string }, status: LiveStatus) {
    await request("meta", `${GRAPH}/${target.externalId}`, { headers: auth(ctx.tokens), json: { status: STATUS[status] }, isError });
  }

  async fetchAdReviews(ctx: AdsContext, adExternalIds: string[]): Promise<Record<string, AdReview>> {
    const out: Record<string, AdReview> = {};
    for (const ids of chunk(adExternalIds, 50)) {
      const res = await request<Record<string, { id: string; effective_status?: string; ad_review_feedback?: unknown }>>("meta", `${GRAPH}/`, {
        headers: auth(ctx.tokens),
        query: { ids: ids.join(","), fields: "effective_status,ad_review_feedback,status" },
        isError,
      });
      for (const [id, row] of Object.entries(res)) out[id] = reviewFrom(row.effective_status, row.ad_review_feedback);
    }
    return out;
  }

  async fetchInsights(ctx: AdsContext, query: InsightsQuery): Promise<Metrics[]> {
    const rows: Metrics[] = [];
    let url: string | undefined = `${GRAPH}/${actId(ctx.accountExternalId)}/insights`;
    let params: Record<string, string | number> | undefined = {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since: query.since, until: query.until }),
      fields: "ad_id,date_start,spend,impressions,reach,clicks,actions,action_values,video_play_actions,video_thruplay_watched_actions,account_currency",
      limit: 500,
      ...(query.adExternalIds?.length ? { filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: query.adExternalIds }]) } : {}),
    };
    while (url) {
      const res: {
        data: Array<Record<string, unknown>>;
        paging?: { next?: string };
      } = await request("meta", url, { headers: auth(ctx.tokens), query: params, isError });
      for (const r of res.data ?? []) {
        const actions = r.actions as Array<{ action_type: string; value: string }> | undefined;
        const values = r.action_values as Array<{ action_type: string; value: string }> | undefined;
        rows.push({
          adExternalId: String(r.ad_id),
          date: String(r.date_start),
          spendMinor: Math.round(Number(r.spend ?? 0) * 100),
          currency: String(r.account_currency ?? "USD"),
          impressions: Number(r.impressions ?? 0),
          reach: Number(r.reach ?? 0),
          clicks: Number(r.clicks ?? 0),
          conversions: sumActions(actions, CONVERSION_TYPES),
          conversionValueMinor: Math.round(sumActions(values, CONVERSION_TYPES) * 100),
          videoViews: sumActions(r.video_play_actions as never, ["video_view"]),
          thruplays: sumActions(r.video_thruplay_watched_actions as never, ["video_view"]),
          raw: r,
        });
      }
      url = res.paging?.next;
      params = undefined; // `next` already carries the query
    }
    return rows;
  }

  validate(input: Parameters<AdsProvider["validate"]>[0]): ValidationIssue[] {
    const issues = validateCreative("meta", input.creative, input.placement);
    if (input.creative.kind === "video" && input.placement.placement === "stories_reels" && (input.creative.durationSec ?? 0) > 60) {
      issues.push({ level: "error", code: "duration", message: "Stories and Reels ads must be 60 seconds or shorter." });
    }
    return issues;
  }
}

export const metaProvider: AdsProvider = new MetaAdsProvider();
