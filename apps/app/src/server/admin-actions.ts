"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, dbReady, adminNotes, creatives, generationEvents, memberships, organizations, subscriptions, users } from "@adcraft/db";
import { ADMIN_ORG_COOKIE, requireAdmin } from "./admin";
import { logAudit } from "./audit";
import { PLANS, grantCredits, type PlanId } from "./billing";
import { dispatch, type JobName, type JobPayloads } from "./jobs";
import { setPlatformSetting, type PlanFeatures, DEFAULT_GUARDRAILS } from "./platform-settings";
import "@/pipelines";

/**
 * Every mutation in /admin lives here. Each one: requireAdmin → do the thing →
 * logAudit(orgId | null, adminId, "admin.<action>", …) → redirect back with ?ok=.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (fd: FormData, fallback: string) => {
  const to = str(fd, "back");
  return to.startsWith("/admin") ? to : fallback;
};

// ---- View as support --------------------------------------------------------------------

export async function viewAsOrg(formData: FormData) {
  const admin = await requireAdmin();
  const orgId = str(formData, "orgId");
  await dbReady;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { id: true, name: true } });
  if (!org) redirect("/admin/orgs?error=missing");
  const jar = await cookies();
  jar.set(ADMIN_ORG_COOKIE, org.id, { path: "/", httpOnly: true, sameSite: "lax" });
  await logAudit(org.id, admin.userId, "admin.view_as", "organization", org.id, { orgName: org.name });
  redirect("/dashboard");
}

export async function exitSupportMode() {
  const admin = await requireAdmin();
  const jar = await cookies();
  const orgId = jar.get(ADMIN_ORG_COOKIE)?.value ?? null;
  jar.delete(ADMIN_ORG_COOKIE);
  if (orgId) await logAudit(orgId, admin.userId, "admin.view_as_exit", "organization", orgId);
  redirect(orgId ? `/admin/orgs/${orgId}` : "/admin");
}

// ---- Organisations -----------------------------------------------------------------------

export async function adjustCredits(formData: FormData) {
  const admin = await requireAdmin();
  const orgId = str(formData, "orgId");
  const delta = Math.round(Number(str(formData, "delta")));
  const reason = str(formData, "reason");
  const to = `/admin/orgs/${orgId}?tab=credits`;
  if (!orgId || !Number.isFinite(delta) || delta === 0) redirect(`${to}&error=delta`);
  if (reason.length < 3) redirect(`${to}&error=reason`);
  await dbReady;
  const referenceId = `admin:${admin.userId}:${Date.now()}`;
  await grantCredits(orgId, delta, "adjustment", referenceId, { reason, adminId: admin.userId, adminEmail: admin.email });
  await logAudit(orgId, admin.userId, "admin.credits_adjusted", "organization", orgId, { delta, reason, referenceId });
  redirect(`${to}&ok=credits`);
}

export async function changePlan(formData: FormData) {
  const admin = await requireAdmin();
  const orgId = str(formData, "orgId");
  const plan = str(formData, "plan") as PlanId;
  const grant = str(formData, "grant") === "on";
  const to = `/admin/orgs/${orgId}`;
  if (!orgId || !(plan in PLANS)) redirect(`${to}?error=plan`);
  await dbReady;
  const previous = await db.query.subscriptions.findFirst({ where: eq(subscriptions.orgId, orgId), orderBy: (s, { desc }) => desc(s.createdAt) });
  // Same shape as the Stripe-less path in billing-actions.startCheckout, marked as admin-set in the audit trail.
  await db.insert(subscriptions).values({
    orgId,
    plan,
    status: "active",
    creditsPerPeriod: PLANS[plan].credits,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400e3),
  });
  if (grant) {
    await grantCredits(orgId, PLANS[plan].credits, "subscription_grant", `admin:${plan}:${Date.now()}`, { plan, adminId: admin.userId });
  }
  await logAudit(orgId, admin.userId, "admin.plan_changed", "organization", orgId, { from: previous?.plan ?? null, to: plan, credited: grant ? PLANS[plan].credits : 0 });
  redirect(`${to}?ok=plan`);
}

export async function suspendOrg(formData: FormData) {
  const admin = await requireAdmin();
  const orgId = str(formData, "orgId");
  const reason = str(formData, "reason");
  await dbReady;
  await db.update(organizations).set({ suspendedAt: new Date() }).where(eq(organizations.id, orgId));
  await logAudit(orgId, admin.userId, "admin.org_suspended", "organization", orgId, { reason });
  redirect(`/admin/orgs/${orgId}?ok=suspended`);
}

export async function reinstateOrg(formData: FormData) {
  const admin = await requireAdmin();
  const orgId = str(formData, "orgId");
  await dbReady;
  await db.update(organizations).set({ suspendedAt: null }).where(eq(organizations.id, orgId));
  await logAudit(orgId, admin.userId, "admin.org_reinstated", "organization", orgId);
  redirect(`/admin/orgs/${orgId}?ok=reinstated`);
}

export async function addNote(formData: FormData) {
  const admin = await requireAdmin();
  const orgId = str(formData, "orgId");
  const body = str(formData, "body");
  const to = `/admin/orgs/${orgId}?tab=notes`;
  if (!body) redirect(`${to}&error=note`);
  await dbReady;
  const [note] = await db.insert(adminNotes).values({ orgId, authorId: admin.userId, body: body.slice(0, 4000) }).returning({ id: adminNotes.id });
  await logAudit(orgId, admin.userId, "admin.note_added", "admin_note", note.id);
  redirect(`${to}&ok=note`);
}

export async function removeMembership(formData: FormData) {
  const admin = await requireAdmin();
  const membershipId = str(formData, "membershipId");
  await dbReady;
  const m = await db.query.memberships.findFirst({ where: eq(memberships.id, membershipId) });
  if (!m) redirect("/admin/orgs");
  await db.delete(memberships).where(eq(memberships.id, membershipId));
  await logAudit(m.orgId, admin.userId, "admin.member_removed", "membership", membershipId, { userId: m.userId, role: m.role });
  redirect(back(formData, `/admin/orgs/${m.orgId}?tab=members&ok=removed`));
}

// ---- Users -------------------------------------------------------------------------------

export async function togglePlatformAdmin(formData: FormData) {
  const admin = await requireAdmin();
  const userId = str(formData, "userId");
  const to = back(formData, "/admin/users");
  if (userId === admin.userId) redirect(`${to}${to.includes("?") ? "&" : "?"}error=self`);
  await dbReady;
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, isPlatformAdmin: true, email: true } });
  if (!u) redirect(to);
  const next = !u.isPlatformAdmin;
  await db.update(users).set({ isPlatformAdmin: next }).where(eq(users.id, userId));
  await logAudit(null, admin.userId, next ? "admin.admin_granted" : "admin.admin_revoked", "user", userId, { email: u.email });
  redirect(`${to}${to.includes("?") ? "&" : "?"}ok=${next ? "granted" : "revoked"}`);
}

// ---- Generation events -------------------------------------------------------------------

type RecoveredJob = { name: JobName; data: JobPayloads[JobName] } | null;

/** Work out which pipeline produced an event, from its foreign keys and meta. */
async function recoverJob(e: typeof generationEvents.$inferSelect): Promise<RecoveredJob> {
  const meta = (e.meta ?? {}) as Record<string, unknown>;
  if (e.creativeId) {
    const c = await db.query.creatives.findFirst({ where: and(eq(creatives.id, e.creativeId), eq(creatives.orgId, e.orgId)), columns: { id: true, kind: true } });
    if (!c) return null;
    if (c.kind === "static") return { name: "static.generate", data: { orgId: e.orgId, creativeId: c.id } };
    if (c.kind === "video") return { name: "video.generate", data: { orgId: e.orgId, creativeId: c.id } };
    if (c.kind === "ugc") return { name: "ugc.generate", data: { orgId: e.orgId, creativeId: c.id } };
  }
  if (e.briefId) return { name: "concepts.generate", data: { orgId: e.orgId, briefId: e.briefId } };
  if (typeof meta.productId === "string") return { name: "product.cutout", data: { orgId: e.orgId, productId: meta.productId } };
  return null;
}

