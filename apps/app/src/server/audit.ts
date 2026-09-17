import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, dbReady, auditLog, users } from "@adcraft/db";

export type AuditAction =
  | "member.invited"
  | "member.invite_revoked"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "comment.added"
  | "comment.resolved"
  | "approval.requested"
  | "approval.approved"
  | "approval.changes_requested"
  | "share_link.created"
  | "share_link.revoked"
  | "template.created"
  | "template.deleted"
  | "bulk.generated"
  | "api_key.created"
  | "api_key.revoked"
  | "webhook.created"
  | "webhook.deleted"
  | `admin.${string}`
  | (string & {});

/**
 * Append one row to the audit trail. Never throws: an audit failure must not break
 * the action it describes.
 */
export async function logAudit(
  orgId: string | null,
  actorId: string | null,
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await dbReady;
    await db.insert(auditLog).values({ orgId, actorId, action, targetType, targetId, meta });
  } catch (err) {
    console.error("[audit] failed to record", action, err);
  }
}

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown>;
  actor: { name: string | null; email: string | null } | null;
  createdAt: Date;
};

export async function listAudit(orgId: string, limit = 50): Promise<AuditEntry[]> {
  await dbReady;
  const rows = await db
    .select({ a: auditLog, name: users.name, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows.map(({ a, name, email }) => ({
    id: a.id,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    meta: a.meta ?? {},
    actor: a.actorId ? { name, email } : null,
    createdAt: a.createdAt,
  }));
}
