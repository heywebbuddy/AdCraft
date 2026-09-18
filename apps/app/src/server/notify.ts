import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, dbReady, memberships, users, organizations } from "@adcraft/db";
import { renderEmail } from "@/lib/email-template";
import { getOrgSettings } from "./platform-settings";

/**
 * Finish emails for long jobs (videos, character ads, characters, twins, look packs).
 * Sent through Resend when configured, to the workspace's owners and editors, unless the
 * workspace turned them off. Pages still update themselves; this is for people who left.
 */
const APP_URL = () => (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function recipients(orgId: string): Promise<string[]> {
  await dbReady;
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "editor"])));
  return rows.map((r) => r.email).filter((e): e is string => typeof e === "string" && e.length > 0 && !e.endsWith(".local") && !e.endsWith(".test"));
}

export async function sendEmail(to: string[], subject: string, content: Parameters<typeof renderEmail>[0]): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to.length) return false;
  const { html, text } = renderEmail(content);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Adcraft <login@adcraft.app>", to, subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) console.warn("[notify] resend failed", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

export type FinishEvent =
  | { kind: "video"; creativeId: string; name: string; ok: boolean; error?: string | null }
  | { kind: "character"; characterId: string; name: string; ok: boolean; error?: string | null; what: "character" | "looks" | "twin" | "avatar" }
  | { kind: "campaign"; campaignId: string; name: string; ok: boolean; error?: string | null };

/** Fire-and-forget: never lets an email problem fail the job that finished. */
export async function notifyFinished(orgId: string, ev: FinishEvent): Promise<void> {
  try {
    const settings = await getOrgSettings(orgId);
    if (settings.notifyOnFinish === false) return;
    const to = await recipients(orgId);
    if (!to.length) return;
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const base = APP_URL();
    const link =
      ev.kind === "video" ? `${base}/videos/${ev.creativeId}` : ev.kind === "character" ? `${base}/characters?view=characters` : `${base}/campaigns/${ev.campaignId}`;
    const thing =
      ev.kind === "video" ? "video" : ev.kind === "campaign" ? "campaign" : ev.what === "looks" ? "new looks" : ev.what === "twin" ? "digital twin" : ev.what === "avatar" ? "avatar" : "character";
    const subject = ev.ok ? `${ev.name} is ready` : `${ev.name}: something went wrong`;
    await sendEmail(to, subject, {
      preview: ev.ok ? `Your ${thing} finished in ${org?.name ?? "your workspace"}.` : `Your ${thing} did not finish.`,
      kicker: ev.ok ? "Ready when you are." : "Needs a look.",
      title: ev.ok ? `${ev.name} is ready` : `${ev.name} didn’t finish`,
      paragraphs: ev.ok
        ? [`The ${thing} you started in ${org?.name ?? "Adcraft"} has finished. Open it to review, share it for approval, or add it to a campaign.`]
        : [`The ${thing} you started in ${org?.name ?? "Adcraft"} stopped with an error${ev.error ? `: ${ev.error.slice(0, 200)}` : "."} Any credits it reserved were returned.`, "Open it to try again with a different model or input."],
      cta: { label: ev.ok ? `Open the ${thing}` : "See what happened", url: link },
      note: "You get this because you are an owner or editor of the workspace. Owners can turn finish emails off under Settings → Guardrails.",
    });
  } catch (err) {
    console.warn("[notify] skipped", err instanceof Error ? err.message : err);
  }
}
