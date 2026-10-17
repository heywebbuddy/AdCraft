import { signOut } from "@/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";

/** Clears a session whose user no longer exists (e.g. after a local database reset). */
export async function GET(req: Request) {
  const cb = safeRedirectPath(new URL(req.url).searchParams.get("callbackUrl"), "");
  const target = cb ? `/sign-in?callbackUrl=${encodeURIComponent(cb)}` : "/sign-in";
  await signOut({ redirectTo: target });
}
