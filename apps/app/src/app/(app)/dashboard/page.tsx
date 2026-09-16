import Link from "next/link";
import { Spark } from "@/components/spark";
import { requireOrg } from "@/server/org";
import { loadDashboard } from "@/server/dashboard";
import { loadPerformanceSummary } from "@/server/ads";
import { AutoRefresh } from "@/components/auto-refresh";
import { SectionHeader } from "@/components/workspace-ui";
import { WallTile, wallPlaceholders as placeholders } from "@/components/wall-tile";
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  LibraryIcon,
  PlusIcon,
  StarIcon,
  TextIcon,
  TrendDownIcon,
} from "@/components/icons";

export const dynamic = "force-dynamic";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireOrg();
  const [data, perf] = await Promise.all([
    loadDashboard(ctx.org.id, ctx.brand?.id ?? null),
    loadPerformanceSummary(ctx.org.id, ctx.brand?.id ?? null, 7),
  ]);
  const money = (minor: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: perf.currency || "USD", maximumFractionDigits: minor < 10000 ? 2 : 0 }).format(minor / 100);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const firstName = ctx.viewer.name.split(/[\s@.]/)[0];
  const readyCount = data.tiles.filter((t) => t.status === "rendered").length;
  const failedCount = data.tiles.filter((t) => t.status === "failed").length;
  const attention =
    data.counts.failedPipelines.length + data.changeRequests.length + perf.alerts.length + (data.counts.failedRenders > 0 ? 1 : 0) + (ctx.credits.balance <= 10 ? 1 : 0);

  const headline =
    data.queue.length > 0
      ? `${data.queue.length} generating right now.`
      : attention > 0
        ? `${attention} thing${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} your attention.`
        : readyCount > 0
          ? `${readyCount} ready to review.`
          : data.counts.briefs === 0
            ? "Let’s make your first one."
            : "Pick up where you left off.";

  const setup = [
    { title: "Add a product", description: "A photo is enough; we cut it out for you.", href: "/library/new", done: data.counts.products > 0 },
    { title: "Write a brief", description: "Ten concepts in about a minute.", href: "/briefs/new", done: data.counts.briefs > 0 },
    { title: "Make your first creative", description: "Every size, exact copy.", href: "/briefs", done: data.counts.creatives > 0 },
    { title: "Connect an ad account", description: "Publish and track in one place.", href: "/campaigns", done: data.adAccountsConnected > 0 },
  ];
  const complete = setup.filter((s) => s.done).length;

  return (
    <>
      <AutoRefresh active={data.queue.length > 0} />

      <header className="home-header">
        <div>
          <span className="workspace-eyebrow">{dateLabel}</span>
          <h1>
            {greeting(now)}, {firstName}. <em>{headline}</em>
          </h1>
        </div>
        <div className="workspace-page-actions">
          <Link href="/library/new" className="btn btn-outline">
            <PlusIcon width={15} height={15} /> Add product
          </Link>
          <Link href="/briefs/new" className="btn btn-orange">
            New brief <ArrowIcon width={14} height={14} />
          </Link>
        </div>
      </header>

      <dl className="home-strip" aria-label="Workspace status">
        <Link href="/creatives?status=ready" className="home-stat">
          <dt>Ready to review</dt>
          <dd>{readyCount}</dd>
        </Link>
        <Link href="/creatives?status=rendering" className="home-stat">
          <dt>Generating</dt>
          <dd>
            {data.queue.length}
            {data.queue.length ? <Spark size={14} animate="spin" className="text-orange" /> : null}
          </dd>
        </Link>
        <Link href="/campaigns" className="home-stat">
          <dt>Live campaigns</dt>
          <dd>{perf.liveCampaigns}</dd>
        </Link>
        <Link href="/performance" className="home-stat">
          <dt>Spend · 7 days</dt>
          <dd>{perf.connected && perf.hasData ? money(perf.spend) : "—"}</dd>
        </Link>
        <Link href="/settings/billing" className="home-stat">
          <dt>Credits</dt>
          <dd>
            {ctx.credits.balance}
            <small> / {ctx.credits.grant}</small>
          </dd>
        </Link>
      </dl>

      <div className="overview-columns">
        <div className="overview-primary">
          {data.queue.length ? (
            <section className="home-section">
              <SectionHeader title="Generating now" description={`${data.queue.length} in progress · this page refreshes on its own`} />
              <div className="queue-grid">
                {data.queue.map((q, i) => (
                  <div key={q.id} className="queue-card">
                    <div className="queue-thumb" style={{ background: placeholders[i % placeholders.length] }}>
                      <Spark size={22} animate="spin" className="text-orange" />
                    </div>
                    <div className="queue-body">
                      <div className="queue-title">
                        <strong>{q.label}</strong>
                        <span className="tabular">{Math.max(1, Math.round((Date.now() - q.startedAt.getTime()) / 1000))} s</span>
                      </div>
                      <span className="queue-detail">{q.detail}</span>
                      <div className="queue-track">
                        <span />
                      </div>
                      <span className="queue-chip">{q.credits} credits</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="home-section">
            <SectionHeader
              title="Recent creative"
              description={
                data.tiles.length
                  ? `${readyCount} ready${failedCount ? ` · ${failedCount} failed` : ""} · live ones carry their numbers`
                  : "Every size it needs to be, with exact copy and product."
              }
              action={
                <div className="workspace-tabs" role="group" aria-label="Filter">
                  {[
                    ["All", "/creatives"],
                    ["Static", "/creatives?kind=static"],
                    ["Video", "/creatives?kind=video"],
                    ["UGC", "/creatives?kind=ugc"],
                  ].map(([label, href], i) => (
                    <Link key={label} href={href} className={i === 0 ? "active" : ""}>
                      {label}
                    </Link>
                  ))}
                </div>
              }
            />

            {data.tiles.length ? (
              <div className="wall">
                {data.tiles.map((t, i) => (
                  <WallTile key={t.id} {...t} live={perf.byCreative[t.id] ?? null} index={i} />
                ))}
              </div>
            ) : (
              <div className="home-empty">
                <div className="home-empty-art" aria-hidden="true">
                  <span style={{ aspectRatio: "4 / 5", background: placeholders[1] }} />
                  <span style={{ aspectRatio: "9 / 16", background: placeholders[2] }} />
                  <span style={{ aspectRatio: "1 / 1", background: placeholders[0] }} />
                </div>
                <div>
                  <h3>Your wall is empty. That never lasts long.</h3>
                  <p>
                    Add a product photo to {ctx.brand?.name ?? "your brand"}, write a two-line brief, and the first ads land here in every size.
                  </p>
                  <div className="workspace-page-actions">
                    <Link href="/briefs/new" className="btn btn-orange">
                      Write the first brief <ArrowIcon width={14} height={14} />
                    </Link>
                    <Link href="/library/new" className="btn btn-outline">
                      <LibraryIcon width={15} height={15} /> Add a product
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {data.tiles.length ? (
              <div className="home-more">
                <Link href="/creatives" className="btn btn-outline">
                  All {data.counts.creatives} creative{data.counts.creatives === 1 ? "" : "s"} <ArrowIcon width={14} height={14} />
                </Link>
              </div>
            ) : null}
          </section>

          {complete < setup.length ? (
            <section className="overview-onboarding">
              <SectionHeader
                title="Make this workspace yours"
                description="Four steps from a product photo to a tracked campaign."
                action={
                  <span className="collection-count">
                    {complete} of {setup.length} complete
                  </span>
                }
              />
              <div className="setup-progress">
                <span style={{ width: `${(complete / setup.length) * 100}%` }} />
              </div>
              {setup.map((step, i) => (
                <Link key={step.title} href={step.href} className={`setup-row ${step.done ? "done" : ""}`}>
                  <span>{step.done ? <CheckIcon width={13} height={13} /> : String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <ArrowIcon />
                </Link>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="overview-aside">
          <section className="panel home-panel">
            <div className="home-panel-head">
              <span className="eyebrow">This week</span>
              <span className="home-panel-note">{perf.connected ? (data.sandboxOnly ? "sandbox data · vs previous 7 days" : "vs previous 7 days") : "not connected"}</span>
            </div>
            {perf.connected && perf.hasData ? (
              <>
                <div className="home-roas">
                  <div>
                    <span className="home-panel-note">Return on ad spend</span>
                    <span className="home-roas-value tabular">
                      {perf.roas != null ? perf.roas.toFixed(1) : "–"}
                      <small>×</small>
                    </span>
                    {perf.roas != null && perf.roasPrev != null ? (
                      <span className={`home-delta ${perf.roas >= perf.roasPrev ? "up" : "down"}`}>
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={perf.roas >= perf.roasPrev ? "" : "rotate-180"}>
                          <path d="M5 1.5l4 6H1z" fill="currentColor" />
                        </svg>
                        {Math.abs(perf.roas - perf.roasPrev).toFixed(1)} from {perf.roasPrev.toFixed(1)}×
                      </span>
                    ) : null}
                  </div>
                  <Sparkline points={perf.series.map((d) => d.roas)} />
                </div>
                <div className="home-kpis">
                  {[
                    { label: "Spend", value: money(perf.spend) },
                    { label: "CTR", value: `${(perf.ctr * 100).toFixed(1)}%` },
                    { label: "CPA", value: perf.cpa != null ? money(perf.cpa) : "–" },
                  ].map((m) => (
                    <div key={m.label}>
                      <span className="home-panel-note">{m.label}</span>
                      <span className="tabular">{m.value}</span>
                    </div>
                  ))}
                </div>
                <Link href="/performance" className="home-panel-link">
                  Full performance <ArrowIcon width={13} height={13} />
                </Link>
              </>
            ) : perf.connected ? (
              <p className="home-panel-text">Connected. Numbers appear after the first hourly sync.</p>
            ) : (
              <>
                <p className="home-panel-text">Connect Meta, TikTok or Google and every creative shows its spend, CTR and return right here.</p>
                <Link href="/campaigns" className="home-panel-link">
                  Connect an ad account <ArrowIcon width={13} height={13} />
                </Link>
              </>
            )}
          </section>

          {perf.winners.length ? (
            <section className="panel home-panel">
              <div className="home-panel-head">
                <span className="eyebrow">Winning right now</span>
                <span className="home-panel-note">by ROAS</span>
              </div>
              <div className="home-winners">
                {perf.winners.map((w, i) => {
                  const top = perf.winners[0].roas ?? 1;
                  const pct = Math.max(8, Math.round(((w.roas ?? 0) / (top || 1)) * 100));
                  return (
                    <Link key={w.creativeId} href={`/creatives/${w.creativeId}`} className="home-winner">
                      <span className="home-winner-thumb" style={{ background: w.previewUrl ? `url(${w.previewUrl}) center/cover` : placeholders[i % placeholders.length] }} />
                      <span className="home-winner-body">
                        <span className="home-winner-row">
                          <strong>{w.name}</strong>
                          <span className="tabular">{w.roas != null ? `${w.roas.toFixed(1)}×` : `${(w.ctr * 100).toFixed(1)}%`}</span>
                        </span>
                        <span className="home-winner-track">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              <Link href={`/briefs/new?from=${perf.winners[0].creativeId}`} className="btn btn-dark home-panel-cta">
                Make more like the winner <ArrowIcon width={14} height={14} />
              </Link>
            </section>
          ) : null}

          <section className="panel home-panel">
            <div className="home-panel-head">
              <span className="eyebrow">Needs attention</span>
              {attention ? <span className="home-count">{attention}</span> : null}
            </div>
            {attention === 0 ? (
              <p className="home-panel-text home-clear">
                <CheckIcon width={14} height={14} /> All clear.
              </p>
            ) : null}
            <div className="home-alerts">
              {data.counts.failedPipelines.map((f, i) => (
                <div key={`fp-${i}`} className="home-alert">
                  <AlertIcon className="critical" />
                  <span>
                    <strong>Generation failed{f.label && typeof f.label.label === "string" ? `: ${f.label.label}` : ""}</strong>
                    <span>
                      {(f.error ?? "Unknown error").slice(0, 90)}. Credits were not charged.{" "}
                      {f.creativeId ? <Link href={`/creatives/${f.creativeId}`}>Open and retry</Link> : null}
                    </span>
                  </span>
                </div>
              ))}
              {data.changeRequests.map((c) => (
                <div key={`cr-${c.creativeId}`} className="home-alert">
                  <AlertIcon className="warning" />
                  <span>
                    <strong>Changes requested on “{c.name}”</strong>
                    <span>
                      {(c.note ?? "See the review thread").slice(0, 90)}. <Link href={`/creatives/${c.creativeId}/review`}>Open review</Link>
                    </span>
                  </span>
                </div>
              ))}
              {perf.alerts.map((a) => (
                <div key={`${a.kind}-${a.creativeId ?? a.campaignId}`} className="home-alert">
                  {a.kind === "fatigue" ? <TrendDownIcon className="warning" /> : <AlertIcon className="critical" />}
                  <span>
                    <strong>{a.kind === "fatigue" ? `“${a.name}” is fatiguing` : `Disapproved: ${a.name}`}</strong>
                    <span>
                      {a.detail}.{" "}
                      <Link href={a.kind === "fatigue" && a.creativeId ? `/briefs/new?from=${a.creativeId}` : a.href}>
                        {a.kind === "fatigue" ? "Spin 3 variations" : "Fix and resubmit"}
                      </Link>
                    </span>
                  </span>
                </div>
              ))}
              {data.counts.failedRenders > 0 ? (
                <div className="home-alert">
                  <AlertIcon className="critical" />
                  <span>
                    <strong>
                      {data.counts.failedRenders} render{data.counts.failedRenders === 1 ? "" : "s"} failed
                    </strong>
                    <span>
                      Credits were not charged. <Link href="/creatives?status=failed">Retry</Link>
                    </span>
                  </span>
                </div>
              ) : null}
              {ctx.credits.balance <= 10 ? (
                <div className="home-alert">
                  <AlertIcon className="warning" />
                  <span>
                    <strong>{ctx.credits.balance} credits left</strong>
                    <span>
                      A UGC video needs 40. <Link href="/settings/billing">Top up</Link>
                    </span>
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="home-start">
            <span className="eyebrow">Start from</span>
            <div className="home-start-grid">
              {[
                { href: "/library/new", label: "Product photo", Icon: PlusIcon },
                { href: "/briefs/new", label: "Written brief", Icon: TextIcon },
                { href: perf.winners[0] ? `/briefs/new?from=${perf.winners[0].creativeId}` : "/creatives", label: "A winner", Icon: StarIcon },
              ].map(({ href, label, Icon }) => (
                <Link key={label} href={href}>
                  <Icon width={18} height={18} />
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 110;
  const h = 40;
  if (points.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const max = Math.max(...points, 0.0001);
  const min = Math.min(...points, 0);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - 4 - ((v - min) / (max - min || 1)) * (h - 8);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="#e65c32" fillOpacity="0.12" />
      <path d={d} fill="none" stroke="#e65c32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={y(last)} r="3.5" fill="#e65c32" stroke="#ffffff" strokeWidth="2" />
    </svg>
  );
}
