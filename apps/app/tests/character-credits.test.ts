import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../../packages/db/src/schema";

test("character migration and credit reservations are tenant-scoped, atomic and refundable", async () => {
  const client = new PGlite();
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: new URL("../../../packages/db/drizzle", import.meta.url).pathname });
  const globalDb = globalThis as unknown as { __adcraftDb?: unknown; __adcraftReady?: Promise<void> };
  globalDb.__adcraftDb = database; globalDb.__adcraftReady = Promise.resolve();
  try {
    const { reserveGenerationCredits, refundGenerationCredits } = await import("../src/server/generation-credits");
    const [org] = await database.insert(schema.organizations).values({ name: "Studio test", slug: "studio-test" }).returning();
    const [other] = await database.insert(schema.organizations).values({ name: "Other tenant", slug: "other-test" }).returning();
    await database.insert(schema.creditLedger).values([{ orgId: org!.id, delta: 5, reason: "adjustment" }, { orgId: other!.id, delta: 50, reason: "adjustment" }]);
    const balance = async () => (await database.select({ total: sql<number>`sum(${schema.creditLedger.delta})::int` }).from(schema.creditLedger).where(eq(schema.creditLedger.orgId, org!.id)))[0]!.total;
    const runs = await Promise.allSettled([reserveGenerationCredits(org!.id, 4, "request-a"), reserveGenerationCredits(org!.id, 4, "request-b")]);
    assert.equal(runs.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(await balance(), 1);
    const winner = runs[0]!.status === "fulfilled" ? "request-a" : "request-b";
    await reserveGenerationCredits(org!.id, 4, winner);
    assert.equal(await balance(), 1, "duplicate delivery cannot charge twice");
    await refundGenerationCredits(other!.id, winner);
    assert.equal(await balance(), 1, "another org cannot refund this reservation");
    await refundGenerationCredits(org!.id, winner);
    await refundGenerationCredits(org!.id, winner);
    assert.equal(await balance(), 5, "a failed job is refunded exactly once");
    const [brand] = await database.insert(schema.brands).values({ orgId: org!.id, name: "Test brand" }).returning();
    const [character] = await database.insert(schema.characters).values({ orgId: org!.id, brandId: brand!.id, name: "Fictional presenter", description: "A fictional adult presenter", voiceId: "test-voice", imageModel: "nano-banana-2" }).returning();
    assert.deepEqual(character!.looks, []); assert.equal(character!.status, "queued");
  } finally { await client.close(); delete globalDb.__adcraftDb; delete globalDb.__adcraftReady; }
});
