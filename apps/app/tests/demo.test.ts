import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../../packages/db/src/schema";

// One in-memory database and a throwaway storage directory for the file, installed before any
// module imports @adcraft/db or @adcraft/storage.
const client = new PGlite();
const database = drizzle(client, { schema });
const globalDb = globalThis as unknown as { __adcraftDb?: unknown; __adcraftReady?: Promise<void>; __adcraftStorage?: unknown };
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "adcraft-demo-test-"));
const saved = { ...process.env };
before(async () => {
  await migrate(database, { migrationsFolder: new URL("../../../packages/db/drizzle", import.meta.url).pathname });
  globalDb.__adcraftDb = database;
  globalDb.__adcraftReady = Promise.resolve();
  delete globalDb.__adcraftStorage;
  process.env.LOCAL_STORAGE_DIR = storageDir;
  // Sandbox ad-account tokens are encrypted at rest; any secret will do in a test.
  process.env.AUTH_SECRET ??= "demo-test-secret-not-used-anywhere-else";
  for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "META_APP_ID", "TIKTOK_APP_ID", "INNGEST_EVENT_KEY"]) delete process.env[k];
});
after(async () => {
  process.env = saved;
  await client.close();
  delete globalDb.__adcraftDb;
  delete globalDb.__adcraftReady;
  delete globalDb.__adcraftStorage;
  fs.rmSync(storageDir, { recursive: true, force: true });
});

const assetsDir = new URL("../../../dist/assets/ads", import.meta.url).pathname;

test("demo accounts are recognised by their reserved domain only", async () => {
  const { isDemoEmail, isDemoReadOnlyError, DEMO_READ_ONLY_DIGEST } = await import("../src/lib/demo");
  for (const e of ["demo-studio@demo.invalid", "DEMO-ADMIN@demo.invalid ", "hannah.cole@northwind-coffee.demo.invalid"]) assert.equal(isDemoEmail(e), true, e);
  for (const e of ["me@shop.example", "demo@demo.invalid.example.com", "x@notdemo.invalid", "demo.invalid", "", null, undefined]) assert.equal(isDemoEmail(e), false, String(e));
  assert.equal(isDemoReadOnlyError({ digest: DEMO_READ_ONLY_DIGEST, message: "An error occurred in the Server Components render." }), true, "recognised after production sanitising");
  assert.equal(isDemoReadOnlyError(new Error("boom")), false);
});

test("the guard: demo sessions may render pages and nothing else; everyone else is untouched", async () => {
  const { demoWriteDecision, DemoReadOnlyError, demoModeEnabled } = await import("../src/server/demo");
  const demo = "demo-studio@demo.invalid";
  assert.equal(demoWriteDecision({ email: demo, phase: "render" }), "allow");
  assert.equal(demoWriteDecision({ email: demo, phase: "action" }), "deny", "server actions and route handlers");
  assert.equal(demoWriteDecision({ email: demo, phase: "unknown" }), "deny", "deny by default when the phase is unknown");
  assert.equal(demoWriteDecision({ email: "demo-admin@demo.invalid", phase: "action" }), "deny");
  for (const phase of ["render", "action", "unknown"] as const) assert.equal(demoWriteDecision({ email: "owner@shop.example", phase }), "allow", `real account, ${phase}`);
  const err = new DemoReadOnlyError();
  assert.equal(err.digest, "ADCRAFT_DEMO_READ_ONLY");
  assert.match(err.message, /shared demo/);
  assert.equal(demoModeEnabled({ DEMO_MODE: "true" }), true);
  assert.equal(demoModeEnabled({ DEMO_MODE: "1" }), true);
  assert.equal(demoModeEnabled({}), false);
  assert.equal(demoModeEnabled({ DEMO_MODE: "false" }), false);
});

test("admin scope: the demo admin sees only the demo world, real admins see everything else", async () => {
  const { scopeFor } = await import("../src/server/demo");
  assert.equal(scopeFor({ demoMode: false, viewerIsDemo: false, demoOrgIds: ["a"] }), null, "no DEMO_MODE: unscoped, as before");
  assert.deepEqual(scopeFor({ demoMode: true, viewerIsDemo: true, demoOrgIds: ["a", "b"] }), { only: ["a", "b"] });
  assert.deepEqual(scopeFor({ demoMode: true, viewerIsDemo: true, demoOrgIds: [] }), { only: [] }, "seed missing: sees nothing, not everything");
  assert.deepEqual(scopeFor({ demoMode: true, viewerIsDemo: false, demoOrgIds: ["a"] }), { except: ["a"] });
  assert.equal(scopeFor({ demoMode: true, viewerIsDemo: false, demoOrgIds: [] }), null);
});

