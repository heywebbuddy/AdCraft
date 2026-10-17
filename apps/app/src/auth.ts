import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { renderEmail } from "@/lib/email-template";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, dbReady, users, accounts, sessions, verificationTokens } from "@adcraft/db";
import { authConfig } from "./auth.config";
import { DEMO_ADMIN_EMAIL, DEMO_STUDIO_EMAIL, isDemoEmail } from "@/lib/demo";

/**
 * Read-only public demo (server/demo.ts). With DEMO_MODE on, the sign-in page's two doors sign
 * the visitor into a shared demo account through this provider: no password, no email. The
 * account is chosen by door name only, so nothing a visitor types can pick another account.
 */
const demoModeOn = ["1", "true", "yes", "on"].includes((process.env.DEMO_MODE ?? "").trim().toLowerCase());

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
          from: process.env.EMAIL_FROM || "Adcraft <onboarding@resend.dev>",
          // Branded magic-link email (default is Auth.js's grey "Sign in to host:port" card).
          async sendVerificationRequest({ identifier, url, provider }) {
            const { html, text } = renderEmail({
              preview: "Your one-time sign-in link for Adcraft.",
              title: "Your sign-in link",
              kicker: "Let’s make something.",
              paragraphs: [`Click the button to sign in to Adcraft as ${identifier}. The link works once and expires in 24 hours.`],
              cta: { label: "Sign in to Adcraft", url },
              note: "If you didn’t request this email, you can safely ignore it — nobody can sign in without the link.",
            });
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: provider.from, to: identifier, subject: "Sign in to Adcraft", html, text }),
            });
            if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
          },
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
            // Demo-world addresses only open through the demo doors.
            if (isDemoEmail(email)) return null;
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
  ...(demoModeOn
    ? [
        Credentials({
          id: "demo",
          name: "Demo",
          credentials: { door: { label: "Door", type: "text" } },
          async authorize(credentials) {
            const door = String(credentials?.door ?? "");
            if (door !== "studio" && door !== "admin") return null;
            // Creates the demo world the first time anyone knocks (idempotent; usually already
            // done at startup by instrumentation.ts).
            const { ensureDemoWorld } = await import("@/server/demo-seed");
            await ensureDemoWorld();
            const email = door === "admin" ? DEMO_ADMIN_EMAIL : DEMO_STUDIO_EMAIL;
            await dbReady;
            const user = await db.query.users.findFirst({ where: eq(users.email, email) });
            return user ? { id: user.id, email: user.email, name: user.name } : null;
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
    /**
     * Demo-world addresses (`@demo.invalid`) sign in through the demo doors and nothing else:
     * no magic link is ever sent to one, no Google account can claim one, and with DEMO_MODE off
     * they cannot sign in at all.
     */
    signIn({ user, account, email }) {
      const address = user?.email ?? (email as { email?: string } | undefined)?.email ?? null;
      if (!isDemoEmail(address)) return true;
      return demoModeOn && account?.provider === "demo";
    },
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
