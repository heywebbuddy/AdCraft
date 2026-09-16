import "server-only";
import Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import { db, creditLedger, organizations, subscriptions } from "@adcraft/db";

export type PlanId = "starter" | "studio" | "agency";

export const PLANS: Record<PlanId, { name: string; price: number; credits: number; brands: number; blurb: string; items: string[] }> = {
  starter: {
    name: "Starter",
    price: 29,
    credits: 150,
    brands: 1,
    blurb: "For your first “let’s try this.”",
    items: ["1 brand workspace", "Static ads and carousels", "UGC video access", "Core export formats", "2 ad accounts"],
  },
  studio: {
    name: "Studio",
    price: 79,
    credits: 500,
    brands: 3,
    blurb: "For brands with more to say.",
    items: ["3 brand workspaces", "Everything in Starter", "Video priority", "Variations and resizing", "Team review and approvals", "5 ad accounts"],
  },
  agency: {
    name: "Agency",
    price: 199,
    credits: 1500,
    brands: 10,
    blurb: "For a whole world of brands.",
    items: ["10 brand workspaces", "Everything in Studio", "Client review workspaces", "Shared templates and brand kits", "Priority generation queue"],
  },
};

export const TOP_UP = { price: 10, credits: 100 };

/** Credits per action, from PLAN.md section 5. */
export const CREDIT_COSTS = { concepts: 1, staticAd: 2, productVideo15s: 20, ugcVideo30s: 40, resize: 0 } as const;

export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

let stripeClient: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export async function currentSubscription(orgId: string) {
  return db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.orgId, orgId)),
    orderBy: desc(subscriptions.createdAt),
  });
}

export async function ledgerHistory(orgId: string, limit = 20) {
  return db.select().from(creditLedger).where(eq(creditLedger.orgId, orgId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
}

export async function ensureStripeCustomer(orgId: string, email: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) throw new Error("Organisation not found");
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe().customers.create({ name: org.name, email, metadata: { orgId } });
  await db.update(organizations).set({ stripeCustomerId: customer.id }).where(eq(organizations.id, orgId));
  return customer.id;
}

/** Grants credits idempotently (referenceId is unique per org + reason). */
export async function grantCredits(orgId: string, delta: number, reason: "subscription_grant" | "top_up" | "adjustment", referenceId: string, meta?: Record<string, unknown>) {
  await db
    .insert(creditLedger)
    .values({ orgId, delta, reason, referenceId, meta })
    .onConflictDoNothing();
}

export function priceIdFor(plan: PlanId, interval: "month" | "year") {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  return process.env[key] ?? null;
}
