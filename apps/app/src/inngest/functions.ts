import { inngest } from "./client";
import { runConceptsPipeline } from "@/pipelines/concepts";
import { runVideoPipeline } from "@/pipelines/video";
import { runUgcPipeline } from "@/pipelines/ugc";
import { insightsCron, insightsSync, publishCampaign } from "./insights-cron";

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

/** Release 2: product video and UGC pipelines (video.generate / ugc.generate). */
export const generateVideo = inngest.createFunction(
  { id: "video-generate", name: "video/generate", retries: 2, concurrency: { limit: 2 } },
  { event: "video/generate" },
  async ({ event, step }) => step.run("generate", () => runVideoPipeline(event.data)),
);

export const generateUgc = inngest.createFunction(
  { id: "ugc-generate", name: "ugc/generate", retries: 2, concurrency: { limit: 2 } },
  { event: "ugc/generate" },
  async ({ event, step }) => step.run("generate", () => runUgcPipeline(event.data)),
);

export const functions = [generateConcepts, generateVideo, generateUgc, publishCampaign, insightsSync, insightsCron];
