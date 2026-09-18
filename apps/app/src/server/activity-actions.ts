"use server";
import { requireOrg } from "./org";
import { loadActivity, type ActivityItem } from "./activity";

/** Activity tray data for the signed-in workspace (polled by the topbar while something runs). */
export async function activityAction(): Promise<{ running: ActivityItem[]; recent: ActivityItem[] }> {
  const ctx = await requireOrg();
  return loadActivity(ctx.org.id, ctx.brand?.id ?? null);
}
