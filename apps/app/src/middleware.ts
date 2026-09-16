import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge runtime: uses the adapter-free config. `authorized` callback in auth.config.ts
// gates the (app) route group (/dashboard/**) and redirects to /sign-in.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/dashboard/:path*"],
};
