"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db, dbReady, invites, memberships, organizations } from "@adcraft/db";
import { requireOrg, requireViewer, ORG_COOKIE, BRAND_COOKIE } from "./org";
import { logAudit } from "./audit";
import { baseUrl } from "./url";

const ROLES = ["owner", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];
const INVITE_TTL_DAYS = 7;

function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}

async function sendInviteEmail(to: string, orgName: string, inviter: string, url: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Adcraft <login@adcraft.app>",
      to,
      subject: `${inviter} invited you to ${orgName} on Adcraft`,
      text: `${inviter} invited you to join the ${orgName} workspace on Adcraft.\n\nAccept the invite: ${url}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
      html: `<p>${inviter} invited you to join the <strong>${orgName}</strong> workspace on Adcraft.</p><p><a href="${url}">Accept the invite</a></p><p style="color:#75756d;font-size:12px">This link expires in ${INVITE_TTL_DAYS} days.</p>`,
    });
    return true;
  } catch (err) {
    console.error("[team] invite email failed", err);
    return false;
  }
}

/** /settings/team: create an invite (owner only). Emails it when Resend is configured, else shows the link. */
export async function inviteMember(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/team?error=owner");
  await dbReady;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "editor");
  const role: Role = isRole(roleRaw) ? roleRaw : "editor";
  if (!email.includes("@")) redirect("/settings/team?error=email");

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400e3);
  // One live invite per address: replace any pending one.
  await db.delete(invites).where(and(eq(invites.orgId, ctx.org.id), eq(invites.email, email), isNull(invites.acceptedAt)));
  const [inv] = await db
    .insert(invites)
    .values({ orgId: ctx.org.id, email, role, token, invitedBy: ctx.viewer.userId, expiresAt })
    .returning({ id: invites.id });

  const url = `${await baseUrl()}/invite/${token}`;
  const sent = await sendInviteEmail(email, ctx.org.name, ctx.viewer.name, url);
  await logAudit(ctx.org.id, ctx.viewer.userId, "member.invited", "invite", inv.id, { email, role, emailed: sent });
  revalidatePath("/settings/team");
  redirect(sent ? `/settings/team?ok=sent&email=${encodeURIComponent(email)}` : `/settings/team?ok=link&invite=${inv.id}`);
}

export async function revokeInvite(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/team?error=owner");
  const id = String(formData.get("inviteId") ?? "");
  const [row] = await db.delete(invites).where(and(eq(invites.id, id), eq(invites.orgId, ctx.org.id))).returning({ email: invites.email });
  if (row) await logAudit(ctx.org.id, ctx.viewer.userId, "member.invite_revoked", "invite", id, { email: row.email });
  revalidatePath("/settings/team");
  redirect("/settings/team");
}

export async function changeMemberRole(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/team?error=owner");
  const membershipId = String(formData.get("membershipId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  if (!isRole(roleRaw)) redirect("/settings/team?error=role");
  await dbReady;
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.org.id)) });
  if (!m) redirect("/settings/team?error=member");
  if (m.role === "owner" && roleRaw !== "owner") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.role, "owner")));
    if (n <= 1) redirect("/settings/team?error=last_owner");
  }
  await db.update(memberships).set({ role: roleRaw }).where(eq(memberships.id, membershipId));
  await logAudit(ctx.org.id, ctx.viewer.userId, "member.role_changed", "membership", membershipId, { userId: m.userId, from: m.role, to: roleRaw });
  revalidatePath("/settings/team");
  redirect("/settings/team?ok=role");
}

export async function removeMember(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/team?error=owner");
  const membershipId = String(formData.get("membershipId") ?? "");
  await dbReady;
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.org.id)) });
  if (!m) redirect("/settings/team?error=member");
  if (m.userId === ctx.viewer.userId) redirect("/settings/team?error=self");
  if (m.role === "owner") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.role, "owner")));
    if (n <= 1) redirect("/settings/team?error=last_owner");
  }
  await db.delete(memberships).where(eq(memberships.id, membershipId));
  await logAudit(ctx.org.id, ctx.viewer.userId, "member.removed", "membership", membershipId, { userId: m.userId, role: m.role });
  revalidatePath("/settings/team");
  redirect("/settings/team?ok=removed");
}

/**
 * /invite/[token]: join the org with the invited role. The signed-in user's email need
 * not match the invite (agencies forward invites); the token is the credential.
 */
export async function acceptInvite(token: string): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "used" }> {
  await dbReady;
  const viewer = await requireViewer();
  const inv = await db.query.invites.findFirst({ where: eq(invites.token, token) });
  if (!inv) return { ok: false, reason: "invalid" };
  if (inv.acceptedAt) return { ok: false, reason: "used" };
  if (inv.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const existing = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, inv.orgId), eq(memberships.userId, viewer.userId)) });
  if (!existing) {
    await db.insert(memberships).values({ orgId: inv.orgId, userId: viewer.userId, role: inv.role });
  }
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inv.id));
  await logAudit(inv.orgId, viewer.userId, "member.joined", "membership", null, { email: inv.email, role: inv.role, inviteId: inv.id });

  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, inv.orgId) });
  const jar = await cookies();
  if (org) jar.set(ORG_COOKIE, org.id, { path: "/", httpOnly: true, sameSite: "lax" });
  jar.delete(BRAND_COOKIE);
  return { ok: true };
}
