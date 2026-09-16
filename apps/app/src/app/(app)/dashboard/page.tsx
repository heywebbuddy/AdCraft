import Link from "next/link";
import { requireOrg } from "@/server/org";
import { loadDashboard } from "@/server/dashboard";
import { loadPerformanceSummary } from "@/server/ads";
import { AlertIcon, PlayIcon, PlusIcon, SearchIcon, StarIcon, TextIcon, TrendDownIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const ratioClass: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1.91:1": "aspect-[1.91/1]",
};

const gradients = [
  "radial-gradient(120% 90% at 20% 10%, #fbe7cf 0%, #f0b489 45%, #d9744a 100%)",
  "linear-gradient(170deg, #e5ead9 0%, #b9c7a8 45%, #6f8064 100%)",
  "linear-gradient(135deg, #1d2a4a 0%, #2f4a7a 55%, #e97b5a 130%)",
  "linear-gradient(160deg, #2a5bd7 0%, #4f8bf7 50%, #d6f25a 130%)",
];

export default async function DashboardPage() {
  const ctx = await requireOrg();
  const [data, perf] = await Promise.all([
    loadDashboard(ctx.org.id, ctx.brand?.id ?? null),
    loadPerformanceSummary(ctx.org.id, ctx.brand?.id ?? null, 7),
  ]);
  // Summary amounts are in minor units (cents).
  const money = (minor: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: perf.currency || "USD", maximumFractionDigits: minor < 10000 ? 2 : 0 }).format(minor / 100);
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  const firstName = ctx.viewer.name.split(/[\s@.]/)[0];
  const readyCount = data.tiles.filter((t) => t.status === "rendered").length;
  const headline =
    data.queue.length > 0
      ? `${data.queue.length} generating right now.`
      : readyCount > 0
        ? `${readyCount} ready to review.`
        : data.counts.briefs === 0
          ? "Let’s make your first one."
          : "Pick up where you left off.";

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">{dateLabel}</div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {greeting(now)}, {firstName}. <span className="font-serif italic tracking-[-0.6px] text-orange">{headline}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex h-11 w-[220px] items-center gap-2 rounded-[7px] border border-line bg-white px-3.5 text-[13px] text-muted">
            <SearchIcon width={16} height={16} />
            <input placeholder="Search creatives" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            <span className="rounded border border-line px-1.5 text-[11px]">⌘K</span>
          </label>
          <Link href="/briefs/new" className="btn btn-orange h-11">
            New brief <span aria-hidden="true" className="text-lg leading-none">↗</span>
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="flex min-w-0 flex-col gap-[26px]">
          {/* Generating now */}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <div className="eyebrow flex items-center gap-2">
                <span className={`h-[7px] w-[7px] rounded-full ${data.queue.length ? "bg-orange shadow-[0_0_0_3px_#fbe3d9]" : "bg-line"}`} />
                Generating now
              </div>
              <span className="text-[12px] text-muted">
                {data.queue.length ? `Queue · ${data.queue.length} running` : "Queue is empty"}
              </span>
            </div>
            {data.queue.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {data.queue.map((q, i) => (
                  <div key={q.id} className="panel flex gap-3.5 p-3.5">
                    <div className="h-[72px] w-[54px] shrink-0 rounded-[5px]" style={{ background: gradients[i % gradients.length] }} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex justify-between gap-2 text-[13px]">
                        <span className="truncate font-semibold">{q.label}</span>
                        <span className="tabular whitespace-nowrap text-muted">{Math.max(1, Math.round((Date.now() - q.startedAt.getTime()) / 1000))} s</span>
                      </div>
                      <div className="text-[12px] text-muted">{q.detail}</div>
                      <div className="mt-0.5 h-[5px] overflow-hidden rounded-full bg-[#efeee8]">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-orange" />
                      </div>
                      <div className="mt-0.5 flex gap-1.5">
                        <span className="rounded bg-[#efeee8] px-[7px] py-0.5 text-[11px] text-[#4a4b44]">{q.credits} credits</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="panel flex items-center justify-between gap-4 border-dashed p-4 text-[13px] text-muted">
                Nothing in the queue. A new brief gives you ten concepts in about ten seconds.
                <Link href="/briefs/new" className="font-semibold text-orange">
                  Start one ↗
                </Link>
              </div>
            )}
          </section>

          {/* The wall */}
          <section className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="eyebrow">The wall</div>
                <h2 className="m-0 text-[24px] font-medium tracking-[-1px]">
                  Recent creative. <span className="font-serif italic text-muted">Every size it needs to be.</span>
                </h2>
              </div>
              <div className="flex gap-1 rounded-[7px] border border-line bg-white p-[3px] text-[12px] font-medium">
                {["All", "Static", "Video", "UGC"].map((f, i) => (
                  <Link
                    key={f}
                    href={i === 0 ? "/creatives" : `/creatives?kind=${f.toLowerCase()}`}
                    className={`inline-flex min-h-9 items-center rounded-[5px] px-3 ${i === 0 ? "bg-ink text-white" : "text-[#4a4b44] hover:bg-paper"}`}
                  >
                    {f}
                  </Link>
                ))}
              </div>
            </div>

            {data.tiles.length ? (
              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {data.tiles.map((t, i) => (
                  <Link key={t.id} href={`/creatives/${t.id}`} className="tile flex flex-col">
                    <div
                      className={`relative flex flex-col p-3.5 text-white ${ratioClass[t.ratio] ?? "aspect-[4/5]"}`}
                      style={{
                        background: t.previewUrl ? `url(${t.previewUrl}) center/cover` : gradients[i % gradients.length],
                      }}
                    >
                      {!t.previewUrl && t.headline ? (
                        <span className="mt-auto font-serif text-[22px] leading-none tracking-[-0.4px]">{t.headline}</span>
                      ) : null}
                      {t.kind !== "static" ? (
                        <span className="absolute left-1/2 top-[42%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink">
                          <PlayIcon />
                        </span>
                      ) : null}
                      <span
                        className={`absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold ${
                          t.status === "rendered" ? "text-[#3f7a55]" : t.status === "failed" ? "text-[#b4382a]" : "text-muted"
                        }`}
                      >
                        {t.status === "rendered" ? "Ready" : t.status === "failed" ? "Failed" : "Draft"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                      <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="text-[11px] font-medium text-muted">{t.ratio}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[11px] text-muted">
                        <span className="min-w-0 truncate">{t.model ?? t.kind}</span>
                        <span>{relative(t.updatedAt)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
                <div className="font-serif text-[22px] italic">Your wall is empty. That never lasts long.</div>
                <p className="m-0 max-w-[52ch] text-[13px] text-muted">
                  Add a product photo to {ctx.brand?.name ?? "your brand"}, write a two-line brief, and the first static ads land here in every size.
                </p>
                <Link href="/briefs/new" className="btn btn-dark h-11">
                  Write the first brief <span aria-hidden="true">↗</span>
                </Link>
              </div>
            )}

            <div className="mt-1 flex items-center gap-3">
              <Link href="/creatives" className="btn btn-outline h-11">
                All {data.counts.creatives} creative{data.counts.creatives === 1 ? "" : "s"} <span aria-hidden="true">↗</span>
              </Link>
              <span className="text-[12px] text-muted">
                {readyCount} ready · {data.tiles.length - readyCount} in progress
              </span>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <section className="panel overflow-hidden">
            <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3.5">
              <span className="eyebrow">This week</span>
              <span className="text-[11px] text-muted">{perf.connected ? "vs last 7 days" : "not connected"}</span>
            </div>
            {perf.connected && perf.hasData ? (
              <>
                <div className="flex items-end justify-between px-4 pb-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] text-muted">Return on ad spend</span>
                    <span className="tabular text-[34px] font-medium leading-none tracking-[-1.5px]">
                      {perf.roas != null ? perf.roas.toFixed(1) : "–"}
                      <span className="text-[20px] text-muted">×</span>
                    </span>
                    {perf.roas != null && perf.roasPrev != null ? (
                      <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${perf.roas >= perf.roasPrev ? "text-[#3f7a55]" : "text-[#b4382a]"}`}>
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={perf.roas >= perf.roasPrev ? "" : "rotate-180"}>
                          <path d="M5 1.5l4 6H1z" fill="currentColor" />
                        </svg>
                        {Math.abs(perf.roas - perf.roasPrev).toFixed(1)} from {perf.roasPrev.toFixed(1)}×
                      </span>
                    ) : null}
                  </div>
                  <Sparkline points={perf.series.map((d) => d.roas)} />
                </div>
                <div className="grid grid-cols-3 border-t border-line">
                  {[
                    { label: "Spend", value: money(perf.spend) },
                    { label: "CTR", value: `${(perf.ctr * 100).toFixed(1)}%` },
                    { label: "CPA", value: perf.cpa != null ? money(perf.cpa) : "–" },
                  ].map((m, i) => (
                    <div key={m.label} className={`flex flex-col gap-0.5 px-4 py-3 ${i < 2 ? "border-r border-line" : ""}`}>
                      <span className="text-[11px] text-muted">{m.label}</span>
                      <span className="tabular text-[16px] font-semibold tracking-[-0.4px]">{m.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : perf.connected ? (
              <div className="px-4 pb-4 text-[13px] text-muted">Connected. Numbers appear after the first hourly sync.</div>
            ) : (
              <div className="flex flex-col gap-2.5 px-4 pb-4">
                <p className="m-0 text-[13px] text-muted">
                  Performance shows up here once an ad account is connected. Until then, export finished creative and upload it yourself.
                </p>
                <Link href="/campaigns" className="text-[12px] font-semibold text-orange">
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
                  const pct = Math.max(8, Math.round(((w.roas ?? 0) / (top || 1)) * 100));
                  return (
                    <Link key={w.creativeId} href={`/creatives/${w.creativeId}`} className="flex items-center gap-2.5">
                      <span
                        className="h-[38px] w-[30px] shrink-0 rounded"
                        style={{ background: w.previewUrl ? `url(${w.previewUrl}) center/cover` : gradients[i % gradients.length] }}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="flex justify-between gap-2 text-[12px]">
                          <span className="min-w-0 truncate font-semibold">{w.name}</span>
                          <span className="tabular font-semibold">{w.roas != null ? `${w.roas.toFixed(1)}×` : `${(w.ctr * 100).toFixed(1)}%`}</span>
                        </span>
                        <span className="h-1 overflow-hidden rounded-full bg-[#efeee8]">
                          <span className="block h-full bg-orange" style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              <Link href={`/briefs/new?from=${perf.winners[0].creativeId}`} className="btn btn-dark mt-3 h-11 w-full text-[12px]">
                Make more like the winner <span aria-hidden="true">↗</span>
              </Link>
            </section>
          ) : null}

          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Needs attention</span>
            {data.counts.failedRenders === 0 && ctx.credits.balance > 10 && perf.alerts.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">All clear.</p>
            ) : null}
            {perf.alerts.map((a) => (
              <div key={`${a.kind}-${a.creativeId ?? a.campaignId}`} className="flex items-start gap-2.5">
                {a.kind === "fatigue" ? (
                  <TrendDownIcon className="mt-px shrink-0 text-[#b7791f]" />
                ) : (
                  <AlertIcon className="mt-px shrink-0 text-[#b4382a]" />
                )}
                <span className="flex flex-col gap-0.5 text-[12px]">
                  <span className="font-semibold">
                    {a.kind === "fatigue" ? `“${a.name}” is fatiguing` : `Disapproved: ${a.name}`}
                  </span>
                  <span className="text-muted">
                    {a.detail}.{" "}
                    <Link href={a.kind === "fatigue" && a.creativeId ? `/briefs/new?from=${a.creativeId}` : a.href} className="font-semibold text-orange">
                      {a.kind === "fatigue" ? "Spin 3 variations" : "Fix and resubmit"}
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
                    {data.counts.failedRenders} render{data.counts.failedRenders === 1 ? "" : "s"} failed
                  </span>
                  <span className="text-muted">
                    Credits were not charged.{" "}
                    <Link href="/creatives?status=failed" className="font-semibold text-orange">
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
                  <span className="font-semibold">{ctx.credits.balance} credits left</span>
                  <span className="text-muted">
                    A UGC video needs 40.{" "}
                    <Link href="/settings/billing" className="font-semibold text-orange">
                      Top up
                    </Link>
                  </span>
                </span>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-2 px-0.5 py-1">
            <span className="eyebrow">Start from</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { href: "/library/new", label: "Product photo", Icon: PlusIcon },
                { href: "/briefs/new", label: "Written brief", Icon: TextIcon },
                { href: "/creatives", label: "A winner", Icon: StarIcon },
              ].map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-1.5 rounded-[7px] border border-dashed border-[#d4d3ca] px-2.5 py-3 text-center text-[12px] font-semibold hover:border-ink"
                >
                  <Icon width={20} height={20} />
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function relative(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Sparkline({ points }: { points: number[] }) {
  const w = 120;
  const h = 44;
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
