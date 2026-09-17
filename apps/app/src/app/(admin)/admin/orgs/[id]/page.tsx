import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/workspace-ui";
import { PendingButton } from "@/components/pending-button";
import { requireAdmin, supportOrgId } from "@/server/admin";
import { loadOrgDetail } from "@/server/admin-data";
import { PLANS, type PlanId } from "@/server/billing";
import { addNote, adjustCredits, changePlan, reinstateOrg, removeMembership, retryGeneration, suspendOrg, viewAsOrg } from "@/server/admin-actions";
import { Chip, Empty, Flash, Panel, Table, ago, fmtDate, int, money, statusTone } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const TABS = [
  ["overview", "Overview"],
  ["members", "Members"],
  ["credits", "Credits"],
  ["brands", "Brands & products"],
  ["generations", "Generation events"],
  ["campaigns", "Ad accounts & campaigns"],
  ["notes", "Notes"],
] as const;
type Tab = (typeof TABS)[number][0];

const reasonLabel: Record<string, string> = {
  subscription_grant: "Plan credits",
  top_up: "Top up",
  generation: "Generation",
  refund: "Refund",
  adjustment: "Adjustment",
  expiry: "Expired",
};

const messages: Record<string, string> = {
  "ok:credits": "Credits adjusted and written to the ledger.",
  "ok:plan": "Plan changed. A new subscription row was recorded.",
  "ok:suspended": "Workspace suspended. Members now see the paused page; support can still open it.",
  "ok:reinstated": "Workspace reinstated.",
  "ok:note": "Note saved.",
  "ok:removed": "Member removed from the workspace.",
  "ok:retried": "Job re-dispatched. A fresh event appears once the pipeline starts.",
  "ok:marked": "Event marked. Nothing was re-run.",
  "error:delta": "Enter a non-zero whole number of credits.",
  "error:reason": "A reason (at least 3 characters) is required; it lands in the audit log.",
  "error:plan": "Pick a valid plan.",
  "error:note": "Write something first.",
  "error:state": "That event is not in a state that can be retried.",
};

