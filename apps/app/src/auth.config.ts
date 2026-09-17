import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe config (no database adapter). Used by middleware.
 * The full config with the Drizzle adapter + Resend lives in `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/sign-in", verifyRequest: "/check-email" },
  providers: [Google],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      // Public: marketing, sign-in, API routes (they check auth themselves), invite acceptance
      // (redirects to sign-in with a callbackUrl when signed out) and client share links.
      const isPublic =
        ["/", "/sign-in", "/check-email", "/showcase", "/pricing"].includes(pathname) ||
        /\.[a-z0-9]+$/i.test(pathname) || // static files from public/ (marketing site assets)
        pathname.startsWith("/api/") ||
        pathname.startsWith("/invite") ||
        pathname.startsWith("/share");
      if (isPublic || isLoggedIn) return true;
      // Send signed-out visitors to sign-in with only the callback (Auth.js would otherwise
      // copy the original query string onto /sign-in as well).
      const target = new URL("/sign-in", request.nextUrl.origin);
      target.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
      return Response.redirect(target);
    },
  },
} satisfies NextAuthConfig;
