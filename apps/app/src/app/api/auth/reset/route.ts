import { signOut } from "@/auth";

/** Clears a session whose user no longer exists (e.g. after a local database reset). */
export async function GET(req: Request) {
  const cb = new URL(req.url).searchParams.get("callbackUrl");
  const target = cb && cb.startsWith("/") ? `/sign-in?callbackUrl=${encodeURIComponent(cb)}` : "/sign-in";
  await signOut({ redirectTo: target });
}