test("ADMIN_EMAILS sync keeps the demo admin while DEMO_MODE is on, and demotes it after", async () => {
  const { syncAdminFlag } = await import("../src/server/admin-emails");
  const [demoAdmin, imposter] = await database
    .insert(schema.users)
    .values([{ email: "demo-admin@demo.invalid", isPlatformAdmin: true }, { email: "someone@demo.invalid" }])
    .returning();
  const flag = async (id: string) => (await database.query.users.findFirst({ where: eq(schema.users.id, id) }))!.isPlatformAdmin;
  process.env.ADMIN_EMAILS = "owner@shop.example";
  process.env.DEMO_MODE = "true";
  try {
    assert.equal(await syncAdminFlag(demoAdmin!.id, demoAdmin!.email, true), true, "not demoted for missing from ADMIN_EMAILS");
    assert.equal(await flag(demoAdmin!.id), true);
    assert.equal(await syncAdminFlag(demoAdmin!.id, demoAdmin!.email, false), true, "promoted if the flag was lost");
    assert.equal(await syncAdminFlag(imposter!.id, imposter!.email, false), false, "other demo addresses are not admins");
    delete process.env.DEMO_MODE;
    assert.equal(await syncAdminFlag(demoAdmin!.id, demoAdmin!.email, true), false, "DEMO_MODE off: demoted like anyone unlisted");
    assert.equal(await flag(demoAdmin!.id), false);
  } finally {
    delete process.env.DEMO_MODE;
    delete process.env.ADMIN_EMAILS;
    await database.delete(schema.users).where(sql`${schema.users.email} in ('demo-admin@demo.invalid', 'someone@demo.invalid')`);
  }
});

