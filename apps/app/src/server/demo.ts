import "server-only";
import { sql } from "drizzle-orm";
import { db, dbReady, organizations } from "@adcraft/db";
import { DEMO_ADMIN_EMAIL, DEMO_READ_ONLY_DIGEST, DEMO_READ_ONLY_MESSAGE, isDemoEmail } from "@/lib/demo";

/**
 * Read-only public demo (DEMO_MODE), server half: the part that refuses.
 *
 * ## Deny by default
 *
 * Every server action and route handler in this app starts with `requireViewer`,
 * `requireOrg` or `requireAdmin` (server/org.ts, server/admin.ts). Those helpers now call
 * `assertDemoCanWrite`, which refuses a demo-world account whenever the request is not a
 * plain page render — that is, inside any Server Action, any Route Handler (Next runs both
 * in its "action" phase) and any `after()` callback. A new action written next month is
 * covered the moment it calls one of the helpers, which it must to know who is asking.
 *
 * Read-only actions that the UI polls while a visitor browses (the activity tray, the voice
 * picker) opt out explicitly with `readOrg()`; that list is pinned by tests/demo.test.ts.
 *
 * ## Belt and braces
 *
 * - `dispatch()` (server/jobs.ts), the single entry to every paid pipeline (AI text, image,
 *   video, voice, presenter, Remotion renders, ad publishing), refuses demo-world orgs.
 * - Outbound email never goes to a `@demo.invalid` address (server/notify.ts).
 * - Route handlers that write check `demoRouteRefusal()` before doing anything.
 * - Sign-in for demo addresses is refused on every provider except the demo door (auth.ts).
 */

export function demoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.DEMO_MODE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export { isDemoEmail };

/** The demo admin is a platform admin on a DEMO_MODE install, whatever ADMIN_EMAILS says. */
export function isDemoAdminEmail(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return demoModeEnabled(env) && (email ?? "").trim().toLowerCase() === DEMO_ADMIN_EMAIL;
}

/** Thrown for every refused demo write. The digest survives production error sanitising. */
export class DemoReadOnlyError extends Error {
  readonly digest = DEMO_READ_ONLY_DIGEST;
  constructor(message = DEMO_READ_ONLY_MESSAGE) {
    super(message);
    this.name = "DemoReadOnlyError";
  }
}

export type RequestPhase = "render" | "action" | "unknown";

/**
 * The decision, pure so tests can pin it. Demo-world accounts may render pages and nothing
 * else; every other account is untouched. Deliberately independent of DEMO_MODE: a demo
 * session that outlives the flag (JWTs last 30 days) stays read-only.
 */
export function demoWriteDecision(input: { email: string | null | undefined; phase: RequestPhase }): "allow" | "deny" {
  if (!isDemoEmail(input.email)) return "allow";
  return input.phase === "render" ? "allow" : "deny";
}

/**
 * Which phase of a request we are in. Next keeps it on the request store: "render" for page
 * and layout renders, "action" while a Server Action or a Route Handler runs, "after" for
 * `after()` callbacks. When the store is not reachable (a Next upgrade moved it) the request
 * itself is consulted: a Server Action always carries `Next-Action` or a form body.
 */
export async function requestPhase(): Promise<RequestPhase> {
  try {
    const mod = (await import("next/dist/server/app-render/work-unit-async-storage.external")) as {
      workUnitAsyncStorage?: { getStore(): { type?: string; phase?: string } | undefined };
    };
    const store = mod.workUnitAsyncStorage?.getStore();
    if (store?.type === "request") return store.phase === "render" ? "render" : "action";
    if (store) return "render"; // prerender / cache scopes cannot run actions
  } catch {
    /* fall through to the headers check */
  }
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const type = h.get("content-type") ?? "";
    if (h.has("next-action") || type.startsWith("multipart/form-data") || type.startsWith("application/x-www-form-urlencoded")) return "action";
    return "render";
  } catch {
    return "unknown";
  }
}

