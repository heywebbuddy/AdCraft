"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, dbReady, approvals, comments } from "@adcraft/db";
import { validShareLink } from "./share";
import { logAudit } from "./audit";
import { emitWebhook } from "./webhooks";
import { creativeSummary } from "./collab-data";

// Actions available to external reviewers through /share/[token]. The token is the only
// credential; each action re-validates it and the link's permissions.

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function back(token: string, q: string): never {
  redirect(`/share/${token}?${q}`);
}

export async function shareComment(formData: FormData) {
  const token = str(formData, "token");
  const v = await validShareLink(token);
  if (!v.ok) back(token, `error=${v.reason}`);
  const { link } = v;
  if (!link.allowComments || !link.creativeId) back(token, "error=comments_off");
  const name = str(formData, "name").slice(0, 80);
  const body = str(formData, "body").slice(0, 4000);
  if (!name || !body) back(token, "error=missing");
  await dbReady;
  const [row] = await db
    .insert(comments)
    .values({ orgId: link.orgId, creativeId: link.creativeId, authorId: null, authorName: `${name} (client)`, body })
    .returning({ id: comments.id });
  await logAudit(link.orgId, null, "comment.added", "creative", link.creativeId, { commentId: row.id, via: "share_link", shareLinkId: link.id, author: name });
  const c = await creativeSummary(link.creativeId, link.orgId);
  void emitWebhook(link.orgId, "comment.added", { creativeId: link.creativeId, creativeName: c?.name ?? null, commentId: row.id, author: name, body, external: true });
  revalidatePath(`/share/${token}`);
  revalidatePath(`/creatives/${link.creativeId}/review`);
  back(token, `ok=comment&name=${encodeURIComponent(name)}`);
}

export async function shareDecide(formData: FormData) {
  const token = str(formData, "token");
  const v = await validShareLink(token);
  if (!v.ok) back(token, `error=${v.reason}`);
  const { link } = v;
  if (!link.allowApprove || !link.creativeId) back(token, "error=approve_off");
  const name = str(formData, "name").slice(0, 80);
  const note = str(formData, "note").slice(0, 2000) || null;
  const status = str(formData, "decision") === "approve" ? "approved" : "changes_requested";
  if (!name) back(token, "error=missing");
  await dbReady;
  const existing = await db.query.approvals.findFirst({ where: eq(approvals.creativeId, link.creativeId) });
  const patch = { status, decidedBy: null, decidedByName: `${name} (client)`, decidedAt: new Date(), note } as const;
  if (existing) await db.update(approvals).set(patch).where(eq(approvals.id, existing.id));
  else await db.insert(approvals).values({ orgId: link.orgId, creativeId: link.creativeId, ...patch });
  await logAudit(link.orgId, null, `approval.${status}`, "creative", link.creativeId, { via: "share_link", shareLinkId: link.id, decidedBy: name, note });
  const c = await creativeSummary(link.creativeId, link.orgId);
  void emitWebhook(link.orgId, `approval.${status}`, { creativeId: link.creativeId, creativeName: c?.name ?? null, decidedBy: name, note, external: true });
  revalidatePath(`/share/${token}`);
  revalidatePath(`/creatives/${link.creativeId}/review`);
  back(token, `ok=${status}&name=${encodeURIComponent(name)}`);
}