export default async function AdminOrgDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { tab: rawTab, ok, error } = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "overview";
  const [d, viewingId] = await Promise.all([loadOrgDetail(id), supportOrgId()]);
  if (!d) notFound();
  const { org } = d;
  const planId = d.subscription?.plan && d.subscription.plan in PLANS ? (d.subscription.plan as PlanId) : null;
  const here = `/admin/orgs/${org.id}`;
  const viewing = viewingId === org.id;

  return (
    <>
      <PageHeader
        eyebrow={`Organisation · ${org.slug}`}
        title={org.name}
        description={
          <>
            Created {fmtDate(org.createdAt, false)} · {int(d.counts.members)} member{d.counts.members === 1 ? "" : "s"} · {planId ? PLANS[planId].name : "Trial"} · {int(d.credits.balance)} credits
            {org.suspendedAt ? <> · suspended {ago(org.suspendedAt)}</> : null}
          </>
        }
        actions={
          <>
            {org.suspendedAt ? <Chip tone="bad">Suspended</Chip> : <Chip tone="good">Active</Chip>}
            {viewing ? (
              <Link href="/dashboard" className="btn btn-outline">
                Open workspace (viewing)
              </Link>
            ) : (
              <form action={viewAsOrg}>
                <input type="hidden" name="orgId" value={org.id} />
                <PendingButton className="btn btn-dark" pendingLabel="Opening…">
                  View as support
                </PendingButton>
              </form>
            )}
          </>
        }
      />

      <Flash ok={ok} error={error} messages={messages} />

      <nav className="workspace-tabs admin-tabs" aria-label="Organisation sections">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`${here}?tab=${t}`} className={tab === t ? "active" : ""} aria-current={tab === t ? "page" : undefined}>
            {label}
            {t === "notes" && d.notes.length ? ` (${d.notes.length})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="admin-columns">
          <div className="admin-stack">
            <Panel title="At a glance" eyebrow="Usage">
              <div className="admin-panel-body">
                <dl className="admin-facts">
                  <div>
                    <dt>Credits balance</dt>
                    <dd>{int(d.credits.balance)}</dd>
                  </div>
                  <div>
                    <dt>Granted · spent</dt>
                    <dd>
                      {int(d.credits.granted)} <small>· {int(d.credits.spent)}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Creatives</dt>
                    <dd>{int(d.counts.creatives)}</dd>
                  </div>
                  <div>
                    <dt>Products</dt>
                    <dd>{int(d.counts.products)}</dd>
                  </div>
                  <div>
                    <dt>Brands</dt>
                    <dd>
                      {int(d.brands.length)} <small>of {planId ? PLANS[planId].brands : 1}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Generation cost</dt>
                    <dd>
                      {money(d.generation.cost)} <small>· {int(d.generation.credits)} cr</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Generations</dt>
                    <dd>
                      {int(d.generation.total)} <small>· {int(d.generation.failed)} failed</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Ad accounts</dt>
                    <dd>
                      {int(d.adAccounts.length)} <small>· {int(d.campaigns.length)} campaigns</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Stripe customer</dt>
                    <dd>
                      {org.stripeCustomerId ? (
                        <a href={`https://dashboard.stripe.com/customers/${org.stripeCustomerId}`} target="_blank" rel="noreferrer" className="link-quiet">
                          {org.stripeCustomerId}
                        </a>
                      ) : (
                        <small>not linked</small>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </Panel>

            <Panel title="Subscription history" eyebrow="Billing" note={d.subscriptions.length ? `${d.subscriptions.length} row${d.subscriptions.length === 1 ? "" : "s"}` : undefined}>
              {d.subscriptions.length === 0 ? (
                <Empty title="On trial">No subscription row yet. Changing the plan below writes one.</Empty>
              ) : (
                <Table minWidth={560}>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Status</th>
                      <th className="num">Credits / period</th>
                      <th>Period</th>
                      <th>Stripe</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.plan in PLANS ? PLANS[s.plan as PlanId].name : s.plan}</strong>
                        </td>
                        <td>
                          <Chip tone={statusTone(s.status)}>{s.status}</Chip>
                        </td>
                        <td className="num">{int(s.creditsPerPeriod)}</td>
                        <td className="muted">
                          {fmtDate(s.currentPeriodStart, false)} → {fmtDate(s.currentPeriodEnd, false)}
                        </td>
                        <td className="muted">{s.stripeSubscriptionId ? <code>{s.stripeSubscriptionId}</code> : "manual"}</td>
                        <td className="muted">{fmtDate(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>
          </div>

          <aside className="admin-stack">
            <Panel title="Change plan" eyebrow="Action">
              <form action={changePlan} className="admin-panel-body admin-form">
                <input type="hidden" name="orgId" value={org.id} />
                <label>
                  <span>
                    Plan <small>current: {planId ? PLANS[planId].name : "Trial"}</small>
                  </span>
                  <select name="plan" defaultValue={planId ?? "starter"}>
                    {(Object.keys(PLANS) as PlanId[]).map((p) => (
                      <option key={p} value={p}>
                        {PLANS[p].name} · ${PLANS[p].price}/mo · {PLANS[p].credits} credits
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" name="grant" defaultChecked />
                  Also grant the plan’s monthly credits now
                </label>
                <p>Writes a subscription row the same way a Stripe-less purchase does. Does not touch Stripe.</p>
                <div className="admin-form-actions">
                  <PendingButton className="btn btn-dark" pendingLabel="Saving…">
                    Change plan
                  </PendingButton>
                </div>
              </form>
            </Panel>

            <Panel title={org.suspendedAt ? "Reinstate workspace" : "Suspend workspace"} eyebrow="Action">
              {org.suspendedAt ? (
                <form action={reinstateOrg} className="admin-panel-body admin-form">
                  <input type="hidden" name="orgId" value={org.id} />
                  <p>Suspended {fmtDate(org.suspendedAt)}. Reinstating lets members back in immediately.</p>
                  <div className="admin-form-actions">
                    <PendingButton className="btn btn-dark" pendingLabel="Reinstating…">
                      Reinstate
                    </PendingButton>
                  </div>
                </form>
              ) : (
                <form action={suspendOrg} className="admin-panel-body admin-form">
                  <input type="hidden" name="orgId" value={org.id} />
                  <label>
                    <span>
                      Reason <small>audit log only</small>
                    </span>
                    <input name="reason" placeholder="Chargeback, policy, customer request…" />
                  </label>
                  <p>Members see a paused page and cannot open the workspace. Nothing is deleted; support can still view it.</p>
                  <div className="admin-form-actions">
                    <PendingButton className="btn btn-outline btn-danger" pendingLabel="Suspending…">
                      Suspend
                    </PendingButton>
                  </div>
                </form>
              )}
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "members" ? (
        <Panel title={`${int(d.members.length)} member${d.members.length === 1 ? "" : "s"}`} eyebrow="People">
          {d.members.length === 0 ? (
            <Empty title="No members">Every workspace normally has at least one owner. This one is orphaned.</Empty>
          ) : (
            <Table minWidth={640}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="cell-primary">
                        <strong>
                          {m.name ?? m.email} {m.isPlatformAdmin ? <Chip tone="ink" plain>Admin</Chip> : null}
                        </strong>
                        <small>{m.email}</small>
                      </span>
                    </td>
                    <td>
                      <Chip>{m.role}</Chip>
                    </td>
                    <td className="muted">{fmtDate(m.joinedAt, false)}</td>
                    <td>
                      <div className="row-actions">
                        <Link href={`/admin/users?q=${encodeURIComponent(m.email ?? "")}`} className="link-quiet">
                          User
                        </Link>
                        {m.userId !== admin.userId ? (
                          <form action={removeMembership}>
                            <input type="hidden" name="membershipId" value={m.id} />
                            <input type="hidden" name="back" value={`${here}?tab=members&ok=removed`} />
                            <PendingButton className="btn btn-outline btn-sm btn-danger" pendingLabel="Removing…">
                              Remove
                            </PendingButton>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      ) : null}

      {tab === "credits" ? (
        <div className="admin-columns">
          <Panel title="Credit ledger" eyebrow={`Balance ${int(d.credits.balance)}`} note={`last ${Math.min(100, d.ledger.length)} entries`}>
            {d.ledger.length === 0 ? (
              <Empty title="Empty ledger">Grants and spends appear here. Adjust credits on the right to add the first entry.</Empty>
            ) : (
              <Table minWidth={560}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reason</th>
                    <th>Reference</th>
                    <th className="num">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {d.ledger.map((l) => {
                    const meta = (l.meta ?? {}) as Record<string, unknown>;
                    return (
                      <tr key={l.id}>
                        <td className="muted">{fmtDate(l.createdAt)}</td>
                        <td>
                          <span className="cell-primary">
                            <strong>{reasonLabel[l.reason] ?? l.reason}</strong>
                            {typeof meta.reason === "string" ? <small>{meta.reason}</small> : typeof meta.model === "string" ? <small>{meta.model}</small> : null}
                          </span>
                        </td>
                        <td className="muted">
                          <code>{l.referenceId ?? "—"}</code>
                        </td>
                        <td className="num" style={{ color: l.delta < 0 ? "var(--bad)" : "var(--good)", fontWeight: 600 }}>
                          {l.delta > 0 ? "+" : ""}
                          {int(l.delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>
          <Panel title="Adjust credits" eyebrow="Action">
            <form action={adjustCredits} className="admin-panel-body admin-form">
              <input type="hidden" name="orgId" value={org.id} />
              <label>
                <span>
                  Credits <small>negative to remove</small>
                </span>
                <input name="delta" type="number" step="1" required placeholder="50" />
              </label>
              <label>
                <span>
                  Reason <small>required, shown in the audit log</small>
                </span>
                <input name="reason" required minLength={3} placeholder="Goodwill after failed renders" />
              </label>
              <p>Writes an “adjustment” row to the ledger, referenced to you and the time.</p>
              <div className="admin-form-actions">
                <PendingButton className="btn btn-dark" pendingLabel="Saving…">
                  Apply adjustment
                </PendingButton>
              </div>
            </form>
          </Panel>
        </div>
      ) : null}

      {tab === "brands" ? (
        <Panel title={`${int(d.brands.length)} brand${d.brands.length === 1 ? "" : "s"}`} eyebrow="Brands & products" note={`${int(d.counts.products)} products`}>
          {d.brands.length === 0 ? (
            <Empty title="No brands">Onboarding always creates one; this workspace may have deleted it.</Empty>
          ) : (
            <Table minWidth={520}>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Industry</th>
                  <th className="num">Products</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {d.brands.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="cell-primary">
                        <strong>{b.name}</strong>
                        <small>{b.website ?? "no website"}</small>
                      </span>
                    </td>
                    <td className="muted">{b.industry ?? "—"}</td>
                    <td className="num">{int(b.products)}</td>
                    <td className="muted">{fmtDate(b.createdAt, false)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      ) : null}

      {tab === "generations" ? (
        <Panel title="Generation events" eyebrow={`${int(d.generation.total)} total · ${money(d.generation.cost)}`} note={<Link href={`/admin/generations?org=${org.id}`} className="link-quiet">Filter platform-wide</Link>}>
          {d.events.length === 0 ? (
            <Empty title="Nothing generated yet" />
          ) : (
            <Table minWidth={820}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Provider · model</th>
                  <th>Status</th>
                  <th className="num">Cost</th>
                  <th className="num">Credits</th>
                  <th className="num">Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.events.map((e) => {
                  const meta = (e.meta ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={e.id}>
                      <td className="muted" title={fmtDate(e.createdAt)}>
                        {ago(e.createdAt)}
                      </td>
                      <td>
                        <span className="cell-primary">
                          <strong>{typeof meta.label === "string" ? meta.label : e.capability}</strong>
                          <small>{e.status === "failed" ? <span style={{ color: "var(--bad)" }}>{e.error ?? "failed"}</span> : typeof meta.detail === "string" ? meta.detail : e.capability}</small>
                        </span>
                      </td>
                      <td className="muted">
                        {e.provider} · {e.model || "—"}
                      </td>
                      <td>
                        <Chip tone={statusTone(e.status)}>{e.status}</Chip>
                      </td>
                      <td className="num">{e.costUsd != null ? money(Number(e.costUsd), 4) : "—"}</td>
                      <td className="num">{int(e.credits)}</td>
                      <td className="num muted">{e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td>
                        {e.status === "failed" ? (
                          <form action={retryGeneration} className="row-actions">
                            <input type="hidden" name="eventId" value={e.id} />
                            <input type="hidden" name="back" value={`${here}?tab=generations`} />
                            <PendingButton className="btn btn-outline btn-sm" pendingLabel="…">
                              Retry
                            </PendingButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>
      ) : null}

      {tab === "campaigns" ? (
        <div className="admin-stack">
          <Panel title={`${int(d.adAccounts.length)} ad account${d.adAccounts.length === 1 ? "" : "s"}`} eyebrow="Connections">
            {d.adAccounts.length === 0 ? (
              <Empty title="No ad accounts connected" />
            ) : (
              <Table minWidth={640}>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Platform</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Token expires</th>
                    <th>Last synced</th>
                  </tr>
                </thead>
                <tbody>
                  {d.adAccounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span className="cell-primary">
                          <strong>{a.name ?? a.externalId}</strong>
                          <small>{a.externalId}</small>
                        </span>
                      </td>
                      <td>{a.platform}</td>
                      <td>{a.externalId.startsWith("sandbox") ? <Chip plain>Sandbox</Chip> : <Chip tone="ink" plain>Live</Chip>}</td>
                      <td>
                        <Chip tone={statusTone(a.status)}>{a.status}</Chip>
                      </td>
                      <td className="muted">{a.tokenExpiresAt ? fmtDate(a.tokenExpiresAt) : "—"}</td>
                      <td className="muted">{a.lastSyncedAt ? ago(a.lastSyncedAt) : "never"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          <Panel title={`${int(d.campaigns.length)} campaign${d.campaigns.length === 1 ? "" : "s"}`} eyebrow="Campaigns">
            {d.campaigns.length === 0 ? (
              <Empty title="No campaigns yet" />
            ) : (
              <Table minWidth={640}>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th className="num">Daily budget</th>
                    <th>Last synced</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {d.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="cell-primary">
                          <strong>{c.name}</strong>
                          <small>
                            {c.objective ?? "—"} · {c.externalId}
                          </small>
                        </span>
                      </td>
                      <td>{c.platform}</td>
                      <td>
                        <Chip tone={statusTone(c.status)}>{c.status}</Chip>
                      </td>
                      <td className="num">{c.dailyBudgetMinor != null ? money(c.dailyBudgetMinor / 100) : "—"}</td>
                      <td className="muted">{c.lastSyncedAt ? ago(c.lastSyncedAt) : "never"}</td>
                      <td className="muted">{fmtDate(c.createdAt, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "notes" ? (
        <div className="admin-columns">
          <Panel title="Support notes" eyebrow="Internal · never shown to customers" note={d.notes.length ? `${d.notes.length}` : undefined}>
            {d.notes.length === 0 ? (
              <Empty title="No notes yet">Leave context for the next person: what the customer asked, what you changed, what to watch.</Empty>
            ) : (
              <ul className="admin-list">
                {d.notes.map((n) => (
                  <li key={n.id}>
                    <span className="who">{(n.authorName ?? n.authorEmail ?? "?").slice(0, 1).toUpperCase()}</span>
                    <span className="body">
                      <strong>{n.authorName ?? n.authorEmail ?? "Former admin"}</strong>
                      <small className="admin-note" style={{ whiteSpace: "pre-wrap", color: "var(--ink)" }}>
                        {n.body}
                      </small>
                    </span>
                    <span className="when" title={fmtDate(n.createdAt)}>
                      {ago(n.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Add a note" eyebrow="Action">
            <form action={addNote} className="admin-panel-body admin-form">
              <input type="hidden" name="orgId" value={org.id} />
              <label>
                Note
                <textarea name="body" required maxLength={4000} placeholder="Customer wrote in about…" />
              </label>
              <div className="admin-form-actions">
                <PendingButton className="btn btn-dark" pendingLabel="Saving…">
                  Save note
                </PendingButton>
              </div>
            </form>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
