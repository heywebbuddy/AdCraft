import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, dbReady, organizations, memberships, brands, creditLedger, users } from "@adcraft/db";
import { auth } from "@/auth";
import { ADMIN_ORG_COOKIE, promoteIfListed } from "./admin";

export const ORG_COOKIE = "adcraft_org";
export const BRAND_COOKIE = "adcraft_brand";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  /** Adcraft staff with access to /admin. */
  isPlatformAdmin: boolean;
};

export type OrgContext = {
  viewer: Viewer;
  org: typeof organizations.$inferSelect;
  role: "owner" | "editor" | "viewer";
  /** True when a platform admin is viewing this org as support (ADMIN_ORG_COOKIE), not as a member. */
  supportMode: boolean;
  brand: typeof brands.$inferSelect | null;
  brands: Array<typeof brands.$inferSelect>;
  credits: { balance: number; grant: number };
};

/** The signed-in user, or a redirect to sign-in. */
export const requireViewer = cache(async (): Promise<Viewer> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  await dbReady;
  const exists = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, email: true, isPlatformAdmin: true },
  });
  // A session can outlive its user row (database reset in development). Force a fresh sign-in.
  if (!exists) redirect("/sign-in?stale=1");
  const isPlatformAdmin = await promoteIfListed(exists.id, exists.email, exists.isPlatformAdmin);
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? session.user.email?.split("@")[0] ?? "there",
    isPlatformAdmin,
  };
});

/**
 * The viewer's current organisation and brand. Redirects to onboarding when the
 * user has no organisation yet. The selected org/brand are remembered in cookies.
 */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  await dbReady;
  const viewer = await requireViewer();
  const jar = await cookies();

  let rows = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, viewer.userId));

  // ---- Platform admin "view as support" (see server/admin.ts) --------------------------
  // When a platform admin has picked an organisation in /admin, that org is loaded as if the
  // admin were an owner, regardless of membership. The (app) layout shows a banner and an
  // exit link while this is active; the choice is logged as "admin.view_as" when it is made.
  let supportMode = false;
  const supportOrg = viewer.isPlatformAdmin ? jar.get(ADMIN_ORG_COOKIE)?.value : undefined;
  if (supportOrg) {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, supportOrg) });
    if (org) {
      rows = [{ org, role: "owner" as const }];
      supportMode = true;
    }
  }
  // ---------------------------------------------------------------------------------------

  if (rows.length === 0) redirect("/welcome");

  const wanted = supportMode ? supportOrg : jar.get(ORG_COOKIE)?.value;
  const picked = rows.find((r) => r.org.id === wanted) ?? rows[0];

  // A suspended organisation is closed to its members; support can still open it.
  if (picked.org.suspendedAt && !supportMode) redirect("/suspended");

  const brandRows = await db.select().from(brands).where(eq(brands.orgId, picked.org.id)).orderBy(brands.createdAt);
  const wantedBrand = jar.get(BRAND_COOKIE)?.value;
  const brand = brandRows.find((b) => b.id === wantedBrand) ?? brandRows[0] ?? null;

  const [ledger] = await db
    .select({
      balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int`,
      grant: sql<number>`coalesce(sum(case when ${creditLedger.delta} > 0 then ${creditLedger.delta} else 0 end), 0)::int`,
    })
    .from(creditLedger)
    .where(eq(creditLedger.orgId, picked.org.id));

  return {
    viewer,
    org: picked.org,
    role: picked.role,
    supportMode,
    brand,
    brands: brandRows,
    credits: { balance: ledger?.balance ?? 0, grant: ledger?.grant ?? 0 },
  };
});

export async function assertOrgMember(orgId: string, userId: string) {
  const m = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
  });
  if (!m) throw new Error("Not a member of this organisation");
  return m;
}
