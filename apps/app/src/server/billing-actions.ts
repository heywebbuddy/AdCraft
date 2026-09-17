"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, subscriptions } from "@adcraft/db";
import { requireOrg } from "./org";
import { PLANS, TOP_UP, ensureStripeCustomer, grantCredits, priceIdFor, stripe, stripeConfigured, type PlanId } from "./billing";

async function baseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function startCheckout(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings/billing?error=owner");
  const plan = String(formData.get("plan")) as PlanId;
  const interval = (String(formData.get("interval") ?? "month") === "year" ? "year" : "month") as "month" | "year";
  if (!PLANS[plan]) redirect("/settings/billing?error=plan");

  if (!stripeConfigured) {
    // Local development: emulate the purchase so the product can be exercised.
    await db.insert(subscriptions).values({
      orgId: ctx.org.id,
      plan,
      status: "active",
      creditsPerPeriod: PLANS[plan].credits,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400e3),
    });
    await grantCredits(ctx.org.id, PLANS[plan].credits, "subscription_grant", `dev:${plan}:${Date.now()}`, { plan, dev: true });
    redirect("/settings/billing?ok=dev");
  }

  const priceId = priceIdFor(plan, interval);
  if (!priceId) redirect("/settings/billing?error=price");
  const customer = await ensureStripeCustomer(ctx.org.id, ctx.viewer.email);
  const url = await baseUrl();
  const session = await stripeCall(() =>
    stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${url}/settings/billing?ok=1`,
      cancel_url: `${url}/settings/billing`,
      metadata: { orgId: ctx.org.id, plan },
      subscription_data: { metadata: { orgId: ctx.org.id, plan } },
    }),
  );
  redirect(session.url!);
}

/**
 * Runs a Stripe request; a Stripe-side rejection (misconfigured price, tax settings,
 * portal not set up) is logged and sent back to the billing page instead of a 500.
 */
async function stripeCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[billing] Stripe request failed", err);
    redirect("/settings/billing?error=stripe");
  }
}

export async function startTopUp() {
  const ctx = await requireOrg();
  if (!stripeConfigured) {
    await grantCredits(ctx.org.id, TOP_UP.credits, "top_up", `dev:topup:${Date.now()}`, { dev: true });
    redirect("/settings/billing?ok=dev");
  }
  const priceId = process.env.STRIPE_PRICE_TOPUP;
  if (!priceId) redirect("/settings/billing?error=price");
  const customer = await ensureStripeCustomer(ctx.org.id, ctx.viewer.email);
  const url = await baseUrl();
  const session = await stripeCall(() =>
    stripe().checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${url}/settings/billing?ok=1`,
      cancel_url: `${url}/settings/billing`,
      metadata: { orgId: ctx.org.id, topup: String(TOP_UP.credits) },
    }),
  );
  redirect(session.url!);
}

export async function openPortal() {
  const ctx = await requireOrg();
  if (!stripeConfigured) redirect("/settings/billing");
  const customer = await ensureStripeCustomer(ctx.org.id, ctx.viewer.email);
  const url = await baseUrl();
  const session = await stripeCall(() => stripe().billingPortal.sessions.create({ customer, return_url: `${url}/settings/billing` }));
  redirect(session.url);
}

export async function updateOrgName(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const { organizations } = await import("@adcraft/db");
  await db.update(organizations).set({ name }).where(eq(organizations.id, ctx.org.id));
  redirect("/settings?ok=1");
}
