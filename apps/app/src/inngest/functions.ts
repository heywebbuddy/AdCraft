import { inngest } from "./client";
import { runConceptsPipeline } from "@/pipelines/concepts";

/**
 * brief.submitted -> concepts.generate (PLAN.md section 4). The Inngest function wraps the
 * same pipeline function the inline dispatcher runs locally, so behaviour is identical.
 */
export const generateConcepts = inngest.createFunction(
  { id: "concepts-generate", name: "concepts/generate", retries: 3 },
  { event: "concepts/generate" },
  async ({ event, step }) => {
    return step.run("generate", () => runConceptsPipeline(event.data));
  },
);

export const functions = [generateConcepts];
