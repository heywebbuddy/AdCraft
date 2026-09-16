import { signOut } from "@/auth";

/** Clears a session whose user no longer exists (e.g. after a local database reset). */
export async function GET() {
  await signOut({ redirectTo: "/sign-in" });
}
