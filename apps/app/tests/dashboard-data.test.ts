import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../packages/db/src/schema";

test("dashboard cast inventory stays scoped to the active brand and organization", async () => {
  const client = new PGlite();
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: new URL("../../../packages/db/drizzle", import.meta.url).pathname });
  const globalDb = globalThis as unknown as { __adcraftDb?: unknown; __adcraftReady?: Promise<void> };
  globalDb.__adcraftDb = database;
  globalDb.__adcraftReady = Promise.resolve();
  try {
    const { loadDashboard } = await import("../src/server/dashboard");
    const [org, other] = await database.insert(schema.organizations).values([
      { name: "Studio", slug: "dashboard-studio" }, { name: "Other", slug: "dashboard-other" },
    ]).returning();
    const [brand, sibling, foreign] = await database.insert(schema.brands).values([
      { orgId: org!.id, name: "Active brand" }, { orgId: org!.id, name: "Sibling brand" }, { orgId: other!.id, name: "Other brand" },
    ]).returning();
    const character = { name: "Presenter", description: "A fictional adult", voiceId: "test", imageModel: "test" };
    await database.insert(schema.characters).values([
      { ...character, orgId: org!.id, brandId: brand!.id, status: "ready", looks: [{ id: "look", name: "Everyday", imageKey: "test.png", prompt: "", model: "test" }], heygen: { type: "digital_twin", consent: "pending" } },
      { ...character, orgId: org!.id, brandId: brand!.id, status: "generating", heygen: { type: "digital_twin", consent: "approved" } },
      { ...character, orgId: org!.id, brandId: sibling!.id },
      { ...character, orgId: other!.id, brandId: foreign!.id },
    ]);
    await database.insert(schema.brandVoices).values([
      { orgId: org!.id, brandId: brand!.id, name: "Own voice", voiceId: "own", kind: "clone", status: "processing" },
      { orgId: org!.id, brandId: sibling!.id, name: "Sibling voice", voiceId: "sibling", kind: "designed", status: "ready" },
    ]);
    assert.deepEqual((await loadDashboard(org!.id, brand!.id)).studio, { characters: 2, looks: 1, voices: 1, processing: 2, pendingConsent: 1 });
    const empty = { characters: 0, looks: 0, voices: 0, processing: 0, pendingConsent: 0 };
    assert.deepEqual((await loadDashboard(other!.id, brand!.id)).studio, empty, "a brand id from another tenant must not expose inventory");
    assert.deepEqual((await loadDashboard(org!.id, null)).studio, empty, "without an active brand, do not mix casts from different brands");
  } finally {
    await client.close();
    delete globalDb.__adcraftDb;
    delete globalDb.__adcraftReady;
  }
});
