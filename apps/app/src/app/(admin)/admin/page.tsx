import Link from "next/link";
import { Spark } from "@/components/spark";
import { ArrowIcon } from "@/components/icons";
import { requireAdmin } from "@/server/admin";
import { loadOverview, USD_PER_CREDIT } from "@/server/admin-data";
import { Chip, Empty, Kpi, Kpis, Panel, ago, fmtDate, int, money, pct } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const o = await loadOverview();
  const firstName = admin.name.split(/[\s@.]/)[0];
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const attention = o.queue.depth + o.generation.failed + o.providers.filter((p) => p.failed24h > 0).length;
  const headline =
    o.queue.depth > 0
      ? `${o.queue.depth} generating across the platform.`
      : o.generation.failed > 0
        ? `${o.generation.failed} failure${o.generation.failed === 1 ? "" : "s"} in the last 30 days.`
        : "All quiet.";

  const marginTone = o.generation.margin == null ? undefined : o.generation.margin >= 0.6 ? "good" : o.generation.margin >= 0.3 ? undefined : "bad";

  return (
    <>
      <header className="home-header">
        <div>
          <span className="workspace-eyebrow">{dateLabel} · platform</span>
          <h1>
            Hello, {firstName}. <em>{headline}</em>
          </h1>
        </div>
        <div className="workspace-page-actions">
          <Link href="/admin/generations?status=failed" className="btn btn-outline">
            Failures
          </Link>
          <Link href="/admin/orgs" className="btn btn-dark">
            Organisations <ArrowIcon width={14} height={14} />
          </Link>
        </div>
      </header>

      <Kpis label="Platform status">
        <Kpi label="Signups · 7 days" value={int(o.signups.d7)} sub={`${int(o.signups.d30)} in 30d`} href="/admin/users" />
        <Kpi label="Active workspaces" value={int(o.orgs.active30d)} sub={`of ${int(o.orgs.total)}`} href="/admin/orgs" />
        <Kpi label="Creatives · 30 days" value={int(o.creatives.d30)} sub={`${int(o.creatives.d7)} this week`} />
        <Kpi label="Generation cost · 30d" value={money(o.generation.cost)} sub={`${int(o.generation.credits)} credits`} href="/admin/generations" />
        <Kpi
          label="Gross margin"
          value={pct(o.generation.margin, 0)}
          sub={`at ${money(USD_PER_CREDIT)}/credit`}
          delta={o.generation.margin == null ? undefined : { text: `${money(o.generation.revenue)} credit value`, tone: marginTone as "good" | "bad" | undefined }}
        />
        <Kpi label="Failure rate" value={pct(o.generation.failureRate)} sub={`${int(o.generation.failed)} of ${int(o.generation.succeeded + o.generation.failed)}`} href="/admin/generations?status=failed" />
        <Kpi label="Queue depth" value={<>{int(o.queue.depth)}{o.queue.depth ? <Spark size={14} animate="spin" /> : null}</>} sub={o.queue.oldest ? `oldest ${ago(o.queue.oldest)}` : "idle"} href="/admin/generations?status=started" />
      </Kpis>

      <div className="admin-columns">
        <div className="admin-stack">
          <Panel title="Creatives per day" eyebrow="Last 30 days" note={`${int(o.creatives.d30)} total · ${int(o.creatives.total)} all time`}>
            <div className="admin-panel-body">
              {o.creatives.d30 === 0 ? (
                <Empty title="No creatives in the last 30 days">The chart fills in as workspaces generate.</Empty>
              ) : (
                <CreativesChart series={o.creatives.series} />
              )}
            </div>
          </Panel>

          <Panel title="Recent failures" eyebrow="Generation" note={<Link href="/admin/generations?status=failed" className="link-quiet">All failures</Link>}>
            {o.recentFailures.length === 0 ? (
              <Empty title="Nothing has failed recently">Failed generations land here with their error and workspace.</Empty>
            ) : (
              <ul className="admin-list">
                {o.recentFailures.map((f) => (
                  <li key={f.id}>
                    <span className="body">
                      <strong>
                        {(f.meta?.label as string | undefined) ?? `${f.provider} · ${f.model || "unknown model"}`}
                        {" · "}
                        <Link href={`/admin/orgs/${f.orgId}`} className="link-quiet">
                          {f.orgName}
                        </Link>
                      </strong>
                      <small className="err">{(f.error ?? "No error message").slice(0, 200)}</small>
                    </span>
                    <span className="when">{ago(f.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="admin-stack">
          <Panel title="Provider health" eyebrow="From generation events" note={<Link href="/admin/providers" className="link-quiet">Configuration</Link>}>
            {o.providers.length === 0 ? (
              <Empty title="No provider activity yet" />
            ) : (
              <ul className="admin-list">
                {o.providers.map((p) => {
                  const tone = p.failed24h > 0 && p.failed24h >= p.total24h / 2 ? "bad" : p.failed24h > 0 ? "warn" : p.lastSuccessAt ? "good" : "neutral";
                  return (
                    <li key={p.provider}>
                      <span className="body">
                        <strong>{p.provider}</strong>
                        <small>
                          last ok {ago(p.lastSuccessAt)} · last fail {ago(p.lastFailureAt)}
                        </small>
                      </span>
                      <Chip tone={tone}>{p.total24h ? `${p.failed24h}/${p.total24h} failed 24h` : "quiet"}</Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Recent signups" eyebrow="Users" note={<Link href="/admin/users" className="link-quiet">All users</Link>}>
            {o.recentSignups.length === 0 ? (
              <Empty title="No signups yet" />
            ) : (
              <ul className="admin-list">
                {o.recentSignups.map((u) => (
                  <li key={u.id}>
                    <span className="who">{(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}</span>
                    <span className="body">
                      <strong>{u.name ?? u.email}</strong>
                      <small>
                        {u.email}
                        {u.orgName ? ` · ${u.orgName}` : " · no workspace yet"}
                      </small>
                    </span>
                    <span className="when" title={fmtDate(u.createdAt)}>
                      {ago(u.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Needs attention" eyebrow="Now" note={attention ? `${attention}` : undefined}>
            <div className="admin-panel-body">
              {attention === 0 ? (
                <p>All clear. Nothing running, nothing failed, no provider errors in the last day.</p>
              ) : (
                <ul className="admin-list" style={{ margin: "-18px" }}>
                  {o.queue.depth > 0 ? (
                    <li>
                      <span className="body">
                        <strong>{o.queue.depth} generation{o.queue.depth === 1 ? "" : "s"} in flight</strong>
                        <small>Oldest started {ago(o.queue.oldest)}. Stuck ones can be marked from Generations.</small>
                      </span>
                      <Link href="/admin/generations?status=started" className="link-quiet">
                        Open
                      </Link>
                    </li>
                  ) : null}
                  {o.generation.failed > 0 ? (
                    <li>
                      <span className="body">
                        <strong>{o.generation.failed} failed in 30 days</strong>
                        <small>Retry from Generations; credits are never charged on failure.</small>
                      </span>
                      <Link href="/admin/generations?status=failed" className="link-quiet">
                        Open
                      </Link>
                    </li>
                  ) : null}
                  {o.providers
                    .filter((p) => p.failed24h > 0)
                    .map((p) => (
                      <li key={p.provider}>
                        <span className="body">
                          <strong>{p.provider} failing</strong>
                          <small>
                            {p.failed24h} of {p.total24h} calls failed in the last 24 hours.
                          </small>
                        </span>
                        <Link href="/admin/providers" className="link-quiet">
                          Open
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Single orange series: creatives created per day, last 30 days. */
function CreativesChart({ series }: { series: Array<{ day: string; n: number }> }) {
  const w = 720;
  const h = 200;
  const pad = { l: 28, r: 8, t: 12, b: 22 };
  const max = Math.max(1, ...series.map((s) => s.n));
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const barW = innerW / series.length;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, Math.ceil(max / 2), max];
  const label = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="admin-chart" role="img" aria-label={`Creatives per day, ${series[0].day} to ${series[series.length - 1].day}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#e7e8e2" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} fontSize="9" textAnchor="end" fill="#73756d" fontFamily="inherit">
              {t}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const x = pad.l + i * barW + barW * 0.2;
          const bw = barW * 0.6;
          const top = y(s.n);
          return (
            <g key={s.day}>
              <title>{`${label(s.day)}: ${s.n}`}</title>
              <rect x={x} y={top} width={bw} height={Math.max(0, pad.t + innerH - top)} rx="2" fill={s.n ? "#e65c32" : "#eceee7"} />
              {s.n === 0 ? <rect x={x} y={pad.t + innerH - 2} width={bw} height="2" rx="1" fill="#e0e2da" /> : null}
            </g>
          );
        })}
        {series.map((s, i) =>
          (series.length - 1 - i) % 7 === 0 ? (
            <text key={s.day} x={pad.l + i * barW + barW / 2} y={h - 6} fontSize="9" textAnchor="middle" fill="#73756d" fontFamily="inherit">
              {label(s.day)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="admin-chart-legend">
        <span>Creatives created per day</span>
        <span>peak {max}</span>
      </figcaption>
    </figure>
  );
}
