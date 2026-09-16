import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe config (no database adapter). Used by middleware.
 * The full config with the Drizzle adapter + Resend lives in `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/sign-in" },
  providers: [Google],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      const isProtected = pathname.startsWith("/dashboard");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
