import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, dbReady, users } from "@adcraft/db";
import { auth } from "@/auth";
import { syncAdminFlag } from "./admin-emails";
import { assertDemoCanWrite, isDemoEmail } from "./demo";

/**
 * Platform admin gate (PLAN.md section 14).
 *
 * A user is a platform admin when `users.is_platform_admin` is true. Emails listed in
 * `ADMIN_EMAILS` are promoted on sign-in (auth.ts) and on every request (syncAdminFlag, admin-emails.ts),
 * so a fresh database and a fresh `.env` line both work without a manual UPDATE.
 */

/** Cookie holding the organisation a platform admin is currently viewing as support. */
export const ADMIN_ORG_COOKIE = "adcraft_admin_org";

export type AdminViewer = {
  userId: string;
  email: string;
  name: string;
};

export { adminEmails, syncAdminFlag } from "./admin-emails";

/** Whether the signed-in user (if any) is a platform admin. Never redirects. */
export const currentAdmin = cache(async (): Promise<AdminViewer | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  await dbReady;
  const row = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, email: true, name: true, isPlatformAdmin: true },
  });
  if (!row) return null;
  const isAdmin = await syncAdminFlag(row.id, row.email, row.isPlatformAdmin);
  if (!isAdmin) return null;
  return { userId: row.id, email: row.email ?? "", name: row.name ?? row.email?.split("@")[0] ?? "Admin" };
});

const loadAdmin = cache(async (): Promise<AdminViewer> => {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?callbackUrl=%2Fadmin");
  const admin = await currentAdmin();
  if (!admin) redirect("/dashboard");
  return admin;
});

/**
 * The signed-in platform admin, or a redirect (sign-in when signed out, /dashboard otherwise).
 * Every /admin mutation starts here, so the demo admin is refused here outside page renders:
 * it can open every admin screen and change nothing (server/demo.ts).
 */
export async function requireAdmin(): Promise<AdminViewer> {
  const admin = await loadAdmin();
  await assertDemoCanWrite(admin.email);
  return admin;
}

/** The org id a platform admin has chosen to view as support, if any. Never for a demo account. */
export async function supportOrgId(): Promise<string | null> {
  const admin = await currentAdmin();
  if (!admin || isDemoEmail(admin.email)) return null;
  const jar = await cookies();
  return jar.get(ADMIN_ORG_COOKIE)?.value ?? null;
}
