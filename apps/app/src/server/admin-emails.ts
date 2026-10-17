import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, dbReady, auditLog, users } from "@adcraft/db";
import { logAudit } from "./audit";
import { isDemoAdminEmail } from "./demo";

/** ADMIN_EMAILS and the platform-admin flag it controls (see admin.ts). No Next.js imports. */

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Brings a user's admin flag in line with ADMIN_EMAILS. Returns the resulting flag.
 *
 * ADMIN_EMAILS is authoritative in one direction:
 * - Listed → admin, on every request. Admin → Users refuses to revoke a listed address
 *   (togglePlatformAdmin), since the next request would restore it.
 * - Unlisted → keeps admin only when another admin granted it in Admin → Users, i.e. the latest
 *   "admin.admin_granted" / "admin.admin_revoked" audit entry for the user is a grant. An admin
 *   who got it from the list loses it on their next request once the address is removed.
 * - The read-only demo admin (DEMO_MODE, server/demo.ts) is an admin while DEMO_MODE is on,
 *   listed or not, and is demoted like anyone else once DEMO_MODE is switched off.
 */
export async function syncAdminFlag(userId: string, email: string | null | undefined, current: boolean): Promise<boolean> {
  const e = (email ?? "").toLowerCase();
  if ((e && adminEmails().includes(e)) || isDemoAdminEmail(e)) {
    if (!current) {
      await dbReady;
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, userId));
    }
    return true;
  }
  if (!current) return false;
  await dbReady;
  const [last] = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, userId), inArray(auditLog.action, ["admin.admin_granted", "admin.admin_revoked"])))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  if (last?.action === "admin.admin_granted") return true;
  await db.update(users).set({ isPlatformAdmin: false }).where(eq(users.id, userId));
  await logAudit(null, null, "admin.admin_revoked", "user", userId, { email, reason: "not in ADMIN_EMAILS" });
  return false;
}