export async function retryGeneration(formData: FormData) {
  const admin = await requireAdmin();
  const eventId = str(formData, "eventId");
  const to = back(formData, "/admin/generations");
  const sep = to.includes("?") ? "&" : "?";
  await dbReady;
  const e = await db.query.generationEvents.findFirst({ where: eq(generationEvents.id, eventId) });
  if (!e || e.status !== "failed") redirect(`${to}${sep}error=state`);
  const job = await recoverJob(e);
  if (!job) {
    // Nothing to re-run: record that a human looked at it.
    await db
      .update(generationEvents)
      .set({ status: "canceled", meta: { ...(e.meta ?? {}), adminMarked: true, adminMarkedBy: admin.email, adminMarkedAt: new Date().toISOString() } })
      .where(eq(generationEvents.id, eventId));
    await logAudit(e.orgId, admin.userId, "admin.generation_marked", "generation_event", eventId, { from: "failed", to: "canceled", reason: "no recoverable job" });
    redirect(`${to}${sep}ok=marked`);
  }
  await dispatch(job.name, job.data as never);
  await db
    .update(generationEvents)
    .set({ meta: { ...(e.meta ?? {}), adminRetriedBy: admin.email, adminRetriedAt: new Date().toISOString(), adminRetryJob: job.name } })
    .where(eq(generationEvents.id, eventId));
  await logAudit(e.orgId, admin.userId, "admin.generation_retried", "generation_event", eventId, { job: job.name, data: job.data });
  redirect(`${to}${sep}ok=retried`);
}

