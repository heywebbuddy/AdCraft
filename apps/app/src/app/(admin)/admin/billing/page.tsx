import Link from "next/link";
import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { loadBilling } from "@/server/admin-data";
import { PLANS, TOP_UP, stripeConfigured, type PlanId } from "@/server/billing";
import { Chip, Empty, Kpi, Kpis, Panel, Table, ago, fmtDate, int, money, statusTone } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  await requireAdmin();
  const b = await loadBilling();
  const paid = b.distribution.starter + b.distribution.studio + b.distribution.agency;
  const bars: Array<[string, number]> = [
    ["Trial", b.distribution.trial],
    [PLANS.starter.name, b.distribution.starter],
    [PLANS.studio.name, b.distribution.studio],
    [PLANS.agency.name, b.distribution.agency],
  ];
  const maxBar = Math.max(1, ...bars.map(([, n]) => n));

  return (
    <>
      <PageHeader
        title="Billing"
        description={
          <>
            Subscriptions, plan mix and top-ups across the platform. MRR is the sum of list prices for active subscriptions.{" "}
            {stripeConfigured ? "Stripe is connected." : "Stripe is not configured: subscriptions here were simulated or set by an admin."}
          </>
        }
      />

      <Kpis label="Billing summary">
        <Kpi label="MRR" value={money(b.mrr, 0)} sub={`${int(paid)} paying`} />
        <Kpi label="Workspaces" value={int(b.orgsTotal)} sub={`${int(b.distribution.trial)} on trial`} href="/admin/orgs" />
        <Kpi label="Stripe customers" value={int(b.stripeLinked)} sub={`of ${int(b.orgsTotal)}`} />
        <Kpi label="Top-ups" value={int(b.topUps.length)} sub={`${int(b.topUpTotal)} credits`} />
        <Kpi label="Top-up revenue" value={money((b.topUpTotal / TOP_UP.credits) * TOP_UP.price, 0)} sub={`at $${TOP_UP.price}/${TOP_UP.credits}`} />
      </Kpis>

      <div className="admin-columns">
        <div className="admin-stack">
          <Panel title="Subscriptions" eyebrow="Newest first" note={`${b.subscriptions.length} row${b.subscriptions.length === 1 ? "" : "s"}`}>
            {b.subscriptions.length === 0 ? (
              <Empty title="No subscriptions yet">Every workspace is on trial. Change a plan from an organisation page or let Stripe create one.</Empty>
            ) : (
              <Table minWidth={820}>
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th className="num">$/mo</th>
                    <th className="num">Credits</th>
                    <th>Period ends</th>
                    <th>Stripe</th>
                  </tr>
                </thead>
                <tbody>
                  {b.subscriptions.map((s) => {
                    const plan = s.plan in PLANS ? PLANS[s.plan as PlanId] : null;
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/admin/orgs/${s.orgId}`} className="row-link cell-primary">
                            <strong>{s.orgName}</strong>
                            <small>started {fmtDate(s.createdAt, false)}</small>
                          </Link>
                        </td>
                        <td>{plan?.name ?? s.plan}</td>
                        <td>
                          <Chip tone={statusTone(s.status)}>{s.status}</Chip>
                        </td>
                        <td className="num">{plan ? money(plan.price, 0) : "—"}</td>
                        <td className="num">{int(s.creditsPerPeriod)}</td>
                        <td className="muted">{fmtDate(s.currentPeriodEnd, false)}</td>
                        <td>
                          {s.stripeCustomerId ? (
                            <a href={`https://dashboard.stripe.com/customers/${s.stripeCustomerId}`} target="_blank" rel="noreferrer" className="link-quiet">
                              {s.stripeSubscriptionId ? "Subscription ↗" : "Customer ↗"}
                            </a>
                          ) : (
                            <span className="muted">manual</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel title="Top-ups" eyebrow="Credit purchases" note={`${int(b.topUpTotal)} credits`}>
            {b.topUps.length === 0 ? (
              <Empty title="No top-ups yet" />
            ) : (
              <Table minWidth={520}>
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>When</th>
                    <th>Reference</th>
                    <th className="num">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {b.topUps.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/admin/orgs/${t.orgId}?tab=credits`} className="link-quiet">
                          {t.orgName}
                        </Link>
                      </td>
                      <td className="muted">{ago(t.createdAt)}</td>
                      <td>
                        <code>{t.referenceId ?? "—"}</code>
                      </td>
                      <td className="num">+{int(t.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>

        <aside className="admin-stack">
          <Panel title="Plan distribution" eyebrow="Current plan per workspace">
            <div className="admin-panel-body">
              <div className="admin-bars">
                {bars.map(([label, n]) => (
                  <div key={label} className="admin-bar">
                    <span>{label}</span>
                    <span className="track">
                      <span style={{ width: `${(n / maxBar) * 100}%` }} />
                    </span>
                    <span className="num">{int(n)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Price list" eyebrow="From PLANS">
            <Table minWidth={280}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Price</th>
                  <th className="num">Credits</th>
                  <th className="num">Brands</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PLANS) as PlanId[]).map((p) => (
                  <tr key={p}>
                    <td>{PLANS[p].name}</td>
                    <td className="num">{money(PLANS[p].price, 0)}</td>
                    <td className="num">{int(PLANS[p].credits)}</td>
                    <td className="num">{PLANS[p].brands}</td>
                  </tr>
                ))}
                <tr>
                  <td>Top-up</td>
                  <td className="num">{money(TOP_UP.price, 0)}</td>
                  <td className="num">{TOP_UP.credits}</td>
                  <td className="num">—</td>
                </tr>
              </tbody>
            </Table>
          </Panel>
        </aside>
      </div>
    </>
  );
}
