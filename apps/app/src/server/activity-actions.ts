"use server";
import { readOrg } from "./org";
import { loadActivity, type ActivityItem } from "./activity";

/** Activity tray data for the signed-in workspace (polled by the topbar while something runs). */
export async function activityAction(): Promise<{ running: ActivityItem[]; recent: ActivityItem[] }> {
  // Read-only, polled while anyone browses: open to the read-only demo too (server/demo.ts).
  const ctx = await readOrg();
  return loadActivity(ctx.org.id, ctx.brand?.id ?? null);
}