export async function markGeneration(formData: FormData) {
  const admin = await requireAdmin();
  const eventId = str(formData, "eventId");
  const status = str(formData, "status");
  const to = back(formData, "/admin/generations");
  const sep = to.includes("?") ? "&" : "?";
  if (!["canceled", "failed"].includes(status)) redirect(`${to}${sep}error=status`);
  await dbReady;
  const e = await db.query.generationEvents.findFirst({ where: eq(generationEvents.id, eventId) });
  if (!e) redirect(`${to}${sep}error=state`);
  await db
    .update(generationEvents)
    .set({
      status,
      error: status === "failed" && !e.error ? "Marked as failed by Adcraft support" : e.error,
      meta: { ...(e.meta ?? {}), adminMarked: true, adminMarkedBy: admin.email, adminMarkedAt: new Date().toISOString() },
    })
    .where(eq(generationEvents.id, eventId));
  await logAudit(e.orgId, admin.userId, "admin.generation_marked", "generation_event", eventId, { from: e.status, to: status });
  redirect(`${to}${sep}ok=marked`);
}

// ---- Models ------------------------------------------------------------------------------

// ---- Platform settings -------------------------------------------------------------------

export async function savePlatformSettings(formData: FormData) {
  const admin = await requireAdmin();
  const maintenanceBanner = str(formData, "maintenanceBanner").slice(0, 300);
  const signupsEnabled = formData.get("signupsEnabled") === "on";
  const trial = Math.round(Number(str(formData, "trialCredits")));
  if (!Number.isFinite(trial) || trial < 0 || trial > 100000) redirect("/admin/settings?error=trial");
  const planFeatures: Record<PlanId, PlanFeatures> = { starter: f(formData, "starter"), studio: f(formData, "studio"), agency: f(formData, "agency") };
  const gnum = (k: string, fallback: number | null): number | null => {
    const raw = str(formData, `g:${k}`);
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  };
  const guardrails = {
    monthlyCostCapUsd: gnum("monthlyCostCapUsd", DEFAULT_GUARDRAILS.monthlyCostCapUsd),
    spendApprovalAbove: gnum("spendApprovalAbove", DEFAULT_GUARDRAILS.spendApprovalAbove),
    heygenVoicesPerWorkspace: gnum("heygenVoicesPerWorkspace", DEFAULT_GUARDRAILS.heygenVoicesPerWorkspace) ?? DEFAULT_GUARDRAILS.heygenVoicesPerWorkspace,
    actionsPerMinute: gnum("actionsPerMinute", DEFAULT_GUARDRAILS.actionsPerMinute) ?? DEFAULT_GUARDRAILS.actionsPerMinute,
  };
  await Promise.all([
    setPlatformSetting("guardrails", guardrails, admin.userId),
    setPlatformSetting("maintenanceBanner", maintenanceBanner, admin.userId),
    setPlatformSetting("signupsEnabled", signupsEnabled, admin.userId),
    setPlatformSetting("trialCredits", trial, admin.userId),
    setPlatformSetting("planFeatures", planFeatures, admin.userId),
  ]);
  await logAudit(null, admin.userId, "admin.settings_updated", "platform_settings", null, { maintenanceBanner, signupsEnabled, trialCredits: trial, planFeatures });
  redirect("/admin/settings?ok=1");
}

function f(fd: FormData, plan: PlanId): PlanFeatures {
  return {
    video: fd.get(`${plan}:video`) === "on",
    ugc: fd.get(`${plan}:ugc`) === "on",
    publishing: fd.get(`${plan}:publishing`) === "on",
  };
}
