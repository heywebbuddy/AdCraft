"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, dbReady, apiKeys, webhooks } from "@adcraft/db";
import { requireOrg } from "./org";
import { logAudit } from "./audit";
import { generateApiKey } from "./api-auth";
import { newWebhookSecret, WEBHOOK_EVENTS } from "./webhooks";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

/** Owner only. The plain key is passed back once via the URL fragment-free query string, shown once, then gone. */
export async function createApiKey(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/api?error=owner");
  const name = str(formData, "name").slice(0, 60) || "Default";
  await dbReady;
  const key = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ orgId: ctx.org.id, name, hashedKey: key.hashed, prefix: key.prefix, createdBy: ctx.viewer.userId })
    .returning({ id: apiKeys.id });
  await logAudit(ctx.org.id, ctx.viewer.userId, "api_key.created", "api_key", row.id, { name, prefix: key.prefix });
  revalidatePath("/settings/api");
  redirect(`/settings/api?created=${row.id}&key=${encodeURIComponent(key.plain)}`);
}

export async function revokeApiKey(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/api?error=owner");
  const id = str(formData, "keyId");
  await dbReady;
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, ctx.org.id)))
    .returning({ name: apiKeys.name, prefix: apiKeys.prefix });
  if (row) await logAudit(ctx.org.id, ctx.viewer.userId, "api_key.revoked", "api_key", id, { name: row.name, prefix: row.prefix });
  revalidatePath("/settings/api");
  redirect("/settings/api?ok=revoked");
}

export async function addWebhook(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/api?error=owner");
  const url = str(formData, "url");
  if (!/^https?:\/\//i.test(url)) redirect("/settings/api?error=url");
  const known = new Set(WEBHOOK_EVENTS.map((e) => e.id));
  const events = formData
    .getAll("events")
    .map((v) => String(v))
    .filter((e) => known.has(e));
  await dbReady;
  const secret = newWebhookSecret();
  const [row] = await db
    .insert(webhooks)
    .values({ orgId: ctx.org.id, url, secret, events, createdBy: ctx.viewer.userId })
    .returning({ id: webhooks.id });
  await logAudit(ctx.org.id, ctx.viewer.userId, "webhook.created", "webhook", row.id, { url, events });
  revalidatePath("/settings/api");
  redirect(`/settings/api?webhook=${row.id}&secret=${encodeURIComponent(secret)}`);
}

export async function deleteWebhook(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/api?error=owner");
  const id = str(formData, "webhookId");
  await dbReady;
  const [row] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.org.id)))
    .returning({ url: webhooks.url });
  if (row) await logAudit(ctx.org.id, ctx.viewer.userId, "webhook.deleted", "webhook", id, { url: row.url });
  revalidatePath("/settings/api");
  redirect("/settings/api?ok=webhook_deleted");
}
