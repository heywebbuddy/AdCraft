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
      // Public: marketing, sign-in, API routes (they check auth themselves), invite acceptance
      // (redirects to sign-in with a callbackUrl when signed out) and client share links.
      const isPublic =
        ["/", "/sign-in"].includes(pathname) ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/invite") ||
        pathname.startsWith("/share");
      const isProtected = !isPublic;
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;
