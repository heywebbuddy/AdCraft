"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, dbReady, approvals, brands, comments, shareLinks, templates } from "@adcraft/db";
import { requireOrg, type OrgContext } from "./org";
import { logAudit } from "./audit";
import { emitWebhook } from "./webhooks";
import { creativeSummary, listTemplatesFor, type TemplateRow } from "./collab-data";

// Review comments, approvals, share links and templates. Every action derives the
// organisation from the session; ids passed in are verified against it.

type Role = OrgContext["role"];
const CAN_REQUEST: Role[] = ["owner", "editor"];
const CAN_APPROVE: Role[] = ["owner", "editor"];

function refresh(creativeId: string) {
  revalidatePath(`/creatives/${creativeId}`);
  revalidatePath(`/creatives/${creativeId}/review`);
  revalidatePath("/creatives");
}

async function ownedCreative(ctx: OrgContext, creativeId: string) {
  const c = await creativeSummary(creativeId, ctx.org.id);
  if (!c) throw new Error("Creative not found in this workspace");
  return c;
}

// ---------- comments ----------

export async function addComment(creativeId: string, body: string, variantId: string | null = null): Promise<{ commentId: string }> {
  const ctx = await requireOrg();
  const text = body.trim();
  if (!text) throw new Error("Write something first");
  const c = await ownedCreative(ctx, creativeId);
  await dbReady;
  const [row] = await db
    .insert(comments)
    .values({ orgId: ctx.org.id, creativeId, variantId: variantId || null, authorId: ctx.viewer.userId, authorName: ctx.viewer.name, body: text })
    .returning({ id: comments.id });
  await logAudit(ctx.org.id, ctx.viewer.userId, "comment.added", "creative", creativeId, { commentId: row.id, variantId });
  void emitWebhook(ctx.org.id, "comment.added", { creativeId, creativeName: c.name, commentId: row.id, author: ctx.viewer.name, body: text });
  refresh(creativeId);
  return { commentId: row.id };
}

export async function resolveComment(commentId: string): Promise<void> {
  const ctx = await requireOrg();
  await dbReady;
  const [row] = await db
    .update(comments)
    .set({ resolvedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.orgId, ctx.org.id)))
    .returning({ creativeId: comments.creativeId });
  if (!row) throw new Error("Comment not found");
  await logAudit(ctx.org.id, ctx.viewer.userId, "comment.resolved", "creative", row.creativeId, { commentId });
  refresh(row.creativeId);
}

// ---------- approvals ----------

async function upsertApproval(
  orgId: string,
  creativeId: string,
  patch: Partial<typeof approvals.$inferInsert>,
): Promise<void> {
  await dbReady;
  const existing = await db.query.approvals.findFirst({ where: eq(approvals.creativeId, creativeId) });
  if (existing) await db.update(approvals).set(patch).where(eq(approvals.id, existing.id));
  else await db.insert(approvals).values({ orgId, creativeId, ...patch });
}

/** Editors and owners move a creative into review. */
export async function requestApproval(creativeId: string, note: string | null = null): Promise<void> {
  const ctx = await requireOrg();
  if (!CAN_REQUEST.includes(ctx.role)) throw new Error("Viewers can comment but not request approval");
  await ownedCreative(ctx, creativeId);
  await upsertApproval(ctx.org.id, creativeId, {
    status: "in_review",
    requestedBy: ctx.viewer.userId,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    note: note?.trim() || null,
  });
  await logAudit(ctx.org.id, ctx.viewer.userId, "approval.requested", "creative", creativeId, { note });
  refresh(creativeId);
}

/** Owners and editors approve or send a creative back. */
export async function decide(creativeId: string, decision: "approve" | "changes_requested", note: string | null = null): Promise<void> {
  const ctx = await requireOrg();
  if (!CAN_APPROVE.includes(ctx.role)) throw new Error("Only owners and editors can approve");
  const c = await ownedCreative(ctx, creativeId);
  const status = decision === "approve" ? "approved" : "changes_requested";
  await upsertApproval(ctx.org.id, creativeId, {
    status,
    decidedBy: ctx.viewer.userId,
    decidedByName: null,
    decidedAt: new Date(),
    note: note?.trim() || null,
  });
  await logAudit(ctx.org.id, ctx.viewer.userId, `approval.${status}`, "creative", creativeId, { note });
  void emitWebhook(ctx.org.id, `approval.${status}`, { creativeId, creativeName: c.name, decidedBy: ctx.viewer.name, note });
  refresh(creativeId);
}

// ---------- share links ----------

export type ShareLinkOptions = {
  kind?: "review" | "gallery";
  allowComments?: boolean;
  allowApprove?: boolean;
  /** Days until the link stops working; null/undefined = never. */
  expiresInDays?: number | null;
};

/**
 * Create a public link. `target.creativeId` → review link for one creative;
 * `target.brandId` → gallery of that brand's approved creatives.
 */
