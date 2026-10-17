/**
 * Read-only public demo (DEMO_MODE), browser-safe half.
 *
 * `DEMO_MODE=true` adds two one-click doors to the sign-in page that sign a visitor into a
 * shared demo account. Those accounts can look at everything and change nothing. Every other
 * account on the same install works exactly as before.
 *
 * This file only holds the strings both halves agree on. Nothing here is a security boundary:
 * the server half (`server/demo.ts`, the guards in `server/org.ts` and `server/admin.ts`) is
 * what refuses writes.
 */

/**
 * Reserved domain for every demo-world account (RFC 2606: `.invalid` never resolves, so no
 * mail can be delivered and nobody can own an address here). Demo teammates and the sample
 * customer workspaces in the admin panel use it too.
 */
export const DEMO_EMAIL_DOMAIN = "demo.invalid";

/** The "Explore the ad studio" door: owner of the seeded demo workspace. */
export const DEMO_STUDIO_EMAIL = `demo-studio@${DEMO_EMAIL_DOMAIN}`;
/** The "Explore the admin panel" door: a platform admin, whatever ADMIN_EMAILS says. */
export const DEMO_ADMIN_EMAIL = `demo-admin@${DEMO_EMAIL_DOMAIN}`;

/** Digest carried by every demo refusal, so error boundaries can recognise it in production builds. */
export const DEMO_READ_ONLY_DIGEST = "ADCRAFT_DEMO_READ_ONLY";
export const DEMO_READ_ONLY_MESSAGE = "This is a shared demo — changes are switched off.";

/** "Start your own workspace": sign the demo session out, then sign up and land on /welcome. */
export const START_OWN_WORKSPACE_HREF = "/api/auth/reset?callbackUrl=%2Fwelcome";

export type DemoDoor = "studio" | "admin";

export const DEMO_DOORS: Array<{ door: DemoDoor; label: string; hint: string; landing: string }> = [
  {
    door: "studio",
    label: "Explore the ad studio",
    hint: "A brand with products, briefs, finished ads, a UGC video, campaigns and a team.",
    landing: "/dashboard",
  },
  {
    door: "admin",
    label: "Explore the admin panel",
    hint: "The operator's side: accounts, usage, models, finance and service health.",
    landing: "/admin",
  },
];

/**
 * True for any demo-world address: `…@demo.invalid` (the two doors, demo teammates) and
 * `…@<company>.demo.invalid` (the sample customers in the admin panel).
 */
export function isDemoEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const domain = e.slice(at + 1);
  return domain === DEMO_EMAIL_DOMAIN || domain.endsWith(`.${DEMO_EMAIL_DOMAIN}`);
}

/** Whether a caught error is a demo refusal (works on the sanitised errors production sends the browser). */
export function isDemoReadOnlyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { digest?: unknown; message?: unknown };
  return e.digest === DEMO_READ_ONLY_DIGEST || (typeof e.message === "string" && e.message.startsWith(DEMO_READ_ONLY_MESSAGE));
}
