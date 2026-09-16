import Link from "next/link";
import { requireOrg } from "@/server/org";
import { loadDashboard } from "@/server/dashboard";
import { loadPerformanceSummary } from "@/server/ads";
import { AutoRefresh } from "@/components/auto-refresh";
import {
  PageHeader,
  SectionHeader,
  EmptyState,
} from "@/components/workspace-ui";
import { CreativeCard } from "@/components/creative-card";
import {
  AlertIcon,
  TrendDownIcon,
  CreativesIcon,
  BriefIcon,
  PlayIcon,
  LibraryIcon,
  CampaignIcon,
  ArrowIcon,
  CheckIcon,
  PlusIcon,
  BoltIcon,
  CalendarIcon,
} from "@/components/icons";
export const dynamic = "force-dynamic";
const gradients = ["#e9ecdf", "#eae3d5", "#dce6dc"];
export default async function DashboardPage() {
  const ctx = await requireOrg();
  const [data, perf] = await Promise.all([
    loadDashboard(ctx.org.id, ctx.brand?.id ?? null),
    loadPerformanceSummary(ctx.org.id, ctx.brand?.id ?? null, 7),
  ]);
  const money = (minor: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: perf.currency || "USD",
      maximumFractionDigits: minor < 10000 ? 2 : 0,
    }).format(minor / 100);
  const firstName = ctx.viewer.name.split(/[\s@.]/)[0];
  const setup = [
    {
      title: "Set up your brand",
      description: "Keep every creative on brand.",
      href: "/brands",
      done: !!ctx.brand,
    },
    {
      title: "Create your first brief",
      description: "Turn an idea into creative directions.",
      href: "/briefs/new",
      done: data.counts.briefs > 0,
    },
    {
      title: "Make your first creative",
      description: "Bring a winning concept to life.",
      href: "/briefs",
      done: data.counts.creatives > 0,
    },
    {
      title: "Connect an ad account",
      description: "Publish and track in one place.",
      href: "/campaigns",
      done: data.adAccountsConnected > 0,
    },
  ];
  const complete = setup.filter((step) => step.done).length;
  return (
    <>
      <AutoRefresh active={data.queue.length > 0} />
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here’s what’s happening with ${ctx.brand?.name ?? ctx.org.name} today.`}
        eyebrow="YOUR CREATIVE WORKSPACE"
        actions={
          <>
            <Link href="/performance" className="btn btn-outline">
              <CalendarIcon width={15} height={15} /> Last 7 days
            </Link>
            <Link href="/briefs/new" className="btn btn-orange">
              <PlusIcon width={15} height={15} /> Create a brief
            </Link>
          </>
        }
      />
      <div className="overview-metrics">
        {[
          {
            label: "Total creatives",
            value: data.counts.creatives.toLocaleString(),
            note: "Across all creative formats",
            href: "/creatives",
            Icon: CreativesIcon,
          },
          {
            label: "Creative briefs",
            value: data.counts.briefs.toLocaleString(),
            note: "Ideas in your workspace",
            href: "/briefs",
            Icon: BriefIcon,
          },
          {
            label: "Generating now",
            value: data.queue.length.toString(),
            note: data.queue.length
              ? "Your creatives are on the way"
              : "Ready for your next idea",
            href: "/creatives?status=rendering",
            Icon: BoltIcon,
          },
          {
            label: "Ad spend · 7 days",
            value: perf.connected && perf.hasData ? money(perf.spend) : "—",
            note:
              data.sandboxOnly && perf.connected
                ? "Sandbox performance"
                : perf.connected
                  ? "Across connected accounts"
                  : "Connect an ad account",
            href: "/performance",
            Icon: CampaignIcon,
          },
        ].map(({ label, value, note, href, Icon }) => (
          <Link key={label} href={href} className="overview-metric">
            <div className="overview-metric-top">
              <span>{label}</span>
              <Icon />
            </div>
            <strong className="overview-metric-value">{value}</strong>
            <span className="overview-metric-note">
              <i />
              {note}
            </span>
          </Link>
        ))}
      </div>
      <section className="overview-start">
        <div>
          <h2>
            A little idea. <span>A lot of possibilities.</span>
          </h2>
          <p>Everything you need to make your next great ad.</p>
        </div>
        <div className="overview-shortcuts">
          {[
            {
              href: "/briefs/new",
              title: "Write a brief",
              text: "Explore new directions",
              Icon: BriefIcon,
            },
            {
              href: "/briefs/new?format=video",
              title: "Create a video",
              text: "Bring your product to life",
              Icon: PlayIcon,
            },
            {
              href: "/library/new",
              title: "Add a product",
              text: "Start with what you have",
              Icon: LibraryIcon,
            },
          ].map(({ href, title, text, Icon }) => (
            <Link href={href} key={href} className="overview-shortcut">
              <Icon />
              <div>
                <strong>{title}</strong>
                <small>{text}</small>
              </div>
              <ArrowIcon />
            </Link>
          ))}
        </div>
      </section>
      <div className="overview-columns">
        <div className="overview-primary">
          <section className="overview-recent">
            <SectionHeader
              title="Recent creatives"
              description="Your latest work, ready for its next step."
              action={<Link href="/creatives">View all creatives ↗</Link>}
            />
            {data.tiles.length ? (
              <div className="creative-grid">
                {data.tiles.map((t) => (
                  <CreativeCard key={t.id} {...t} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CreativesIcon width={25} height={25} />}
                title="Your next great ad starts here"
                description="Write a brief, explore creative directions, and bring your first ad to life. All your work will live right here."
                href="/briefs/new"
                action="Create your first brief"
                secondary={
                  <Link href="/library" className="btn btn-outline">
                    Explore product library
                  </Link>
                }
              />
            )}
          </section>
          {data.queue.length ? (
            <section className="panel p-5">
              <SectionHeader
                title="Generation queue"
                description={`${data.queue.length} in progress`}
              />
              <div className="mt-4 flex flex-col gap-4">
                {data.queue.map((q) => (
                  <div key={q.id}>
                    <div className="flex justify-between gap-3 text-[12px]">
                      <strong className="font-medium">{q.label}</strong>
                      <span className="text-muted">{q.credits} credits</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{q.detail}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#edf0e5]">
                      <span className="block h-full w-1/2 animate-pulse rounded-full bg-orange" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="overview-status">
              <span>
                <CheckIcon /> Your generation queue is clear
              </span>
              <Link href="/briefs/new">Start something new ↗</Link>
            </div>
          )}
          {complete < setup.length && (
            <section className="overview-onboarding">
              <SectionHeader
                title="Make this workspace yours"
                description="A few simple steps from idea to your first campaign."
                action={
                  <span className="collection-count">
                    {complete} of {setup.length} complete
                  </span>
                }
              />
              <div className="setup-progress">
                <span
                  style={{ width: `${(complete / setup.length) * 100}%` }}
                />
              </div>
              {setup.map((step, i) => (
                <Link
                  key={step.title}
                  href={step.href}
                  className={`setup-row ${step.done ? "done" : ""}`}
                >
                  <span>
                    {step.done ? (
                      <CheckIcon width={13} height={13} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                  <ArrowIcon />
                </Link>
              ))}
            </section>
          )}
        </div>
        <aside className="overview-aside">
          <section className="panel overflow-hidden">
            <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3.5">
              <span className="eyebrow">This week</span>
              <span className="text-[11px] text-muted">
                {perf.connected
                  ? data.sandboxOnly
                    ? "sandbox data · vs last 7 days"
                    : "vs last 7 days"
                  : "not connected"}
              </span>
            </div>
            {perf.connected && perf.hasData ? (
              <>
                <div className="flex items-end justify-between px-4 pb-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] text-muted">
                      Return on ad spend
                    </span>
                    <span className="tabular text-[34px] font-medium leading-none tracking-[-1.5px]">
                      {perf.roas != null ? perf.roas.toFixed(1) : "–"}
                      <span className="text-[20px] text-muted">×</span>
                    </span>
                    {perf.roas != null && perf.roasPrev != null ? (
                      <span
                        className={`inline-flex items-center gap-1 text-[12px] font-semibold ${perf.roas >= perf.roasPrev ? "text-[#3f7a55]" : "text-[#b4382a]"}`}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          aria-hidden="true"
                          className={
                            perf.roas >= perf.roasPrev ? "" : "rotate-180"
                          }
                        >
                          <path d="M5 1.5l4 6H1z" fill="currentColor" />
                        </svg>
                        {Math.abs(perf.roas - perf.roasPrev).toFixed(1)} from{" "}
                        {perf.roasPrev.toFixed(1)}×
                      </span>
                    ) : null}
                  </div>
                  <Sparkline points={perf.series.map((d) => d.roas)} />
                </div>
                <div className="grid grid-cols-3 border-t border-line">
                  {[
                    { label: "Spend", value: money(perf.spend) },
                    { label: "CTR", value: `${(perf.ctr * 100).toFixed(1)}%` },
                    {
                      label: "CPA",
                      value: perf.cpa != null ? money(perf.cpa) : "–",
                    },
                  ].map((m, i) => (
                    <div
                      key={m.label}
                      className={`flex flex-col gap-0.5 px-4 py-3 ${i < 2 ? "border-r border-line" : ""}`}
                    >
                      <span className="text-[11px] text-muted">{m.label}</span>
                      <span className="tabular text-[16px] font-semibold tracking-[-0.4px]">
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : perf.connected ? (
              <div className="px-4 pb-4 text-[13px] text-muted">
                Connected. Numbers appear after the first hourly sync.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 px-4 pb-4">
                <p className="m-0 text-[13px] text-muted">
                  Performance shows up here once an ad account is connected.
                  Until then, export finished creative and upload it yourself.
                </p>
                <Link
                  href="/campaigns"
                  className="text-[12px] font-semibold text-orange"
                >
                  Connect an ad account ↗
                </Link>
              </div>
            )}
          </section>

          {perf.winners.length ? (
            <section className="panel flex flex-col gap-1 px-4 pb-3 pt-3.5">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="eyebrow">Winning right now</span>
                <span className="text-[11px] text-muted">by ROAS</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {perf.winners.map((w, i) => {
                  const top = perf.winners[0].roas ?? 1;
                  const pct = Math.max(
                    8,
                    Math.round(((w.roas ?? 0) / (top || 1)) * 100),
                  );
                  return (
                    <Link
                      key={w.creativeId}
                      href={`/creatives/${w.creativeId}`}
                      className="flex items-center gap-2.5"
                    >
                      <span
                        className="h-[38px] w-[30px] shrink-0 rounded"
                        style={{
                          background: w.previewUrl
                            ? `url(${w.previewUrl}) center/cover`
                            : gradients[i % gradients.length],
                        }}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="flex justify-between gap-2 text-[12px]">
                          <span className="min-w-0 truncate font-semibold">
                            {w.name}
                          </span>
                          <span className="tabular font-semibold">
                            {w.roas != null
                              ? `${w.roas.toFixed(1)}×`
                              : `${(w.ctr * 100).toFixed(1)}%`}
                          </span>
                        </span>
                        <span className="h-1 overflow-hidden rounded-full bg-[#efeee8]">
                          <span
                            className="block h-full bg-orange"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              <Link
                href={`/briefs/new?from=${perf.winners[0].creativeId}`}
                className="btn btn-dark mt-3 h-11 w-full text-[12px]"
              >
                Make more like the winner <span aria-hidden="true">↗</span>
              </Link>
            </section>
          ) : null}

          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Needs attention</span>
            {data.counts.failedRenders === 0 &&
            data.counts.failedPipelines.length === 0 &&
            data.changeRequests.length === 0 &&
            ctx.credits.balance > 10 &&
            perf.alerts.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">All clear.</p>
            ) : null}
            {data.counts.failedPipelines.map((f, i) => (
              <div key={`fp-${i}`} className="flex items-start gap-2.5">
                <AlertIcon className="mt-px shrink-0 text-[#b4382a]" />
                <span className="flex flex-col gap-0.5 text-[12px]">
                  <span className="font-semibold">
                    Generation failed
                    {f.label && typeof f.label.label === "string"
                      ? `: ${f.label.label}`
                      : ""}
                  </span>
                  <span className="text-muted">
                    {(f.error ?? "Unknown error").slice(0, 90)}. Credits were
                    not charged.{" "}
                    {f.creativeId ? (
                      <Link
                        href={`/creatives/${f.creativeId}`}
                        className="font-semibold text-orange"
                      >
                        Open and retry
                      </Link>
                    ) : null}
                  </span>
                </span>
              </div>
            ))}
            {data.changeRequests.map((c) => (
              <div
                key={`cr-${c.creativeId}`}
                className="flex items-start gap-2.5"
              >
                <AlertIcon className="mt-px shrink-0 text-[#b7791f]" />
                <span className="flex flex-col gap-0.5 text-[12px]">
                  <span className="font-semibold">
                    Changes requested on “{c.name}”
                  </span>
                  <span className="text-muted">
                    {(c.note ?? "See the review thread").slice(0, 90)}.{" "}
                    <Link
                      href={`/creatives/${c.creativeId}/review`}
                      className="font-semibold text-orange"
                    >
                      Open review
                    </Link>
                  </span>
                </span>
              </div>
            ))}
            {perf.alerts.map((a) => (
              <div
                key={`${a.kind}-${a.creativeId ?? a.campaignId}`}
                className="flex items-start gap-2.5"
              >
                {a.kind === "fatigue" ? (
                  <TrendDownIcon className="mt-px shrink-0 text-[#b7791f]" />
                ) : (
                  <AlertIcon className="mt-px shrink-0 text-[#b4382a]" />
                )}
                <span className="flex flex-col gap-0.5 text-[12px]">
                  <span className="font-semibold">
                    {a.kind === "fatigue"
                      ? `“${a.name}” is fatiguing`
                      : `Disapproved: ${a.name}`}
                  </span>
                  <span className="text-muted">
                    {a.detail}.{" "}
                    <Link
                      href={
                        a.kind === "fatigue" && a.creativeId
                          ? `/briefs/new?from=${a.creativeId}`
                          : a.href
                      }
                      className="font-semibold text-orange"
                    >
                      {a.kind === "fatigue"
                        ? "Spin 3 variations"
                        : "Fix and resubmit"}
                    </Link>
                  </span>
                </span>
              </div>
            ))}
            {data.counts.failedRenders > 0 ? (
              <div className="flex items-start gap-2.5">
                <AlertIcon className="mt-px shrink-0 text-[#b4382a]" />
                <span className="flex flex-col gap-0.5 text-[12px]">
                  <span className="font-semibold">
                    {data.counts.failedRenders} render
                    {data.counts.failedRenders === 1 ? "" : "s"} failed
                  </span>
                  <span className="text-muted">
                    Credits were not charged.{" "}
                    <Link
                      href="/creatives?status=failed"
                      className="font-semibold text-orange"
                    >
                      Retry
                    </Link>
                  </span>
                </span>
              </div>
            ) : null}
            {ctx.credits.balance <= 10 ? (
              <div className="flex items-start gap-2.5">
                <AlertIcon className="mt-px shrink-0 text-[#b7791f]" />
                <span className="flex flex-col gap-0.5 text-[12px]">
                  <span className="font-semibold">
                    {ctx.credits.balance} credits left
                  </span>
                  <span className="text-muted">
                    A UGC video needs 40.{" "}
                    <Link
                      href="/settings/billing"
                      className="font-semibold text-orange"
                    >
                      Top up
                    </Link>
                  </span>
                </span>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
function Sparkline({ points }: { points: number[] }) {
  const w = 120;
  const h = 44;
  if (points.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const max = Math.max(...points, 0.0001);
  const min = Math.min(...points, 0);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - 4 - ((v - min) / (max - min || 1)) * (h - 8);
  const d = points
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="#e65c32" fillOpacity="0.12" />
      <path
        d={d}
        fill="none"
        stroke="#e65c32"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={w}
        cy={y(last)}
        r="3.5"
        fill="#e65c32"
        stroke="#ffffff"
        strokeWidth="2"
      />
    </svg>
  );
}
