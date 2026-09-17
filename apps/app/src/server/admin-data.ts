import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  dbReady,
  adAccounts,
  adminNotes,
  auditLog,
  brands,
  campaigns,
  creativeKind,
  creatives,
  creditLedger,
  generationEvents,
  memberships,
  organizations,
  products,
  subscriptions,
  users,
  aiModels,
} from "@adcraft/db";
import { getCatalog } from "./model-catalog";
import { PLANS, type PlanId } from "./billing";

/** Value of one credit at the top-up rate ($10 / 100 credits, PLAN.md section 5). Used for gross margin. */
export const USD_PER_CREDIT = 0.1;

const DAY = 86400e3;
const since = (days: number) => new Date(Date.now() - days * DAY);
/** Raw `sql` templates hand Date params to the driver as strings; send ISO text and cast instead. */
const iso = (d: Date) => d.toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

// ---------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------

export type ProviderHealth = {
  provider: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  total24h: number;
  failed24h: number;
};

export async function loadOverview() {
  await dbReady;
  const d7 = since(7);
  const d30 = since(30);
  const d1 = since(1);

  const [
    [signups],
    [orgCounts],
    [activeOrgs],
    perDay,
    [gen30],
    [queue],
    providerRows,
    recentSignups,
    recentFailures,
    [creativeTotals],
  ] = await Promise.all([
    db
      .select({
        d7: sql<number>`count(*) filter (where ${users.createdAt} >= ${iso(d7)}::timestamptz)::int`,
        d30: sql<number>`count(*) filter (where ${users.createdAt} >= ${iso(d30)}::timestamptz)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(users),
    db
      .select({
        total: sql<number>`count(*)::int`,
        suspended: sql<number>`count(*) filter (where ${organizations.suspendedAt} is not null)::int`,
      })
      .from(organizations),
    db
      .select({ n: sql<number>`count(distinct ${generationEvents.orgId})::int` })
      .from(generationEvents)
      .where(gte(generationEvents.createdAt, d30)),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${creatives.createdAt}), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(creatives)
      .where(gte(creatives.createdAt, d30))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        cost: sql<number>`coalesce(sum(${generationEvents.costUsd}) filter (where ${generationEvents.status} = 'succeeded'), 0)::float`,
        credits: sql<number>`coalesce(sum(${generationEvents.credits}) filter (where ${generationEvents.status} = 'succeeded'), 0)::int`,
        succeeded: sql<number>`count(*) filter (where ${generationEvents.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${generationEvents.status} = 'failed')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(generationEvents)
      .where(gte(generationEvents.createdAt, d30)),
    db
      .select({
        depth: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${generationEvents.createdAt})`,
      })
      .from(generationEvents)
      .where(eq(generationEvents.status, "started")),
    db
      .select({
        provider: generationEvents.provider,
        lastSuccessAt: sql<Date | null>`max(${generationEvents.createdAt}) filter (where ${generationEvents.status} = 'succeeded')`,
        lastFailureAt: sql<Date | null>`max(${generationEvents.createdAt}) filter (where ${generationEvents.status} = 'failed')`,
        total24h: sql<number>`count(*) filter (where ${generationEvents.createdAt} >= ${iso(d1)}::timestamptz)::int`,
        failed24h: sql<number>`count(*) filter (where ${generationEvents.createdAt} >= ${iso(d1)}::timestamptz and ${generationEvents.status} = 'failed')::int`,
      })
      .from(generationEvents)
      .groupBy(generationEvents.provider)
      .orderBy(generationEvents.provider),
    db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, orgName: organizations.name, orgId: organizations.id })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .leftJoin(organizations, eq(organizations.id, memberships.orgId))
      .orderBy(desc(users.createdAt))
      .limit(8),
    db
      .select({
        id: generationEvents.id,
        provider: generationEvents.provider,
        model: generationEvents.model,
        error: generationEvents.error,
        createdAt: generationEvents.createdAt,
        meta: generationEvents.meta,
        orgId: organizations.id,
        orgName: organizations.name,
      })
      .from(generationEvents)
      .innerJoin(organizations, eq(organizations.id, generationEvents.orgId))
      .where(eq(generationEvents.status, "failed"))
      .orderBy(desc(generationEvents.createdAt))
      .limit(6),
    db
      .select({
        total: sql<number>`count(*)::int`,
        d7: sql<number>`count(*) filter (where ${creatives.createdAt} >= ${iso(d7)}::timestamptz)::int`,
        d30: sql<number>`count(*) filter (where ${creatives.createdAt} >= ${iso(d30)}::timestamptz)::int`,
      })
      .from(creatives),
  ]);

  // Fill the 30-day series so the chart has one point per day.
  const byDay = new Map(perDay.map((r) => [r.day, r.n]));
  const series: Array<{ day: string; n: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    series.push({ day, n: byDay.get(day) ?? 0 });
  }

  const cost = num(gen30?.cost);
  const credits = num(gen30?.credits);
  const revenue = credits * USD_PER_CREDIT;
  const margin = revenue > 0 ? (revenue - cost) / revenue : null;
  const finished = num(gen30?.succeeded) + num(gen30?.failed);

  return {
    signups: { d7: num(signups?.d7), d30: num(signups?.d30), total: num(signups?.total) },
    orgs: { total: num(orgCounts?.total), suspended: num(orgCounts?.suspended), active30d: num(activeOrgs?.n) },
    creatives: { total: num(creativeTotals?.total), d7: num(creativeTotals?.d7), d30: num(creativeTotals?.d30), series },
    generation: {
      cost,
      credits,
      revenue,
      margin,
      succeeded: num(gen30?.succeeded),
      failed: num(gen30?.failed),
      total: num(gen30?.total),
      failureRate: finished > 0 ? num(gen30?.failed) / finished : null,
    },
    queue: { depth: num(queue?.depth), oldest: queue?.oldest ? new Date(queue.oldest) : null },
    providers: providerRows.map(
      (r): ProviderHealth => ({
        provider: r.provider,
        lastSuccessAt: r.lastSuccessAt ? new Date(r.lastSuccessAt) : null,
        lastFailureAt: r.lastFailureAt ? new Date(r.lastFailureAt) : null,
        total24h: num(r.total24h),
        failed24h: num(r.failed24h),
      }),
    ),
    recentSignups: dedupeBy(recentSignups, (r) => r.id),
    recentFailures,
  };
}

function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------------------
// Organisations
// ---------------------------------------------------------------------------------------

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  suspendedAt: Date | null;
  stripeCustomerId: string | null;
  plan: string | null;
  planStatus: string | null;
  members: number;
  credits: number;
  creatives: number;
  lastActivity: Date | null;
};

/** Latest subscription row per org (there can be several from dev purchases). */
async function latestSubscriptions(orgIds?: string[]) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(orgIds && orgIds.length ? inArray(subscriptions.orgId, orgIds) : undefined)
    .orderBy(desc(subscriptions.createdAt));
  const map = new Map<string, typeof subscriptions.$inferSelect>();
  for (const r of rows) if (!map.has(r.orgId)) map.set(r.orgId, r);
  return map;
}

export async function listOrgs(q = "", status: "all" | "active" | "suspended" = "all"): Promise<OrgRow[]> {
  await dbReady;
  const filters: SQL[] = [];
  if (q) filters.push(or(ilike(organizations.name, `%${q}%`), ilike(organizations.slug, `%${q}%`))!);
  if (status === "suspended") filters.push(isNotNull(organizations.suspendedAt));
  if (status === "active") filters.push(sql`${organizations.suspendedAt} is null`);

  const orgs = await db
    .select()
    .from(organizations)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(organizations.createdAt))
    .limit(200);
  if (orgs.length === 0) return [];
  const ids = orgs.map((o) => o.id);

  const [members, credits, creativeCounts, lastEvents, lastCreatives, subs] = await Promise.all([
    db.select({ orgId: memberships.orgId, n: count() }).from(memberships).where(inArray(memberships.orgId, ids)).groupBy(memberships.orgId),
    db
      .select({ orgId: creditLedger.orgId, balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(inArray(creditLedger.orgId, ids))
      .groupBy(creditLedger.orgId),
    db.select({ orgId: creatives.orgId, n: count() }).from(creatives).where(inArray(creatives.orgId, ids)).groupBy(creatives.orgId),
    db
      .select({ orgId: generationEvents.orgId, at: sql<Date>`max(${generationEvents.createdAt})` })
      .from(generationEvents)
      .where(inArray(generationEvents.orgId, ids))
      .groupBy(generationEvents.orgId),
    db
      .select({ orgId: creatives.orgId, at: sql<Date>`max(${creatives.updatedAt})` })
      .from(creatives)
      .where(inArray(creatives.orgId, ids))
      .groupBy(creatives.orgId),
    latestSubscriptions(ids),
  ]);
  const m = new Map(members.map((r) => [r.orgId, Number(r.n)]));
  const c = new Map(credits.map((r) => [r.orgId, num(r.balance)]));
  const cc = new Map(creativeCounts.map((r) => [r.orgId, Number(r.n)]));
  const le = new Map(lastEvents.map((r) => [r.orgId, new Date(r.at)]));
  const lc = new Map(lastCreatives.map((r) => [r.orgId, new Date(r.at)]));

  return orgs.map((o) => {
    const sub = subs.get(o.id);
    const a = le.get(o.id);
    const b = lc.get(o.id);
    const last = a && b ? (a > b ? a : b) : (a ?? b ?? null);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
      suspendedAt: o.suspendedAt,
      stripeCustomerId: o.stripeCustomerId,
      plan: sub?.plan ?? null,
      planStatus: sub?.status ?? null,
      members: m.get(o.id) ?? 0,
      credits: c.get(o.id) ?? 0,
      creatives: cc.get(o.id) ?? 0,
      lastActivity: last,
    };
  });
}

export async function loadOrgDetail(orgId: string) {
  await dbReady;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return null;
  const [members, ledger, [credits], brandRows, productCounts, events, accounts, campaignRows, notes, subs, [counts], [gen]] = await Promise.all([
    db
      .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, name: users.name, email: users.email, joinedAt: memberships.createdAt, isPlatformAdmin: users.isPlatformAdmin })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, orgId))
      .orderBy(memberships.createdAt),
    db.select().from(creditLedger).where(eq(creditLedger.orgId, orgId)).orderBy(desc(creditLedger.createdAt)).limit(100),
    db
      .select({
        balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int`,
        granted: sql<number>`coalesce(sum(case when ${creditLedger.delta} > 0 then ${creditLedger.delta} else 0 end), 0)::int`,
        spent: sql<number>`coalesce(sum(case when ${creditLedger.delta} < 0 then -${creditLedger.delta} else 0 end), 0)::int`,
      })
      .from(creditLedger)
      .where(eq(creditLedger.orgId, orgId)),
    db.select().from(brands).where(eq(brands.orgId, orgId)).orderBy(brands.createdAt),
    db.select({ brandId: products.brandId, n: count() }).from(products).where(eq(products.orgId, orgId)).groupBy(products.brandId),
    db.select().from(generationEvents).where(eq(generationEvents.orgId, orgId)).orderBy(desc(generationEvents.createdAt)).limit(60),
    db.select().from(adAccounts).where(eq(adAccounts.orgId, orgId)).orderBy(adAccounts.createdAt),
    db.select().from(campaigns).where(eq(campaigns.orgId, orgId)).orderBy(desc(campaigns.createdAt)),
    db
      .select({ id: adminNotes.id, body: adminNotes.body, createdAt: adminNotes.createdAt, authorName: users.name, authorEmail: users.email })
      .from(adminNotes)
      .leftJoin(users, eq(users.id, adminNotes.authorId))
      .where(eq(adminNotes.orgId, orgId))
      .orderBy(desc(adminNotes.createdAt)),
    db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).orderBy(desc(subscriptions.createdAt)),
    db
      .select({
        creatives: sql<number>`(select count(*) from ${creatives} where ${creatives.orgId} = ${orgId})::int`,
        products: sql<number>`(select count(*) from ${products} where ${products.orgId} = ${orgId})::int`,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId)),
    db
      .select({
        cost: sql<number>`coalesce(sum(${generationEvents.costUsd}) filter (where ${generationEvents.status} = 'succeeded'), 0)::float`,
        credits: sql<number>`coalesce(sum(${generationEvents.credits}) filter (where ${generationEvents.status} = 'succeeded'), 0)::int`,
        failed: sql<number>`count(*) filter (where ${generationEvents.status} = 'failed')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(generationEvents)
      .where(eq(generationEvents.orgId, orgId)),
  ]);
  const pc = new Map(productCounts.map((r) => [r.brandId, Number(r.n)]));
  return {
    org,
    subscription: subs[0] ?? null,
    subscriptions: subs,
    members,
    ledger,
    credits: { balance: num(credits?.balance), granted: num(credits?.granted), spent: num(credits?.spent) },
    brands: brandRows.map((b) => ({ ...b, products: pc.get(b.id) ?? 0 })),
    events,
    adAccounts: accounts,
    campaigns: campaignRows,
    notes,
    counts: { creatives: num(counts?.creatives), products: num(counts?.products), members: members.length },
    generation: { cost: num(gen?.cost), credits: num(gen?.credits), failed: num(gen?.failed), total: num(gen?.total) },
  };
}

export async function orgNameMap(): Promise<Map<string, string>> {
  await dbReady;
  const rows = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: Date;
  isPlatformAdmin: boolean;
  orgs: Array<{ id: string; name: string; role: string }>;
};

export async function listUsers(q = ""): Promise<UserRow[]> {
  await dbReady;
  const rows = await db
    .select()
    .from(users)
    .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);
  if (rows.length === 0) return [];
  const ms = await db
    .select({ userId: memberships.userId, role: memberships.role, orgId: organizations.id, orgName: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(inArray(memberships.userId, rows.map((r) => r.id)));
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    isPlatformAdmin: u.isPlatformAdmin,
    orgs: ms.filter((m) => m.userId === u.id).map((m) => ({ id: m.orgId, name: m.orgName, role: m.role })),
  }));
}

// ---------------------------------------------------------------------------------------
// Generation events
// ---------------------------------------------------------------------------------------

export type GenerationFilters = {
  provider?: string;
  model?: string;
  status?: string;
  org?: string;
  from?: string;
  to?: string;
};

export async function listGenerations(f: GenerationFilters, limit = 100) {
  await dbReady;
  const where: SQL[] = [];
  if (f.provider) where.push(eq(generationEvents.provider, f.provider));
  if (f.model) where.push(eq(generationEvents.model, f.model));
  if (f.status) where.push(eq(generationEvents.status, f.status));
  if (f.org) where.push(eq(generationEvents.orgId, f.org));
  if (f.from && !Number.isNaN(Date.parse(f.from))) where.push(gte(generationEvents.createdAt, new Date(f.from)));
  if (f.to && !Number.isNaN(Date.parse(f.to))) where.push(lte(generationEvents.createdAt, new Date(new Date(f.to).getTime() + DAY)));
  const cond = where.length ? and(...where) : undefined;

  const [rows, [totals], perModel, providers, modelIds] = await Promise.all([
    db
      .select({ e: generationEvents, orgName: organizations.name, creativeKind: creatives.kind })
      .from(generationEvents)
      .innerJoin(organizations, eq(organizations.id, generationEvents.orgId))
      .leftJoin(creatives, eq(creatives.id, generationEvents.creativeId))
      .where(cond)
      .orderBy(desc(generationEvents.createdAt))
      .limit(limit),
    db
      .select({
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${generationEvents.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${generationEvents.status} = 'failed')::int`,
        started: sql<number>`count(*) filter (where ${generationEvents.status} = 'started')::int`,
        cost: sql<number>`coalesce(sum(${generationEvents.costUsd}), 0)::float`,
        credits: sql<number>`coalesce(sum(${generationEvents.credits}) filter (where ${generationEvents.status} = 'succeeded'), 0)::int`,
      })
      .from(generationEvents)
      .where(cond),
    db
      .select({
        provider: generationEvents.provider,
        model: generationEvents.model,
        n: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(*) filter (where ${generationEvents.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${generationEvents.status} = 'failed')::int`,
        cost: sql<number>`coalesce(sum(${generationEvents.costUsd}), 0)::float`,
        credits: sql<number>`coalesce(sum(${generationEvents.credits}) filter (where ${generationEvents.status} = 'succeeded'), 0)::int`,
        avgMs: sql<number | null>`avg(${generationEvents.durationMs})::float`,
      })
      .from(generationEvents)
      .where(cond)
      .groupBy(generationEvents.provider, generationEvents.model)
      .orderBy(desc(sql`sum(${generationEvents.costUsd})`)),
    db.selectDistinct({ provider: generationEvents.provider }).from(generationEvents).orderBy(generationEvents.provider),
    db.selectDistinct({ model: generationEvents.model }).from(generationEvents).orderBy(generationEvents.model),
  ]);
  return {
    rows: rows.map((r) => ({ ...r.e, orgName: r.orgName, creativeKind: r.creativeKind, costUsd: r.e.costUsd == null ? null : Number(r.e.costUsd) })),
    totals: {
      total: num(totals?.total),
      succeeded: num(totals?.succeeded),
      failed: num(totals?.failed),
      started: num(totals?.started),
      cost: num(totals?.cost),
      credits: num(totals?.credits),
    },
    perModel: perModel.map((r) => ({ ...r, n: num(r.n), succeeded: num(r.succeeded), failed: num(r.failed), cost: num(r.cost), credits: num(r.credits), avgMs: r.avgMs == null ? null : Number(r.avgMs) })),
    providers: providers.map((p) => p.provider),
    models: modelIds.map((m) => m.model).filter(Boolean),
  };
}

export type GenerationEventRow = Awaited<ReturnType<typeof listGenerations>>["rows"][number];

// ---------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------

export async function loadModels() {
  await dbReady;
  const [measured, catalog, rows] = await Promise.all([
    db
      .select({
        model: generationEvents.model,
        n: sql<number>`count(*) filter (where ${generationEvents.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${generationEvents.status} = 'failed')::int`,
        avgCost: sql<number | null>`avg(${generationEvents.costUsd}) filter (where ${generationEvents.status} = 'succeeded')::float`,
        avgUnits: sql<number | null>`avg(${generationEvents.units}) filter (where ${generationEvents.status} = 'succeeded')::float`,
        avgCredits: sql<number | null>`avg(${generationEvents.credits}) filter (where ${generationEvents.status} = 'succeeded')::float`,
        lastUsed: sql<Date | null>`max(${generationEvents.createdAt})`,
      })
      .from(generationEvents)
      .groupBy(generationEvents.model),
    getCatalog(),
    db.select({ id: aiModels.id }).from(aiModels),
  ]);
  const m = new Map(measured.map((r) => [r.model, r]));
  const overridden = new Set(rows.map((r) => r.id));
  const models = catalog.all();
  const registry = models.map((spec) => {
    const row = m.get(spec.id);
    return {
      ...spec,
      effectiveCredits: spec.credits,
      enabled: spec.enabled !== false,
      isDefault: catalog.default(spec.kind).id === spec.id,
      overridden: overridden.has(spec.id),
      measured: row
        ? {
            n: num(row.n),
            failed: num(row.failed),
            avgCost: row.avgCost == null ? null : Number(row.avgCost),
            avgUnits: row.avgUnits == null ? null : Number(row.avgUnits),
            avgCredits: row.avgCredits == null ? null : Number(row.avgCredits),
            lastUsed: row.lastUsed ? new Date(row.lastUsed) : null,
          }
        : null,
    };
  });
  // Models seen in events but missing from the registry (e.g. birefnet cutouts, sample model).
  const known = new Set(models.map((x) => x.id));
  const unregistered = measured
    .filter((r) => r.model && !known.has(r.model))
    .map((r) => ({ model: r.model, n: num(r.n), failed: num(r.failed), avgCost: r.avgCost == null ? null : Number(r.avgCost), lastUsed: r.lastUsed ? new Date(r.lastUsed) : null }));
  return { registry, unregistered };
}

// ---------------------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------------------

export async function loadBilling() {
  await dbReady;
  const [subs, topUps, orgRows] = await Promise.all([
    db
      .select({ s: subscriptions, orgName: organizations.name, stripeCustomerId: organizations.stripeCustomerId })
      .from(subscriptions)
      .innerJoin(organizations, eq(organizations.id, subscriptions.orgId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(200),
    db
      .select({ l: creditLedger, orgName: organizations.name })
      .from(creditLedger)
      .innerJoin(organizations, eq(organizations.id, creditLedger.orgId))
      .where(eq(creditLedger.reason, "top_up"))
      .orderBy(desc(creditLedger.createdAt))
      .limit(50),
    db.select({ id: organizations.id, name: organizations.name, stripeCustomerId: organizations.stripeCustomerId }).from(organizations),
  ]);
  const latest = new Map<string, (typeof subs)[number]>();
  for (const r of subs) if (!latest.has(r.s.orgId)) latest.set(r.s.orgId, r);
  const distribution: Record<PlanId | "trial", number> = { starter: 0, studio: 0, agency: 0, trial: 0 };
  let mrr = 0;
  for (const o of orgRows) {
    const s = latest.get(o.id)?.s;
    const active = s && (s.status === "active" || s.status === "trialing" || s.status === "past_due");
    if (active && s.plan in PLANS) {
      distribution[s.plan as PlanId] += 1;
      if (s.status === "active" || s.status === "past_due") mrr += PLANS[s.plan as PlanId].price;
    } else distribution.trial += 1;
  }
  const topUpTotal = topUps.reduce((n, r) => n + r.l.delta, 0);
  return {
    subscriptions: subs.map((r) => ({ ...r.s, orgName: r.orgName, stripeCustomerId: r.stripeCustomerId })),
    distribution,
    mrr,
    topUps: topUps.map((r) => ({ ...r.l, orgName: r.orgName })),
    topUpTotal,
    orgsTotal: orgRows.length,
    stripeLinked: orgRows.filter((o) => o.stripeCustomerId).length,
  };
}

// ---------------------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------------------

export type ProviderStatus = {
  id: string;
  name: string;
  area: string;
  configured: boolean;
  env: string[];
  missing: string[];
  note?: string;
  /** Provider name as written to generation_events (when it produces events). */
  eventKey?: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  total24h: number;
  failed24h: number;
};

const PROVIDER_DEFS: Array<Omit<ProviderStatus, "configured" | "missing" | "lastSuccessAt" | "lastFailureAt" | "lastError" | "total24h" | "failed24h">> = [
  { id: "anthropic", name: "Anthropic", area: "Concepts, copy, scripts", env: ["ANTHROPIC_API_KEY"], eventKey: "anthropic", note: "Falls back to sample concepts when unset." },
  { id: "openai", name: "OpenAI", area: "GPT Image, GPT text models, any OpenAI-compatible endpoint", env: ["OPENAI_API_KEY"], eventKey: "openai", note: "Compatible endpoints (Gemini, Groq…) use their own key env var set on the model." },
  { id: "fal", name: "fal.ai", area: "Images, video, cutouts", env: ["FAL_KEY"], eventKey: "fal", note: "Offline placeholders when unset." },
  { id: "runway", name: "Runway", area: "Gen-4 image and image-to-video", env: ["RUNWAYML_API_SECRET"], eventKey: "runway", note: "Gen-4 Image and Gen-4 Turbo ship disabled; enable after Test." },
  { id: "replicate", name: "Replicate", area: "Images, video (any owner/name model)", env: ["REPLICATE_API_TOKEN"], eventKey: "replicate", note: "Add models from Admin → Models; two examples ship disabled." },
  { id: "elevenlabs", name: "ElevenLabs", area: "Voice-over", env: ["ELEVENLABS_API_KEY"], eventKey: "elevenlabs" },
  { id: "heygen", name: "HeyGen", area: "UGC presenter", env: ["HEYGEN_API_KEY"], eventKey: "heygen" },
  { id: "resend", name: "Resend", area: "Magic-link sign-in, invites", env: ["RESEND_API_KEY"], note: "Dev sign-in is enabled while unset." },
  { id: "google-auth", name: "Google sign-in", area: "OAuth", env: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] },
  { id: "stripe", name: "Stripe", area: "Subscriptions, top-ups", env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], note: "Purchases are simulated while unset." },
  { id: "r2", name: "Cloudflare R2", area: "Media storage", env: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"], note: "Local disk storage while unset." },
  { id: "inngest", name: "Inngest", area: "Background jobs", env: ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"], note: "Pipelines run inline while unset." },
  { id: "meta", name: "Meta Marketing API", area: "Publishing, insights", env: ["META_APP_ID", "META_APP_SECRET"], note: "Sandbox provider while unset." },
  { id: "tiktok", name: "TikTok Marketing API", area: "Publishing, insights", env: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"], note: "Sandbox provider while unset." },
  { id: "google-ads", name: "Google Ads API", area: "Publishing, insights", env: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"], note: "Sandbox provider while unset." },
];

export async function loadProviders(): Promise<ProviderStatus[]> {
  await dbReady;
  const d1 = since(1);
  const rows = await db
    .select({
      provider: generationEvents.provider,
      lastSuccessAt: sql<Date | null>`max(${generationEvents.createdAt}) filter (where ${generationEvents.status} = 'succeeded')`,
      lastFailureAt: sql<Date | null>`max(${generationEvents.createdAt}) filter (where ${generationEvents.status} = 'failed')`,
      total24h: sql<number>`count(*) filter (where ${generationEvents.createdAt} >= ${iso(d1)}::timestamptz)::int`,
      failed24h: sql<number>`count(*) filter (where ${generationEvents.createdAt} >= ${iso(d1)}::timestamptz and ${generationEvents.status} = 'failed')::int`,
    })
    .from(generationEvents)
    .groupBy(generationEvents.provider);
  const lastErrors = await db
    .select({ provider: generationEvents.provider, error: generationEvents.error, createdAt: generationEvents.createdAt })
    .from(generationEvents)
    .where(eq(generationEvents.status, "failed"))
    .orderBy(desc(generationEvents.createdAt))
    .limit(50);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return PROVIDER_DEFS.map((d) => {
    const missing = d.env.filter((k) => !process.env[k]);
    const r = d.eventKey ? byProvider.get(d.eventKey) : undefined;
    return {
      ...d,
      configured: missing.length === 0,
      missing,
      lastSuccessAt: r?.lastSuccessAt ? new Date(r.lastSuccessAt) : null,
      lastFailureAt: r?.lastFailureAt ? new Date(r.lastFailureAt) : null,
      lastError: d.eventKey ? (lastErrors.find((e) => e.provider === d.eventKey)?.error ?? null) : null,
      total24h: num(r?.total24h),
      failed24h: num(r?.failed24h),
    };
  });
}

// ---------------------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------------------

export async function loadCampaigns() {
  await dbReady;
  const [accounts, rows] = await Promise.all([
    db
      .select({ a: adAccounts, orgName: organizations.name, brandName: brands.name })
      .from(adAccounts)
      .innerJoin(organizations, eq(organizations.id, adAccounts.orgId))
      .leftJoin(brands, eq(brands.id, adAccounts.brandId))
      .orderBy(desc(adAccounts.createdAt))
      .limit(200),
    db
      .select({ c: campaigns, orgName: organizations.name, accountName: adAccounts.name, accountExternalId: adAccounts.externalId })
      .from(campaigns)
      .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
      .innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
      .orderBy(desc(campaigns.createdAt))
      .limit(200),
  ]);
  return {
    accounts: accounts.map((r) => ({ ...r.a, orgName: r.orgName, brandName: r.brandName, sandbox: r.a.externalId.startsWith("sandbox") })),
    campaigns: rows.map((r) => ({ ...r.c, orgName: r.orgName, accountName: r.accountName, sandbox: r.accountExternalId.startsWith("sandbox") })),
  };
}

// ---------------------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------------------

export type AuditFilters = { action?: string; org?: string; actor?: string; scope?: "all" | "admin" | "workspace" };

export async function listPlatformAudit(f: AuditFilters, limit = 150) {
  await dbReady;
  const where: SQL[] = [];
  if (f.action) where.push(ilike(auditLog.action, `${f.action}%`));
  if (f.org) where.push(eq(auditLog.orgId, f.org));
  if (f.actor) where.push(eq(auditLog.actorId, f.actor));
  if (f.scope === "admin") where.push(ilike(auditLog.action, "admin.%"));
  if (f.scope === "workspace") where.push(sql`${auditLog.action} not ilike 'admin.%'`);
  const [rows, actions, actors] = await Promise.all([
    db
      .select({ a: auditLog, orgName: organizations.name, actorName: users.name, actorEmail: users.email })
      .from(auditLog)
      .leftJoin(organizations, eq(organizations.id, auditLog.orgId))
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
    db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(auditLog.action),
    db
      .selectDistinct({ id: users.id, name: users.name, email: users.email })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId)),
  ]);
  return {
    rows: rows.map((r) => ({ ...r.a, orgName: r.orgName, actorName: r.actorName, actorEmail: r.actorEmail })),
    actions: actions.map((a) => a.action),
    actors,
  };
}

/** Kinds that map a failed generation event back to a pipeline job (see admin-actions.retryGeneration). */
export const RETRYABLE_KINDS = creativeKind.enumValues;
