import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, dbReady, subscriptions } from "@adcraft/db";
import { PLANS, grantCredits, stripe, type PlanId } from "@/server/billing";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Webhook not configured", { status: 501 });
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig ?? "", secret);
  } catch (err) {
    return new NextResponse(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }
  await dbReady;

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const orgId = s.metadata?.orgId;
      if (!orgId) break;
      if (s.mode === "payment" && s.metadata?.topup) {
        await grantCredits(orgId, Number(s.metadata.topup), "top_up", s.id, { checkout: s.id });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const orgId = sub.metadata?.orgId;
      const plan = (sub.metadata?.plan ?? "starter") as PlanId;
      if (!orgId) break;
      const status = (
        { active: "active", trialing: "trialing", past_due: "past_due", canceled: "canceled", incomplete: "incomplete", paused: "paused" } as Record<string, string>
      )[sub.status] ?? "incomplete";
      const item = sub.items.data[0];
      const values = {
        orgId,
        stripeSubscriptionId: sub.id,
        stripePriceId: item?.price.id ?? null,
        plan,
        status: status as typeof subscriptions.$inferInsert.status,
        creditsPerPeriod: PLANS[plan]?.credits ?? 0,
        currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
        currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
      };
      const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.stripeSubscriptionId, sub.id) });
      if (existing) await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
      else await db.insert(subscriptions).values(values);
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object;
      const subId = typeof inv.parent?.subscription_details?.subscription === "string" ? inv.parent.subscription_details.subscription : null;
      if (!subId) break;
      const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.stripeSubscriptionId, subId) });
      if (!sub) break;
      // Monthly grant, idempotent on the invoice id.
      await grantCredits(sub.orgId, sub.creditsPerPeriod, "subscription_grant", inv.id, { invoice: inv.id, plan: sub.plan });
      break;
    }
  }
  return NextResponse.json({ received: true });
}
