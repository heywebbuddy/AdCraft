"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db, dbReady, organizations, memberships, brands, brandKits, creditLedger } from "@adcraft/db";
import { requireViewer } from "./org";
import { ORG_COOKIE, BRAND_COOKIE } from "./org";
import { getPlatformSettings } from "./platform-settings";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "workspace"
  );
}

export async function createWorkspace(formData: FormData) {
  await dbReady;
  const viewer = await requireViewer();
  const orgName = String(formData.get("orgName") ?? "").trim();
  const brandName = String(formData.get("brandName") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim() || null;
  if (!orgName || !brandName) redirect("/welcome?error=missing");

  const { trialCredits, signupsEnabled } = await getPlatformSettings();
  if (!signupsEnabled) redirect("/welcome?error=closed");

  const base = slugify(orgName);
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const [org] = await db.insert(organizations).values({ name: orgName, slug }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: viewer.userId, role: "owner" });
  const [brand] = await db.insert(brands).values({ orgId: org.id, name: brandName, website }).returning();
  await db.insert(brandKits).values({
    orgId: org.id,
    brandId: brand.id,
    data: {
      colors: { primary: "#242521", accent: "#e65c32", background: "#f8f7f3", text: "#242521" },
      fonts: { heading: "DM Sans", body: "DM Sans" },
      voice: { tone: ["warm", "honest"] },
    },
  });
  await db.insert(creditLedger).values({
    orgId: org.id,
    delta: trialCredits,
    reason: "subscription_grant",
    referenceId: `trial:${org.id}`,
    meta: { plan: "trial" },
  });

  const jar = await cookies();
  jar.set(ORG_COOKIE, org.id, { path: "/", httpOnly: true, sameSite: "lax" });
  jar.set(BRAND_COOKIE, brand.id, { path: "/", httpOnly: true, sameSite: "lax" });
  redirect("/dashboard");
}

export async function switchBrand(brandId: string) {
  const jar = await cookies();
  jar.set(BRAND_COOKIE, brandId, { path: "/", httpOnly: true, sameSite: "lax" });
}

export async function switchOrg(orgId: string) {
  const jar = await cookies();
  jar.set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax" });
  jar.delete(BRAND_COOKIE);
}
