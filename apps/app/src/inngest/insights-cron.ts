import { inngest } from "./client";
import { runInsightsPipeline, syncAllAccounts } from "@/pipelines/insights";
import { runPublishPipeline } from "@/pipelines/publish";

/** Hourly insights sync for every connected ad account (PLAN.md section 4). */
export const insightsCron = inngest.createFunction(
  { id: "insights-cron", name: "insights/cron", retries: 2 },
  { cron: "0 * * * *" },
  async ({ step }) => step.run("sync-all", () => syncAllAccounts()),
);

/** On-demand sync for one org / account ("Sync now"). */
export const insightsSync = inngest.createFunction(
  { id: "insights-sync", name: "insights/sync", retries: 2, concurrency: { limit: 3 } },
  { event: "insights/sync" },
  async ({ event, step }) => step.run("sync", () => runInsightsPipeline(event.data)),
);

/** Campaign publish: idempotent per campaign, so retries resume where they stopped. */
export const publishCampaign = inngest.createFunction(
  { id: "publish-campaign", name: "publish/campaign", retries: 3, idempotency: "event.data.campaignId" },
  { event: "publish/campaign" },
  async ({ event, step }) => step.run("publish", () => runPublishPipeline(event.data)),
);

/** Nightly database backup, 03:15 UTC. Keeps 14 days in the media bucket under `db/`. */
export const nightlyBackup = inngest.createFunction(
  { id: "backup-nightly", retries: 2 },
  { cron: "15 3 * * *" },
  async ({ step }) => step.run("pg_dump", async () => {
    const { backupDatabase } = await import("@/server/backup");
    const r = await backupDatabase();
    console.log(`[backup] ${r.name} · ${(r.bytes / 1048576).toFixed(1)} MB → ${r.destination} · pruned ${r.pruned} · ${r.ms} ms`);
    return r;
  }),
);