/** Refuse a write from a demo-world account. Cheap for everyone else: one string check. */
export async function assertDemoCanWrite(email: string | null | undefined): Promise<void> {
  if (!isDemoEmail(email)) return;
  if (demoWriteDecision({ email, phase: await requestPhase() }) === "deny") throw new DemoReadOnlyError();
}

/** The JSON a route handler returns to a demo session. */
export function demoRefusalResponse(): Response {
  return Response.json({ error: { code: "demo_read_only", message: DEMO_READ_ONLY_MESSAGE } }, { status: 403 });
}

/** For route handlers that write: a 403 response when the caller is a demo-world session, else null. */
export async function demoRouteRefusal(): Promise<Response | null> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (isDemoEmail(session?.user?.email)) return demoRefusalResponse();
  // The session email is a snapshot from sign-in; the row is the truth.
  const { eq } = await import("drizzle-orm");
  const { users } = await import("@adcraft/db");
  await dbReady;
  const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } });
  return isDemoEmail(row?.email) ? demoRefusalResponse() : null;
}

// ---------------------------------------------------------------------------------------
// Demo-world organisations
// ---------------------------------------------------------------------------------------

/** The flag the seed sets in `organizations.settings`. No form writes arbitrary settings keys. */
export const DEMO_WORLD_FLAG = "demoWorld";

let orgCache: { at: number; ids: string[] } | null = null;
const ORG_CACHE_MS = 60_000;

export function forgetDemoOrgs(): void {
  orgCache = null;
}

/** Ids of every seeded demo-world organisation (the demo workspace and the sample customers). */
export async function demoOrgIds(): Promise<string[]> {
  if (orgCache && Date.now() - orgCache.at < ORG_CACHE_MS) return orgCache.ids;
  await dbReady;
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`(${organizations.settings}->>${DEMO_WORLD_FLAG}) = 'true'`);
  orgCache = { at: Date.now(), ids: rows.map((r) => r.id) };
  return orgCache.ids;
}

export async function isDemoOrg(orgId: string): Promise<boolean> {
  return (await demoOrgIds()).includes(orgId);
}

/** Refuse paid or outbound work for a demo-world organisation (server/jobs.ts `dispatch`). */
export async function assertNotDemoOrg(orgId: string | null | undefined): Promise<void> {
  if (!orgId) return;
  if (await isDemoOrg(orgId)) throw new DemoReadOnlyError();
}

// ---------------------------------------------------------------------------------------
// Admin panel scope
// ---------------------------------------------------------------------------------------

/**
 * What the admin panel may show the current viewer.
 *
 * - The demo admin sees the demo world only: never a real customer's name, email, spend or
 *   files. (The demo runs on the live install, next to real customers.)
 * - A real admin on a DEMO_MODE install sees everything except the demo world, so the sample
 *   customers never inflate real MRR, usage or sign-up numbers.
 * - Without DEMO_MODE: no scope at all, exactly as before.
 */
export type AdminScope = null | { only: string[] } | { except: string[] };

export function scopeFor(input: { demoMode: boolean; viewerIsDemo: boolean; demoOrgIds: string[] }): AdminScope {
  if (input.viewerIsDemo) return { only: input.demoOrgIds };
  if (!input.demoMode) return null;
  return input.demoOrgIds.length ? { except: input.demoOrgIds } : null;
}

/** The scope for the signed-in admin of this request. */
export async function adminScope(): Promise<AdminScope> {
  const demoMode = demoModeEnabled();
  // Outside DEMO_MODE nothing is scoped, and nothing request-bound is touched (tests call
  // the admin loaders without a request).
  if (!demoMode) return null;
  const { currentAdmin } = await import("./admin");
  const admin = await currentAdmin();
  return scopeFor({ demoMode, viewerIsDemo: isDemoEmail(admin?.email), demoOrgIds: await demoOrgIds() });
}

/** True when the signed-in viewer of this request is a demo-world account. */
export async function viewerIsDemo(): Promise<boolean> {
  const { auth } = await import("@/auth");
  const session = await auth();
  return isDemoEmail(session?.user?.email);
}
