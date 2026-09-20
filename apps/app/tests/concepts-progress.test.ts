import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../../packages/db/src/schema";
import { anthropicStream, testConcept } from "../../../packages/ai/tests/fixtures/concept-stream";

// An in-memory database and synthetic SSE responses: no provider calls or user data.
test("concepts are usable before the stream ends; retries keep selections and charge once", async () => {
  const client = new PGlite();
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: new URL("../../../packages/db/drizzle", import.meta.url).pathname });
  const globalDb = globalThis as unknown as { __adcraftDb?: unknown; __adcraftReady?: Promise<void> };
  globalDb.__adcraftDb = database; globalDb.__adcraftReady = Promise.resolve();
  const fetchOriginal = globalThis.fetch;
  const keyOriginal = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "synthetic";
  try {
    const { runConceptsPipeline } = await import("../src/pipelines/concepts");
    const [org] = await database.insert(schema.organizations).values({ name: "Progress test", slug: "progress-test" }).returning();
    const [brand] = await database.insert(schema.brands).values({ orgId: org!.id, name: "Test brand" }).returning();
    const [project] = await database.insert(schema.projects).values({ orgId: org!.id, brandId: brand!.id, name: "Test" }).returning();
    const [brief] = await database.insert(schema.briefs).values({ orgId: org!.id, projectId: project!.id, title: "Progress", data: { audience: "Test", objective: "awareness", platforms: ["meta"], formats: ["static"] } }).returning();
    const [event] = await database.insert(schema.generationEvents).values({ orgId: org!.id, briefId: brief!.id, capability: "text", provider: "anthropic", model: "claude-opus-5", status: "started", meta: { requestedConcepts: 2, concepts: 0 } }).returning();
    const input = { orgId: org!.id, briefId: brief!.id, eventId: event!.id, count: 2 };
    let stream = anthropicStream();
    let requests = 0;
    globalThis.fetch = async () => { requests++; return stream.response; };
    const run = runConceptsPipeline(input);
    const rejected = assert.rejects(run);
    stream.text(`{"concepts":[${JSON.stringify(testConcept(1))}`);
    let first: typeof schema.concepts.$inferSelect | undefined;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      [first] = await database.select().from(schema.concepts);
      if (first) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(first, "the first idea must be committed while the provider stream is still open");
    assert.equal(first.data.scenePrompt, testConcept(1).scenePrompt);
    const [inProgress] = await database.select().from(schema.generationEvents).where(eq(schema.generationEvents.id, event!.id));
    assert.equal(inProgress!.status, "started");
    assert.equal(inProgress!.meta!.concepts, 1);
    assert.equal((await database.select().from(schema.creditLedger)).length, 0);
    await database.update(schema.concepts).set({ status: "selected" }).where(eq(schema.concepts.id, first.id));
    stream.finish("max_tokens");
    await rejected;
    assert.equal((await database.select().from(schema.concepts)).length, 1, "a failed tail cannot discard a completed idea");
    assert.equal((await database.select().from(schema.creditLedger)).length, 0, "a failed run is not charged");

    stream = anthropicStream();
    const retry = runConceptsPipeline(input);
    stream.text(JSON.stringify({ concepts: [testConcept(1), testConcept(2)] }));
    stream.finish();
    const result = await retry;
    assert.equal(result.count, 2);
    const saved = await database.select().from(schema.concepts);
    assert.equal(saved.length, 2, "retry fills the missing slot instead of duplicating the first idea");
    assert.equal(saved.find(c => c.id === first!.id)!.status, "selected");
    const [finished] = await database.select().from(schema.generationEvents).where(eq(schema.generationEvents.id, event!.id));
    assert.equal(finished!.status, "succeeded");
    assert.equal(finished!.meta!.concepts, 2);
    assert.equal((await database.select().from(schema.creditLedger)).length, 1);
    await runConceptsPipeline(input);
    assert.equal(requests, 2, "a redelivered successful job does not call the provider again");
    assert.equal((await database.select().from(schema.creditLedger)).length, 1);
    await assert.rejects(runConceptsPipeline({ ...input, eventId: "00000000-0000-0000-0000-000000000000" }), /event not found/);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (keyOriginal === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = keyOriginal;
    await client.close(); delete globalDb.__adcraftDb; delete globalDb.__adcraftReady;
  }
});
