import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, dbReady, users, accounts, sessions, verificationTokens } from "@adcraft/db";
import { authConfig } from "./auth.config";

/**
 * Local development: outside production a "dev sign-in" provider accepts any email
 * and creates the user on the fly, so test accounts on fake domains keep working
 * even once Resend magic links are configured. Set DEV_LOGIN=0 to hide it.
 */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN !== "0";

const providers = [
  ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
  ...(process.env.RESEND_API_KEY
    ? [
        Resend({
          apiKey: process.env.RESEND_API_KEY,
          from: process.env.EMAIL_FROM ?? "Adcraft <login@adcraft.app>",
        }),
      ]
    : []),
  ...(devLoginEnabled
    ? [
        Credentials({
          id: "dev",
          name: "Dev sign-in",
          credentials: { email: { label: "Email", type: "email" } },
          async authorize(credentials) {
            const email = String(credentials?.email ?? "").trim().toLowerCase();
            if (!email.includes("@")) return null;
            await dbReady;
            const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
            if (existing) return { id: existing.id, email: existing.email, name: existing.name };
            const [created] = await db
              .insert(users)
              .values({ email, name: email.split("@")[0], emailVerified: new Date() })
              .returning();
            return { id: created.id, email: created.email, name: created.name };
          },
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT sessions so the Credentials dev provider works; users/accounts still persist via the adapter.
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        // Platform admins: promote emails listed in ADMIN_EMAILS the moment they sign in.
        const listed = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
        if (user.email && listed.includes(user.email.toLowerCase())) {
          await dbReady;
          await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
