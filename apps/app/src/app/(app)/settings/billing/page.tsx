import { PageHeader } from "@/components/workspace-ui";
import { SettingsNav } from "@/components/settings-nav";
import { requireOrg } from "@/server/org";
import { PLANS, TOP_UP, CREDIT_COSTS, currentSubscription, ledgerHistory, stripeConfigured, type PlanId } from "@/server/billing";
import { openPortal, startCheckout, startTopUp } from "@/server/billing-actions";

export const dynamic = "force-dynamic";

const reasonLabel: Record<string, string> = {
  subscription_grant: "Plan credits",
  top_up: "Top up",
  generation: "Generation",
  refund: "Refund",
  adjustment: "Adjustment",
  expiry: "Expired",
};

/** Ledger meta: a plan id ("trial", "studio") reads as a label, anything else as typed. */
function ledgerNote(meta: Record<string, unknown> | null | undefined) {
  const label = meta?.label as string | undefined;
  if (label) return label;
  const plan = meta?.plan as string | undefined;
  if (!plan) return "";
  if (plan === "trial") return "Trial credits";
  return plan in PLANS ? `${PLANS[plan as PlanId].name} plan` : plan;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const ctx = await requireOrg();
  const { ok, error } = await searchParams;
  const [sub, history] = await Promise.all([currentSubscription(ctx.org.id), ledgerHistory(ctx.org.id)]);
  const planId = (sub?.plan ?? null) as PlanId | null;

  return (
    <>
      <PageHeader title="Plan and credits" description="Manage your subscription, generation credits, and billing history."/>

      <SettingsNav active="billing" role={ctx.role} />

      {ok === "dev" ? (
        <p className="panel m-0 border-dashed px-4 py-3 text-[13px] text-muted">
          Stripe is not configured, so this purchase was simulated and credits were added. Set STRIPE_SECRET_KEY and price ids to take real payments.
        </p>
      ) : null}
      {ok === "1" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Payment received. Credits land as soon as Stripe confirms.</p> : null}
      {error === "owner" ? <p className="m-0 text-[13px] text-orange">Only workspace owners can change the plan.</p> : null}
      {error === "price" ? <p className="m-0 text-[13px] text-orange">Stripe price ids are missing from the environment.</p> : null}
      {error === "stripe" ? <p className="m-0 text-[13px] text-orange">Stripe rejected the request. Check the server log and your Stripe dashboard settings, then try again.</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const current = planId === id;
          const popular = id === "studio";
          return (
            <section key={id} className={`panel relative flex flex-col gap-4 p-6 ${popular ? "border-ink" : ""}`}>
              {popular ? <span className="absolute -top-2.5 left-5 rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-white">Most room to create</span> : null}
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold">{p.name}</span>
                <span className="text-[13px] text-muted">{p.blurb}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-[34px] font-medium tracking-[-1.5px]">${p.price}</span>
                <span className="text-[13px] text-muted">/ month · {p.credits} credits</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {p.items.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="text-ink">✓</span>
                    {x}
                  </li>
                ))}
              </ul>
              <form action={startCheckout} className="mt-auto">
                <input type="hidden" name="plan" value={id} />
                <input type="hidden" name="interval" value="month" />
                <button className={`btn h-11 w-full justify-between ${popular ? "btn-orange" : "btn-outline"}`} disabled={current}>
                  {current ? "Current plan" : `Choose ${p.name}`} <span aria-hidden="true">↗︎</span>
                </button>
              </form>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Credit history</span>
            <span className="text-[11px] text-muted">Latest 20</span>
          </div>
          {history.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No activity yet.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="py-2 pr-3 text-muted">{h.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                    <td className="py-2 pr-3">{reasonLabel[h.reason] ?? h.reason}</td>
                    <td className="py-2 pr-3 text-muted">{ledgerNote(h.meta)}</td>
                    <td className={`tabular py-2 text-right font-semibold ${h.delta < 0 ? "" : "text-[#3f7a55]"}`}>
                      {h.delta > 0 ? "+" : ""}
                      {h.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel flex flex-col gap-3 p-5">
            <span className="eyebrow">Top up</span>
            <p className="m-0 text-[13px] text-muted">
              {TOP_UP.credits} credits for ${TOP_UP.price}. They never expire while your plan is active.
            </p>
            <form action={startTopUp}>
              <button className="btn btn-dark h-11 w-full justify-between">
                Buy {TOP_UP.credits} credits <span aria-hidden="true">↗︎</span>
              </button>
            </form>
            {stripeConfigured && sub?.stripeSubscriptionId ? (
              <form action={openPortal}>
                <button className="text-[12px] font-semibold text-orange">Manage payment method and invoices</button>
              </form>
            ) : null}
          </section>
          <section className="panel flex flex-col gap-2 p-5 text-[13px]">
            <span className="eyebrow">What things cost</span>
            <div className="flex justify-between"><span>Concept set (10 hooks with copy)</span><span className="tabular font-semibold">{CREDIT_COSTS.concepts}</span></div>
            <div className="flex justify-between"><span>Static ad, every size</span><span className="tabular font-semibold">{CREDIT_COSTS.staticAd}</span></div>
            <div className="flex justify-between"><span>Product video, 15 s</span><span className="tabular font-semibold">{CREDIT_COSTS.productVideo15s}</span></div>
            <div className="flex justify-between"><span>UGC video, 30 s</span><span className="tabular font-semibold">{CREDIT_COSTS.ugcVideo30s}</span></div>
            <div className="flex justify-between text-muted"><span>Resize existing creative</span><span className="tabular font-semibold">free</span></div>
            <p className="m-0 mt-1 text-[12px] text-muted">Ad spend is billed by the platforms to your own ad accounts, never through Adcraft.</p>
          </section>
        </div>
      </div>
    </>
  );
}
