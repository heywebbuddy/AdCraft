import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../../packages/db/src/schema";
import { safeRedirectPath } from "../src/lib/safe-redirect";

// One in-memory database for the file, installed before any module imports @adcraft/db.
const client = new PGlite();
const database = drizzle(client, { schema });
const globalDb = globalThis as unknown as { __adcraftDb?: unknown; __adcraftReady?: Promise<void> };
before(async () => {
  await migrate(database, { migrationsFolder: new URL("../../../packages/db/drizzle", import.meta.url).pathname });
  globalDb.__adcraftDb = database; globalDb.__adcraftReady = Promise.resolve();
});
after(async () => { await client.close(); delete globalDb.__adcraftDb; delete globalDb.__adcraftReady; });

test("sign-in callbacks only accept same-origin paths", () => {
  assert.equal(safeRedirectPath("/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("/invite/abc?x=1#y"), "/invite/abc?x=1#y");
  for (const bad of ["//evil.example", "/\\evil.example", "/\t/evil.example", "https://evil.example", "javascript:alert(1)", "dashboard", "", undefined, ["/dashboard"]]) {
    assert.equal(safeRedirectPath(bad), "/dashboard", JSON.stringify(bad));
  }
  assert.equal(safeRedirectPath("//evil.example", "/brands"), "/brands");
});

test("simulated purchases are refused in production unless explicitly allowed", async () => {
  const { simulatedBillingAllowed } = await import("../src/server/billing");
  assert.equal(simulatedBillingAllowed({ NODE_ENV: "development" }), true);
  assert.equal(simulatedBillingAllowed({ NODE_ENV: "test" }), true);
  assert.equal(simulatedBillingAllowed({ NODE_ENV: "production" }), false);
  assert.equal(simulatedBillingAllowed({ NODE_ENV: "production", ALLOW_SIMULATED_BILLING: "1" }), false);
  assert.equal(simulatedBillingAllowed({ NODE_ENV: "production", ALLOW_SIMULATED_BILLING: "true" }), true);
});

test("contact addresses and the site name come from env", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.PRIVACY_EMAIL;
    process.env.SUPPORT_EMAIL = "help@shop.example";
    process.env.AUTH_URL = "https://www.shop.example";
    const { LEGAL_CONTACT, LEGAL_DOCS } = await import("../src/lib/legal");
    assert.deepEqual(LEGAL_CONTACT, { privacy: "help@shop.example", support: "help@shop.example" });
    const text = JSON.stringify(LEGAL_DOCS);
    assert.match(text, /studio at shop\.example and related domains/);
    assert.doesNotMatch(text, /adcraft\.app/);
  } finally { process.env = saved; }
});

test("suspension blocks API keys; ADMIN_EMAILS decides env-granted admin rights; providers show this install's bucket", async () => {
  const saved = { ...process.env };
  try {
    // API keys of a suspended workspace are refused.
    const { authenticateApiKey, generateApiKey } = await import("../src/server/api-auth");
    const [org] = await database.insert(schema.organizations).values({ name: "Keyed", slug: "keyed-test" }).returning();
    const key = generateApiKey();
    await database.insert(schema.apiKeys).values({ orgId: org!.id, name: "ci", hashedKey: key.hashed, prefix: key.prefix });
    const req = () => new Request("http://localhost/api/v1/creatives", { headers: { authorization: `Bearer ${key.plain}` } });
    assert.equal((await authenticateApiKey(req()))?.orgId, org!.id);
    await database.update(schema.organizations).set({ suspendedAt: new Date() }).where(eq(schema.organizations.id, org!.id));
    assert.equal(await authenticateApiKey(req()), null, "suspended workspace's key is refused");
    await database.update(schema.organizations).set({ suspendedAt: null }).where(eq(schema.organizations.id, org!.id));
    assert.equal((await authenticateApiKey(req()))?.orgId, org!.id, "reinstating restores the key");

    // ADMIN_EMAILS: listed = admin; unlisted env-granted admins lose it; UI-granted admins keep it.
    const { syncAdminFlag } = await import("../src/server/admin-emails");
    const [listed, dropped, granted, plain] = await database.insert(schema.users).values([
      { email: "listed@test.example" },
      { email: "dropped@test.example", isPlatformAdmin: true },
      { email: "granted@test.example", isPlatformAdmin: true },
      { email: "plain@test.example" },
    ]).returning();
    await database.insert(schema.auditLog).values({ orgId: null, actorId: listed!.id, action: "admin.admin_granted", targetType: "user", targetId: granted!.id });
    process.env.ADMIN_EMAILS = " Listed@test.example ";
    const flag = async (id: string) => (await database.query.users.findFirst({ where: eq(schema.users.id, id) }))!.isPlatformAdmin;
    assert.equal(await syncAdminFlag(listed!.id, listed!.email, false), true);
    assert.equal(await flag(listed!.id), true, "listed address is promoted");
    assert.equal(await syncAdminFlag(dropped!.id, dropped!.email, true), false);
    assert.equal(await flag(dropped!.id), false, "address removed from ADMIN_EMAILS is demoted");
    assert.equal(await syncAdminFlag(dropped!.id, dropped!.email, false), false);
    assert.equal(await syncAdminFlag(granted!.id, granted!.email, true), true);
    assert.equal(await flag(granted!.id), true, "admin granted in Admin → Users keeps it");
    assert.equal(await syncAdminFlag(plain!.id, plain!.email, false), false);

    // Admin → Providers: the R2 note names this deployment's bucket, and the Resend note is accurate.
    const { loadProviders } = await import("../src/server/admin-data");
    process.env.R2_BUCKET = "buyer-bucket";
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY"]) delete process.env[k];
    const providers = await loadProviders();
    const r2 = providers.find((p) => p.id === "r2")!;
    assert.match(r2.note ?? "", /^Bucket buyer-bucket\./);
    assert.doesNotMatch(JSON.stringify(providers), /adcraft-media|APAC/);
    assert.doesNotMatch(providers.find((p) => p.id === "resend")!.note ?? "", /enabled while unset/);
  } finally { process.env = saved; }
});
