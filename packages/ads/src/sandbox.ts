import { dateRange, fnv1a, shortHash } from "./http";
import type { AdsContext, AdsProvider } from "./provider";
import { PLATFORM_LABELS } from "./platforms";
import type { AdReview, Metrics, Platform } from "./types";
import { validateCreative } from "./validation";

/**
 * Sandbox provider: used whenever a platform's env is missing so the whole connect →
 * publish → track loop is demoable offline. Nothing leaves the process; ids are
 * deterministic per operationId (so retries are idempotent by construction) and daily
 * metrics are synthetic but stable per ad id, so charts and alerts look alive.
 */
export class SandboxAdsProvider implements AdsProvider {
  readonly sandbox = true;
  readonly label: string;

  constructor(readonly platform: Platform) {
    this.label = `Sandbox ${PLATFORM_LABELS[platform]}`;
  }

  oauth = {
    // Skip the consent screen: send the browser straight back to our callback.
    authorizeUrl: (state: string, redirectUri: string) => {
      const u = new URL(redirectUri);
      u.searchParams.set("code", "sandbox");
      u.searchParams.set("state", state);
      return u.toString();
    },
    exchangeCode: async () => ({
      accessToken: `sandbox-${this.platform}-${shortHash(String(Date.now()), 8)}`,
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
      scope: "sandbox",
    }),
    refresh: async (t: { accessToken: string }) => ({ ...t, expiresAt: new Date(Date.now() + 365 * 86_400_000) }),
  };

  async listAdAccounts() {
    return [
      {
        platform: this.platform,
        externalId: `sandbox-${this.platform}`,
        name: `Sandbox ${PLATFORM_LABELS[this.platform]}`,
        currency: "USD",
        timezone: "UTC",
        raw: { sandbox: true },
      },
    ];
  }

  private id(kind: string, ctx: AdsContext) {
    return `sbx-${this.platform}-${kind}-${shortHash(ctx.operationId)}`;
  }

  async createCampaign(ctx: AdsContext, input: { status: "active" | "paused" | "archived"; name: string }) {
    return { platform: this.platform, externalId: this.id("cmp", ctx), status: input.status, raw: { sandbox: true, name: input.name } };
  }

  async createAdSet(ctx: AdsContext, input: { status: "active" | "paused" | "archived"; name: string }) {
    return { platform: this.platform, externalId: this.id("set", ctx), status: input.status, raw: { sandbox: true, name: input.name } };
  }

  async uploadCreative(ctx: AdsContext, input: { creative: { kind: "image" | "video" }; bytes: Uint8Array }) {
    return {
      externalId: `sbx-${input.creative.kind}-${shortHash(`${ctx.operationId}:${input.bytes.byteLength}`)}`,
      kind: input.creative.kind,
      raw: { sandbox: true, bytes: input.bytes.byteLength },
    };
  }

  async createAd(ctx: AdsContext, input: { status: "active" | "paused" | "archived"; name: string; uploaded: { externalId: string } }) {
    const externalId = this.id("ad", ctx);
    return {
      platform: this.platform,
      externalId,
      status: input.status,
      creativeExternalId: `sbx-crt-${shortHash(input.uploaded.externalId)}`,
      review: reviewFor(externalId),
      raw: { sandbox: true, name: input.name },
    };
  }

  async setStatus() {
    /* nothing to call */
  }

  async updateCampaign() {
    /* nothing to call */
  }

  async fetchAdReviews(_ctx: AdsContext, adExternalIds: string[]) {
    return Object.fromEntries(adExternalIds.map((id) => [id, reviewFor(id)]));
  }

  async fetchInsights(_ctx: AdsContext, query: { since: string; until: string; adExternalIds?: string[] }) {
    const rows: Metrics[] = [];
    for (const adId of query.adExternalIds ?? []) {
      if (reviewFor(adId).status === "disapproved") continue; // never served
      for (const date of dateRange(query.since, query.until)) rows.push(syntheticDay(adId, date));
    }
    return rows;
  }

  validate(input: Parameters<AdsProvider["validate"]>[0]) {
    return validateCreative(this.platform, input.creative, input.placement);
  }
}

const DISAPPROVAL_REASONS = [
  "Text covers more than 20% of the image",
  "Before/after imagery implies unrealistic results",
  "Landing page mismatch: destination differs from display URL",
];

function reviewFor(adExternalId: string): AdReview {
  const h = fnv1a(adExternalId);
  const disapproved = h % 7 === 3;
  return {
    status: disapproved ? "disapproved" : "approved",
    effectiveStatus: disapproved ? "DISAPPROVED" : "ACTIVE",
    reasons: disapproved ? [DISAPPROVAL_REASONS[h % DISAPPROVAL_REASONS.length]!] : undefined,
    checkedAt: new Date(),
  };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayIndex(date: string) {
  return Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(2026, 0, 1)) / 86_400_000);
}

/** Deterministic daily metrics for an ad: seeded by ad id, shaped by weekday and creative age. */
export function syntheticDay(adExternalId: string, date: string, currency = "USD"): Metrics {
  const seed = fnv1a(adExternalId);
  const rng = mulberry32(seed ^ fnv1a(date));
  const idx = dayIndex(date);
  const weekly = 1 + 0.15 * Math.sin((2 * Math.PI * idx) / 7);
  // A third of ads fatigue: CTR slides as the creative ages through a 28-day cycle.
  const fatigued = seed % 3 === 0;
  const age = (idx + (seed % 20)) % 28;
  const ageMult = fatigued ? Math.max(0.35, 1 - age * 0.035) : 1 - age * 0.004;
  const baseImpressions = 2500 + (seed % 9000);
  const impressions = Math.round(baseImpressions * weekly * (0.85 + 0.3 * rng()));
  const baseCtr = 0.008 + (((seed >>> 8) % 180) / 10000); // 0.8%–2.6%
  const ctr = baseCtr * ageMult * (0.9 + 0.2 * rng());
  const clicks = Math.round(impressions * ctr);
  const cpmCents = 600 + (seed % 900);
  const spendMinor = Math.round((impressions * cpmCents) / 1000);
  const cvr = 0.015 + (((seed >>> 4) % 40) / 1000);
  const conversions = Math.round(clicks * cvr * (0.8 + 0.4 * rng()));
  const aovCents = 3500 + (seed % 5000);
  const videoViews = Math.round(impressions * (0.35 + 0.2 * rng()));
  return {
    adExternalId,
    date,
    spendMinor,
    currency,
    impressions,
    reach: Math.round(impressions * 0.72),
    clicks,
    conversions,
    conversionValueMinor: conversions * aovCents,
    videoViews,
    thruplays: Math.round(videoViews * 0.3),
    raw: { sandbox: true, fatigued, age },
  };
}
