import { inngest } from "./client";
import { runConceptsPipeline } from "@/pipelines/concepts";
import { runVideoPipeline } from "@/pipelines/video";
import { runUgcPipeline } from "@/pipelines/ugc";
import { runCharacterPipeline } from "@/pipelines/character";
import { runStaticPipeline } from "@/pipelines/static";
import { runRenderPipeline } from "@/pipelines/render";
import { runProductCutout } from "@/pipelines/product-cutout";
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

/** Release 1: static ads (scene or AI artwork), size renders and product cutouts. */
export const generateStatic = inngest.createFunction(
  { id: "static-generate", name: "static/generate", retries: 2, concurrency: { limit: 4 } },
  { event: "static/generate" },
  async ({ event, step }) => step.run("generate", () => runStaticPipeline(event.data)),
);

export const renderVariants = inngest.createFunction(
  { id: "render-variants", name: "render/variants", retries: 2, concurrency: { limit: 4 } },
  { event: "render/variants" },
  async ({ event, step }) => step.run("render", () => runRenderPipeline(event.data)),
);

export const productCutout = inngest.createFunction(
  { id: "product-cutout", name: "product/cutout", retries: 2, concurrency: { limit: 4 } },
  { event: "product/cutout" },
  async ({ event, step }) => step.run("cutout", () => runProductCutout(event.data)),
);

export const generateCharacter = inngest.createFunction(
  { id: "character-generate", retries: 0, concurrency: { limit: 3 } },
  { event: "character/generate" },
  async ({ event, step }) => step.run("generate", () => runCharacterPipeline(event.data)),
);

export const functions = [
  generateCharacter,
  generateConcepts,
  generateStatic,
  renderVariants,
  productCutout,
  generateVideo,
  generateUgc,
  publishCampaign,
  insightsSync,
  insightsCron,
];
