import { inngest } from "./client";

/**
 * Placeholder for the concept generation step of the pipeline
 * (brief.submitted -> concepts.generate -> ...). See PLAN.md section 4.
 * TODO: load brief + brand kit from @adcraft/db, call @adcraft/ai generateConcepts,
 * persist concepts, record a generation_events row.
 */
export const generateConcepts = inngest.createFunction(
  { id: "concepts-generate", name: "concepts/generate", retries: 3 },
  { event: "concepts/generate" },
  async ({ event, step }) => {
    const brief = await step.run("load-brief", async () => ({
      id: event.data.briefId,
      orgId: event.data.orgId,
    }));

    const concepts = await step.run("generate", async () => {
      // TODO: replace with @adcraft/ai generateConcepts(brief)
      return [] as Array<{ title: string }>;
    });

    return { briefId: brief.id, count: concepts.length, requested: event.data.count ?? 5 };
  },
);

export const functions = [generateConcepts];
