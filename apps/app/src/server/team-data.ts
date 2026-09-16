import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, dbReady, invites, memberships, users } from "@adcraft/db";

export type Member = {
  id: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
  name: string | null;
  email: string | null;
  joinedAt: Date;
};

export async function listMembers(orgId: string): Promise<Member[]> {
  await dbReady;
  const rows = await db
    .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, name: users.name, email: users.email, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(memberships.createdAt);
  return rows;
}

export type PendingInvite = {
  id: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

export async function listPendingInvites(orgId: string): Promise<PendingInvite[]> {
  await dbReady;
  return db
    .select({ id: invites.id, email: invites.email, role: invites.role, token: invites.token, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(eq(invites.orgId, orgId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
}

export async function findInviteByToken(token: string) {
  await dbReady;
  return db.query.invites.findFirst({ where: eq(invites.token, token) });
}
