import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, dbReady, generationEvents, creditLedger } from "@adcraft/db";
import { getOrgSettings, getPlatformSettings } from "./platform-settings";

/**
 * Workspace guardrails, checked before anything that costs money starts:
 *  - a monthly provider-cost cap (USD, from generation_events.cost_usd) — platform default,
 *    owners can lower it per workspace;
 *  - an optional monthly credit cap per workspace;
 *  - a per-workspace rate limit on generation starts (token bucket, per process — good
 *    enough to stop a runaway loop or a stuck retry; not a security boundary).
 */
export class GuardrailError extends Error {
  constructor(message: string, readonly code: "cost_cap" | "credit_cap" | "rate_limit") {
    super(message);
    this.name = "GuardrailError";
  }
}

const buckets = new Map<string, { tokens: number; at: number }>();

function take(key: string, perMinute: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Provider spend this month, from the events log. */
export async function monthlyCostUsd(orgId: string): Promise<number> {
  await dbReady;
  const [row] = await db
    .select({ usd: sql<string>`coalesce(sum(${generationEvents.costUsd}), 0)` })
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, orgId), gte(generationEvents.createdAt, monthStart())));
  return Number(row?.usd ?? 0);
}

export async function monthlyCreditsSpent(orgId: string): Promise<number> {
  await dbReady;
  const [row] = await db
    .select({ n: sql<number>`coalesce(-sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(and(eq(creditLedger.orgId, orgId), eq(creditLedger.reason, "generation"), gte(creditLedger.createdAt, monthStart())));
  return Math.max(0, Number(row?.n ?? 0));
}

/** Throws a GuardrailError when the workspace may not start another generation right now. */
export async function assertGenerationAllowed(orgId: string, kind = "generation"): Promise<void> {
  const [platform, org] = await Promise.all([getPlatformSettings(), getOrgSettings(orgId)]);
  const g = platform.guardrails;
  if (!take(`${orgId}:${kind}`, Math.max(5, Math.round(g.actionsPerMinute / 4)))) {
    throw new GuardrailError("That's a lot of generations in a minute. Give it a moment and try again.", "rate_limit");
  }
  const costCap = g.monthlyCostCapUsd;
  if (costCap !== null) {
    const spent = await monthlyCostUsd(orgId);
    if (spent >= costCap) throw new GuardrailError(`This workspace has reached its monthly generation budget ($${costCap}). It resets on the 1st; contact support to raise it.`, "cost_cap");
  }
  if (org.monthlyCreditCap != null) {
    const spent = await monthlyCreditsSpent(orgId);
    if (spent >= org.monthlyCreditCap) throw new GuardrailError(`This workspace's monthly credit limit (${org.monthlyCreditCap}) is used up. An owner can raise it under Settings → Guardrails.`, "credit_cap");
  }
}

/** Per-request rate limit for non-generation actions (uploads, publishing). */
export function checkRate(orgId: string, kind: string, perMinute: number): void {
  if (!take(`${orgId}:${kind}`, perMinute)) throw new GuardrailError("Too many requests. Slow down a little and try again.", "rate_limit");
}

/** Snapshot for the Settings → Guardrails page. */
export async function guardrailStatus(orgId: string) {
  const [platform, org, costUsd, credits] = await Promise.all([getPlatformSettings(), getOrgSettings(orgId), monthlyCostUsd(orgId), monthlyCreditsSpent(orgId)]);
  return { platform: platform.guardrails, org, month: { costUsd, credits } };
}
