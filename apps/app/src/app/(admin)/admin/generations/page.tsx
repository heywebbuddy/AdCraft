import Link from "next/link";
import { PageHeader } from "@/components/workspace-ui";
import { PendingButton } from "@/components/pending-button";
import { requireAdmin } from "@/server/admin";
import { listGenerations, orgNameMap, USD_PER_CREDIT } from "@/server/admin-data";
import { markGeneration, retryGeneration } from "@/server/admin-actions";
import { Chip, Empty, Flash, Kpi, Kpis, Panel, Table, ago, fmtDate, int, money, pct, statusTone } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type Search = { provider?: string; model?: string; status?: string; org?: string; from?: string; to?: string; ok?: string; error?: string };

export default async function AdminGenerationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = { provider: sp.provider, model: sp.model, status: sp.status, org: sp.org, from: sp.from, to: sp.to };
  const [data, orgs] = await Promise.all([listGenerations(filters), orgNameMap()]);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as Array<[string, string]>).toString();
  const back = `/admin/generations${qs ? `?${qs}` : ""}`;
  const active = Object.values(filters).filter(Boolean).length;
  const revenue = data.totals.credits * USD_PER_CREDIT;
  const margin = revenue > 0 ? (revenue - data.totals.cost) / revenue : null;

  return (
    <>
      <PageHeader title="Generations & costs" description="Every provider call across every workspace, with what it cost us and what it earned in credits. Retry failed jobs or mark ones that will never finish." />

      <Flash
        ok={sp.ok}
        error={sp.error}
        messages={{
          "ok:retried": "Job re-dispatched. A fresh event appears once the pipeline starts.",
          "ok:marked": "Event marked.",
          "error:state": "That event can’t be retried from here.",
          "error:status": "Unknown status.",
        }}
      />

      <form method="get" action="/admin/generations" className="admin-filters">
        <label>
          Provider
          <select name="provider" defaultValue={sp.provider ?? ""}>
            <option value="">All</option>
            {data.providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select name="model" defaultValue={sp.model ?? ""}>
            <option value="">All</option>
            {data.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={sp.status ?? ""}>
            <option value="">All</option>
            {["started", "succeeded", "failed", "canceled"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Organisation
          <select name="org" defaultValue={sp.org ?? ""}>
            <option value="">All</option>
            {[...orgs.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={sp.from ?? ""} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={sp.to ?? ""} />
        </label>
        <div className="admin-filter-actions">
          <button className="btn btn-dark">Apply</button>
          {active ? (
            <Link href="/admin/generations" className="link-quiet">
              Clear {active}
            </Link>
          ) : null}
        </div>
      </form>

      <Kpis label="Totals for this filter">
        <Kpi label="Events" value={int(data.totals.total)} sub={`${int(data.totals.started)} running`} />
        <Kpi label="Succeeded" value={int(data.totals.succeeded)} />
        <Kpi label="Failed" value={int(data.totals.failed)} sub={pct(data.totals.succeeded + data.totals.failed ? data.totals.failed / (data.totals.succeeded + data.totals.failed) : null)} />
        <Kpi label="Provider cost" value={money(data.totals.cost)} />
        <Kpi label="Credits earned" value={int(data.totals.credits)} sub={money(revenue)} />
        <Kpi label="Gross margin" value={pct(margin, 0)} sub={`at ${money(USD_PER_CREDIT)}/credit`} />
      </Kpis>

      <Panel title="Cost per model" eyebrow="For this filter" note={`${data.perModel.length} model${data.perModel.length === 1 ? "" : "s"}`}>
        {data.perModel.length === 0 ? (
          <Empty title="No events match" />
        ) : (
          <Table minWidth={720}>
            <thead>
              <tr>
                <th>Provider · model</th>
                <th className="num">Events</th>
                <th className="num">Failed</th>
                <th className="num">Cost</th>
                <th className="num">Avg cost / ok</th>
                <th className="num">Credits</th>
                <th className="num">Margin</th>
                <th className="num">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {data.perModel.map((m) => {
                const rev = m.credits * USD_PER_CREDIT;
                return (
                  <tr key={`${m.provider}:${m.model}`}>
                    <td>
                      <span className="cell-primary">
                        <strong>{m.model || "—"}</strong>
                        <small>{m.provider}</small>
                      </span>
                    </td>
                    <td className="num">{int(m.n)}</td>
                    <td className="num" style={m.failed ? { color: "var(--bad)" } : undefined}>
                      {int(m.failed)}
                    </td>
                    <td className="num">{money(m.cost, 4)}</td>
                    <td className="num muted">{m.succeeded ? money(m.cost / m.succeeded, 4) : "—"}</td>
                    <td className="num">{int(m.credits)}</td>
                    <td className="num">{pct(rev > 0 ? (rev - m.cost) / rev : null, 0)}</td>
                    <td className="num muted">{m.avgMs != null ? `${(m.avgMs / 1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel title="Events" eyebrow="Newest first" note={`showing ${data.rows.length} of ${int(data.totals.total)}`}>
        {data.rows.length === 0 ? (
          <Empty title="No generation events match">{active ? "Loosen a filter or widen the dates." : "Events are written every time a pipeline calls a provider."}</Empty>
        ) : (
          <Table minWidth={980}>
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Organisation</th>
                <th>Provider · model</th>
                <th>Status</th>
                <th className="num">Cost</th>
                <th className="num">Credits</th>
                <th className="num">Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((e) => {
                const meta = (e.meta ?? {}) as Record<string, unknown>;
                const stale = e.status === "started" && Date.now() - e.createdAt.getTime() > 20 * 60e3;
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
                    <td>
                      <Link href={`/admin/orgs/${e.orgId}`} className="link-quiet">
                        {e.orgName}
                      </Link>
                    </td>
                    <td className="muted">
                      {e.provider} · {e.model || "—"}
                    </td>
                    <td>
                      <Chip tone={stale ? "bad" : statusTone(e.status)}>{stale ? "stuck" : e.status}</Chip>
                    </td>
                    <td className="num">{e.costUsd != null ? money(e.costUsd, 4) : "—"}</td>
                    <td className="num">{int(e.credits)}</td>
                    <td className="num muted">{e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td>
                      <div className="row-actions">
                        {e.status === "failed" ? (
                          <form action={retryGeneration}>
                            <input type="hidden" name="eventId" value={e.id} />
                            <input type="hidden" name="back" value={back} />
                            <PendingButton className="btn btn-outline btn-sm" pendingLabel="…">
                              Retry
                            </PendingButton>
                          </form>
                        ) : null}
                        {e.status === "started" ? (
                          <form action={markGeneration}>
                            <input type="hidden" name="eventId" value={e.id} />
                            <input type="hidden" name="status" value="failed" />
                            <input type="hidden" name="back" value={back} />
                            <PendingButton className="btn btn-outline btn-sm btn-danger" pendingLabel="…">
                              Mark failed
                            </PendingButton>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