test("only read-only actions skip the demo guard (readOrg callers are pinned)", () => {
  const root = new URL("../src", import.meta.url).pathname;
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        for (const m of text.matchAll(/export async function (\w+)[^{]*\{[^]*?\n\}/g)) if (/\breadOrg\(\)/.test(m[0])) callers.push(`${path.relative(root, full)}#${m[1]}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(callers.sort(), [
    "app/(app)/characters/actions.ts#brandVoicesAction",
    "app/(app)/characters/actions.ts#loadPresenterLooks",
    "app/(app)/characters/actions.ts#searchVoicesAction",
    "app/api/performance/export.csv/route.ts#GET",
    "app/api/render/[creativeId]/zip/route.ts#GET",
    "server/activity-actions.ts#activityAction",
    "server/org.ts#readOrg",
  ]);
});

test("the demo world seeds once, renders locally, publishes to the sandbox and is idempotent", { timeout: 240_000 }, async () => {
  process.env.DEMO_MODE = "true";
  // The static templates are JSX compiled by Next with the automatic runtime; plain tsx uses
  // the classic one, which expects a global React.
  (globalThis as { React?: unknown }).React ??= await import("react");
  const { seedDemoWorld, DEMO_STUDIO_SLUG } = await import("../src/server/demo-seed");
  const { demoOrgIds, forgetDemoOrgs, isDemoOrg, DemoReadOnlyError } = await import("../src/server/demo");
  const { dispatch } = await import("../src/server/jobs");

  // A real customer that must stay untouched.
  const [real] = await database.insert(schema.organizations).values({ name: "Real Shop", slug: "real-shop" }).returning();

  const first = await seedDemoWorld({ assetsDir });
  assert.equal(first.created, true);
  const count = async (table: PgTable) => (await database.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;
  const before = {
    orgs: await count(schema.organizations),
    users: await count(schema.users),
    creatives: await count(schema.creatives),
    renders: await count(schema.renders),
    events: await count(schema.generationEvents),
    metrics: await count(schema.metricsDaily),
    ledger: await count(schema.creditLedger),
  };

  const orgId = first.orgId;
  const org = await database.query.organizations.findFirst({ where: eq(schema.organizations.id, orgId) });
  assert.equal(org!.slug, DEMO_STUDIO_SLUG);
  assert.equal(org!.settings.demoWorld, true);
  assert.equal(org!.settings.demoSeed?.complete, true);

  // Top plan, generous balance.
  const sub = await database.query.subscriptions.findFirst({ where: and(eq(schema.subscriptions.orgId, orgId), eq(schema.subscriptions.status, "active")) });
  assert.equal(sub!.plan, "agency");
  const [{ balance }] = await database.select({ balance: sql<number>`sum(${schema.creditLedger.delta})::int` }).from(schema.creditLedger).where(eq(schema.creditLedger.orgId, orgId));
  assert.ok(balance > 1000, `balance ${balance}`);

  // Brand kit, products with images, briefs, concepts.
  assert.ok((await database.query.brandKits.findMany({ where: eq(schema.brandKits.orgId, orgId) })).some((k) => k.isActive));
  const prods = await database.query.products.findMany({ where: eq(schema.products.orgId, orgId) });
  assert.ok(prods.length >= 5 && prods.every((p) => p.imageKey && fs.existsSync(path.join(storageDir, p.imageKey))));
  assert.ok((await database.query.briefs.findMany({ where: eq(schema.briefs.orgId, orgId) })).length >= 3);
  assert.ok((await database.query.concepts.findMany({ where: eq(schema.concepts.orgId, orgId) })).length >= 10);

  // Finished static ads: every size rendered by the local renderer.
  const statics = await database.query.creatives.findMany({ where: and(eq(schema.creatives.orgId, orgId), eq(schema.creatives.kind, "static")) });
  assert.ok(statics.length >= 5);
  const rendered = await database
    .select({ status: schema.renders.status, key: schema.renders.outputKey, engine: schema.renders.engine })
    .from(schema.renders)
    .where(eq(schema.renders.orgId, orgId));
  assert.ok(rendered.length > statics.length);
  assert.ok(rendered.every((r) => r.status === "succeeded" && r.key && fs.existsSync(path.join(storageDir, r.key))), "every render finished and stored");

  // A UGC video, team, reviews.
  assert.ok((await database.query.creatives.findMany({ where: and(eq(schema.creatives.orgId, orgId), eq(schema.creatives.kind, "ugc")) })).length === 1);
  assert.ok((await database.query.memberships.findMany({ where: eq(schema.memberships.orgId, orgId) })).length >= 4);
  assert.ok((await database.query.approvals.findMany({ where: eq(schema.approvals.orgId, orgId) })).length >= 3);
  assert.ok((await database.query.comments.findMany({ where: eq(schema.comments.orgId, orgId) })).length >= 3);

  // Campaigns published to the sandbox with 30 days of numbers; nothing left in draft or error.
  const cmps = await database.query.campaigns.findMany({ where: eq(schema.campaigns.orgId, orgId) });
  assert.ok(cmps.length >= 4);
  assert.ok(cmps.every((c) => !c.externalId.startsWith("draft:") && c.status !== "error"), JSON.stringify(cmps.map((c) => [c.name, c.status, (c.raw as { error?: string }).error])));
  const accounts = await database.query.adAccounts.findMany({ where: eq(schema.adAccounts.orgId, orgId) });
  assert.ok(accounts.every((a) => a.externalId.startsWith("sandbox-")), "sandbox accounts only: nothing leaves the process");
  const [{ days }] = await database.select({ days: sql<number>`count(distinct ${schema.metricsDaily.date})::int` }).from(schema.metricsDaily).where(eq(schema.metricsDaily.orgId, orgId));
  assert.ok(days >= 28, `${days} days of metrics`);

  // Sample customers for the admin panel, all flagged as demo world.
  forgetDemoOrgs();
  const ids = await demoOrgIds();
  assert.ok(ids.length >= 8 && ids.includes(orgId));
  assert.equal(await isDemoOrg(real!.id), false, "real customers are never demo world");
  const demoUsers = await database.select({ email: schema.users.email }).from(schema.users).where(sql`${schema.users.email} like '%demo.invalid'`);
  assert.ok(demoUsers.length >= 15);

  // No paid job can start for a demo-world org, whoever asks.
  await assert.rejects(() => dispatch("concepts.generate", { orgId, briefId: "00000000-0000-0000-0000-000000000000" }), DemoReadOnlyError);
  await assert.rejects(() => dispatch("static.generate", { orgId: ids.find((i) => i !== orgId)!, creativeId: "x" }), DemoReadOnlyError);

  // Idempotent: a second run (and a fresh process) changes nothing.
  const second = await seedDemoWorld({ assetsDir });
  assert.equal(second.created, false);
  assert.equal(second.orgId, orgId);
  assert.deepEqual(
    {
      orgs: await count(schema.organizations),
      users: await count(schema.users),
      creatives: await count(schema.creatives),
      renders: await count(schema.renders),
      events: await count(schema.generationEvents),
      metrics: await count(schema.metricsDaily),
      ledger: await count(schema.creditLedger),
    },
    before,
  );
  // The real shop was not touched.
  assert.equal((await database.query.organizations.findFirst({ where: eq(schema.organizations.id, real!.id) }))!.settings.demoWorld, undefined);
  delete process.env.DEMO_MODE;
});
