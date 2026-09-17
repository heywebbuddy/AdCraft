import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, dbReady, creditLedger, organizations } from "@adcraft/db";

/** Serialize balance checks per org so simultaneous studio requests cannot overspend. */
export async function reserveGenerationCredits(orgId: string, credits: number, referenceId: string) {
  await dbReady;
  return db.transaction(async tx => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [existing] = await tx.select().from(creditLedger).where(and(eq(creditLedger.orgId, orgId), eq(creditLedger.reason, "generation"), eq(creditLedger.referenceId, referenceId)));
    if (existing) return;
    const [row] = await tx.select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` }).from(creditLedger).where(eq(creditLedger.orgId, orgId));
    if ((row?.balance ?? 0) < credits) throw new Error(`This generation needs ${credits} credits. Top up in Settings to continue.`);
    await tx.insert(creditLedger).values({ orgId, delta: -credits, reason: "generation", referenceId });
  });
}

export async function refundGenerationCredits(orgId: string, referenceId: string) {
  const [charged] = await db.select().from(creditLedger).where(and(eq(creditLedger.orgId, orgId), eq(creditLedger.reason, "generation"), eq(creditLedger.referenceId, referenceId)));
  if (!charged || charged.delta >= 0) return;
  await db.insert(creditLedger).values({ orgId, delta: -charged.delta, reason: "adjustment", referenceId: `refund:${referenceId}`, meta: { reason: "Generation failed" } }).onConflictDoNothing();
}
