import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, dbReady, webhooks } from "@adcraft/db";

export type WebhookEvent = "creative.rendered" | "approval.approved" | "approval.changes_requested" | "comment.added" | (string & {});

export const WEBHOOK_EVENTS: Array<{ id: string; label: string }> = [
  { id: "creative.rendered", label: "Creative rendered (all sizes ready)" },
  { id: "approval.approved", label: "Creative approved" },
  { id: "approval.changes_requested", label: "Changes requested" },
  { id: "comment.added", label: "Comment added" },
];

export function newWebhookSecret() {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/** `sha256=<hex hmac of "<timestamp>.<body>">` — receivers verify with the endpoint's secret. */
export function signWebhook(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/**
 * Deliver `event` to every enabled webhook of the org that subscribes to it.
 * Fire-and-forget with a short timeout; failures are recorded on the row, never thrown.
 * Other pipelines call this on e.g. `creative.rendered`.
 */
export async function emitWebhook(orgId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<{ delivered: number }> {
  await dbReady;
  const hooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.orgId, orgId), isNull(webhooks.disabledAt)));
  const targets = hooks.filter((h) => h.events.length === 0 || h.events.includes(event));
  if (targets.length === 0) return { delivered: 0 };

  const body = JSON.stringify({ id: `evt_${randomBytes(8).toString("hex")}`, event, orgId, createdAt: new Date().toISOString(), data: payload });
  const timestamp = String(Math.floor(Date.now() / 1000));

  await Promise.all(
    targets.map(async (h) => {
      let status = "error";
      try {
        const res = await fetch(h.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "Adcraft-Webhooks/1.0",
            "x-adcraft-event": event,
            "x-adcraft-timestamp": timestamp,
            "x-adcraft-signature": signWebhook(h.secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        status = String(res.status);
      } catch (err) {
        status = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
      }
      await db.update(webhooks).set({ lastDeliveredAt: new Date(), lastStatus: status }).where(eq(webhooks.id, h.id));
    }),
  );
  return { delivered: targets.length };
}