export async function createShareLink(
  target: { creativeId: string } | { brandId: string },
  options: ShareLinkOptions = {},
): Promise<{ id: string; token: string; url: string }> {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("Viewers cannot create share links");
  await dbReady;
  let creativeId: string | null = null;
  let brandId: string | null = null;
  if ("creativeId" in target) {
    const c = await ownedCreative(ctx, target.creativeId);
    creativeId = c.id;
    brandId = c.brand.id;
  } else {
    const b = await db.query.brands.findFirst({ where: and(eq(brands.id, target.brandId), eq(brands.orgId, ctx.org.id)) });
    if (!b) throw new Error("Brand not found in this workspace");
    brandId = b.id;
  }
  const kind = options.kind ?? (creativeId ? "review" : "gallery");
  const token = randomBytes(18).toString("base64url");
  const expiresAt = options.expiresInDays ? new Date(Date.now() + options.expiresInDays * 86400e3) : null;
  const [row] = await db
    .insert(shareLinks)
    .values({
      orgId: ctx.org.id,
      brandId,
      creativeId,
      token,
      kind,
      allowComments: options.allowComments ?? true,
      allowApprove: options.allowApprove ?? false,
      expiresAt,
      createdBy: ctx.viewer.userId,
    })
    .returning({ id: shareLinks.id });
  await logAudit(ctx.org.id, ctx.viewer.userId, "share_link.created", creativeId ? "creative" : "brand", creativeId ?? brandId, {
    shareLinkId: row.id,
    kind,
    allowComments: options.allowComments ?? true,
    allowApprove: options.allowApprove ?? false,
    expiresAt,
  });
  if (creativeId) refresh(creativeId);
  const { baseUrl } = await import("./url");
  return { id: row.id, token, url: `${await baseUrl()}/share/${token}` };
}

export async function revokeShareLink(shareLinkId: string): Promise<void> {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("Viewers cannot revoke share links");
  await dbReady;
  const [row] = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, shareLinkId), eq(shareLinks.orgId, ctx.org.id)))
    .returning({ creativeId: shareLinks.creativeId });
  if (!row) throw new Error("Share link not found");
  await logAudit(ctx.org.id, ctx.viewer.userId, "share_link.revoked", "share_link", shareLinkId, {});
  if (row.creativeId) refresh(row.creativeId);
}

// ---------- templates ----------

export async function saveAsTemplate(creativeId: string, name: string, isShared: boolean): Promise<{ templateId: string }> {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("Viewers cannot save templates");
  const c = await ownedCreative(ctx, creativeId);
  const label = name.trim() || c.name;
  await dbReady;
  const [row] = await db
    .insert(templates)
    .values({
      orgId: ctx.org.id,
      brandId: c.brand.id,
      name: label,
      kind: c.kind,
      document: c.document,
      isShared,
      createdBy: ctx.viewer.userId,
    })
    .returning({ id: templates.id });
  await logAudit(ctx.org.id, ctx.viewer.userId, "template.created", "template", row.id, { name: label, creativeId, isShared });
  revalidatePath("/settings/templates");
  refresh(creativeId);
  return { templateId: row.id };
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") throw new Error("Viewers cannot delete templates");
  await dbReady;
  const [row] = await db
    .delete(templates)
    .where(and(eq(templates.id, templateId), eq(templates.orgId, ctx.org.id)))
    .returning({ name: templates.name });
  if (row) await logAudit(ctx.org.id, ctx.viewer.userId, "template.deleted", "template", templateId, { name: row.name });
  revalidatePath("/settings/templates");
}

/**
 * Templates a creation flow can offer: the brand's own plus shared ones.
 * The caller's session must belong to `orgId`.
 */
export async function listTemplates(orgId: string, brandId: string | null, kind: "static" | "video" | "ugc" | null = null): Promise<TemplateRow[]> {
  const ctx = await requireOrg();
  if (ctx.org.id !== orgId) throw new Error("Not a member of this organisation");
  return listTemplatesFor(orgId, brandId, kind);
}

// ---------- form wrappers (used by the server-rendered ReviewPanel and settings pages) ----------

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

export async function addCommentForm(formData: FormData) {
  const creativeId = str(formData, "creativeId");
  await addComment(creativeId, str(formData, "body"), str(formData, "variantId") || null);
}

export async function resolveCommentForm(formData: FormData) {
  await resolveComment(str(formData, "commentId"));
}

export async function requestApprovalForm(formData: FormData) {
  await requestApproval(str(formData, "creativeId"), str(formData, "note") || null);
}

export async function decideForm(formData: FormData) {
  const decision = str(formData, "decision") === "approve" ? "approve" : "changes_requested";
  await decide(str(formData, "creativeId"), decision, str(formData, "note") || null);
}

export async function createShareLinkForm(formData: FormData) {
  const creativeId = str(formData, "creativeId");
  const brandId = str(formData, "brandId");
  const days = Number(str(formData, "expiresInDays") || 0);
  const options: ShareLinkOptions = {
    allowComments: formData.get("allowComments") === "on",
    allowApprove: formData.get("allowApprove") === "on",
    expiresInDays: Number.isFinite(days) && days > 0 ? days : null,
    kind: str(formData, "kind") === "gallery" ? "gallery" : "review",
  };
  const link = creativeId ? await createShareLink({ creativeId }, options) : await createShareLink({ brandId }, options);
  const returnTo = str(formData, "returnTo") || (creativeId ? `/creatives/${creativeId}/review` : "/brands");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}shared=${link.id}`);
}

export async function revokeShareLinkForm(formData: FormData) {
  await revokeShareLink(str(formData, "shareLinkId"));
}

export async function saveAsTemplateForm(formData: FormData) {
  const creativeId = str(formData, "creativeId");
  await saveAsTemplate(creativeId, str(formData, "name"), formData.get("isShared") === "on");
  const returnTo = str(formData, "returnTo") || `/creatives/${creativeId}/review`;
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}template=saved`);
}

export async function deleteTemplateForm(formData: FormData) {
  await deleteTemplate(str(formData, "templateId"));
}
