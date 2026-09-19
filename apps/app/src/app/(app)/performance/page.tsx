import { PageHeader } from "@/components/workspace-ui";
import { SandboxBanner } from "@/components/sandbox-banner";
import Link from "next/link";
import { requireOrg } from "@/server/org";
import { loadPerformance } from "@/server/ads";
import { pauseAdsAction as pauseAds, syncAllAction } from "@/server/ads-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { AlertIcon, TrendDownIcon } from "@/components/icons";
import {
  Notice,
  PlatformMark,
  StatusChip,
  integer,
  money,
  multiple,
  percent,
  relative,
} from "../campaigns/ui";
import { Delta, SeriesChart, Sparkline } from "./charts";

export const dynamic = "force-dynamic";

const RANGES = [7, 14, 30] as const;

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; syncing?: string }>;
}) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number])
    ? Number(sp.days)
    : 7;
  const p = await loadPerformance(ctx.org.id, ctx.brand?.id ?? null, days);
  const cur = p.currency;
  const fmtMoney = (v: number) => money(v, cur, { compact: true });
  const top = p.creatives[0];
  const canEdit = ctx.role !== "viewer";
  const sandboxOnly = p.creatives.length > 0 && p.creatives.every((c) => c.sandbox);

  return (
    <>
      <AutoRefresh active={Boolean(sp.syncing)} everyMs={3000} />
      <PageHeader
        title="Performance"
        description="Track spend, measure creative impact, and find your next winning direction."
        actions={
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-[7px] border border-line bg-surface p-[3px] text-[12px] font-medium">
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={`/performance?days=${d}`}
                  className={`inline-flex min-h-9 items-center rounded-[5px] px-3 ${d === days ? "bg-ink text-white" : "text-[#4a4b44] hover:bg-paper"}`}
                >
                  {d}d
                </Link>
              ))}
            </div>
            <a
              href={`/api/performance/export.csv?days=${days}`}
              className="btn btn-outline h-11"
            >
              Export CSV
            </a>
            {p.accounts ? (
              <form action={syncAllAction}>
                <button type="submit" className="btn btn-dark h-11">
                  Sync now
                </button>
              </form>
            ) : null}
          </div>
        }
      />
      {sandboxOnly ? <SandboxBanner where="performance" /> : null}

      {sp.syncing ? (
        <Notice tone="info">
          Syncing every connected account… this page refreshes on its own.
        </Notice>
      ) : null}
      {!p.accounts ? (
        <Notice tone="info">
          No ad accounts connected for {ctx.brand?.name ?? "this brand"}.{" "}
          <Link href="/campaigns" className="font-semibold text-orange">
            Connect one ↗︎
          </Link>{" "}
          — a sandbox account works offline and fills these views with synthetic
          data.
        </Notice>
      ) : !p.hasData ? (
        <Notice tone="info">
          Connected, but nothing has synced for this range yet. Publish a
          campaign and press Sync now, or wait for the hourly job.
        </Notice>
      ) : null}

      {/* Totals */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: "Spend",
            value: money(p.totals.spend, cur),
            now: p.totals.spend,
            prev: p.previous.spend,
            invert: true,
            fmt: (v: number) => money(v, cur, { compact: true }),
          },
          {
            label: "Impressions",
            value: integer(p.totals.impressions),
            now: p.totals.impressions,
            prev: p.previous.impressions,
            fmt: integer,
          },
          {
            label: "CTR",
            value: percent(p.totals.ctr),
            now: p.totals.ctr,
            prev: p.previous.ctr,
            fmt: (v: number) => percent(v),
          },
          {
            label: "CPA",
            value: p.totals.cpa !== null ? money(p.totals.cpa, cur) : "—",
            now: p.totals.cpa,
            prev: p.previous.cpa,
            invert: true,
            fmt: (v: number) => money(v, cur),
          },
          {
            label: "ROAS",
            value: multiple(p.totals.roas),
            now: p.totals.roas,
            prev: p.previous.roas,
            fmt: multiple,
          },
        ].map((t) => (
          <div
            key={t.label}
            className="panel flex flex-col gap-1.5 px-4 py-3.5"
          >
            <span className="eyebrow">{t.label}</span>
            <span className="tabular text-[26px] font-medium leading-none tracking-[-1px]">
              {t.value}
            </span>
            <Delta
              now={t.now}
              prev={t.prev}
              invert={t.invert}
              format={t.fmt as (v: number) => string}
            />
          </div>
        ))}
      </section>

      {/* Two small charts, not a dual axis */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Daily spend</span>
            <span className="tabular text-[12px] text-muted">
              {money(p.totals.spend, cur)} total
            </span>
          </div>
          <SeriesChart
            points={p.series.map((s) => ({ date: s.date, value: s.spend }))}
            format={fmtMoney}
            area
            ariaLabel={`Daily spend over the last ${days} days`}
          />
        </div>
        <div className="panel flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Daily ROAS</span>
            <span className="tabular text-[12px] text-muted">
              {multiple(p.totals.roas)} average
            </span>
          </div>
          <SeriesChart
            points={p.series.map((s) => ({ date: s.date, value: s.roas }))}
            format={(v) => `${v.toFixed(1)}×`}
            ariaLabel={`Daily return on ad spend over the last ${days} days`}
          />
        </div>
      </section>

      {/* Per creative */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="eyebrow">By creative</div>
          <span className="text-[12px] text-muted">
            {p.creatives.length
              ? `${p.creatives.length} with delivery · sparkline = daily CTR`
              : ""}
          </span>
        </div>
        {p.creatives.length ? (
          <div className="panel overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[1.5px] text-muted">
                  <th className="px-4 py-3 font-semibold">Creative</th>
                  <th className="px-3 py-3 font-semibold">Platform</th>
                  <th className="px-3 py-3 text-right font-semibold">Spend</th>
                  <th className="px-3 py-3 text-right font-semibold">Impr.</th>
                  <th className="px-3 py-3 text-right font-semibold">CTR</th>
                  <th className="px-3 py-3 text-right font-semibold">CPA</th>
                  <th className="px-3 py-3 text-right font-semibold">ROAS</th>
                  <th className="px-3 py-3 text-right font-semibold">Trend</th>
                  <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {p.creatives.map((c) => (
                  <tr
                    key={c.creativeId}
                    className="border-t border-line hover:bg-paper"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {c.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.previewUrl}
                            alt=""
                            className="h-[48px] w-[38px] shrink-0 rounded-[5px] border border-line object-cover"
                          />
                        ) : (
                          <div className="h-[48px] w-[38px] shrink-0 rounded-[5px] bg-[#efeee8]" />
                        )}
                        {c.creativeId.startsWith("ad:") ? (
                          <span className="font-semibold">{c.name}</span>
                        ) : (
                          <Link
                            href={`/creatives/${c.creativeId}`}
                            className="font-semibold hover:text-orange"
                          >
                            {c.name}
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <PlatformMark platform={c.platform} sandbox={c.sandbox} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {money(c.spend, cur)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {integer(c.impressions)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {percent(c.ctr)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {c.cpa !== null ? money(c.cpa, cur) : "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {multiple(c.roas)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end">
                        <Sparkline values={c.trend} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.creativeId.startsWith("ad:") ? null : (
                        <div className="flex items-center justify-end gap-3 whitespace-nowrap text-[12px]">
                          <Link href={`/briefs/new?from=${c.creativeId}`} className="font-semibold text-orange" title="A new round of concepts that keep this promise">Refresh ↗︎</Link>
                          {c.adIds.length && canEdit ? (
                            <form action={pauseAds.bind(null, c.adIds)}>
                              <button type="submit" className="text-muted hover:text-ink">Pause</button>
                            </form>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel border-dashed p-5 text-[13px] text-muted">
            Nothing delivered in this range.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div id="fatigue" className="panel flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Creative fatigue</span>
            <span className="text-[11px] text-muted">
              CTR down ≥25% over 5 days
            </span>
          </div>
          {p.alerts.length ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {p.alerts.map((a) => (
                <li key={a.creativeId} className="flex items-start gap-2.5">
                  <TrendDownIcon className="mt-px shrink-0 text-[#b7791f]" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[12px]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{a.name}</span>
                      <span className="tabular shrink-0 text-[#b4382a]">
                        −{Math.round(a.drop * 100)}%
                      </span>
                    </span>
                    <span className="tabular text-muted">
                      {percent(a.ctrPrior)} → {percent(a.ctrRecent)} CTR ·{" "}
                      {a.creativeId.startsWith("ad:") ? (
                        "make a fresh variation"
                      ) : (
                        <Link
                          href={`/briefs/new?from=${a.creativeId}`}
                          className="font-semibold text-orange"
                        >
                          Refresh this creative ↗︎
                        </Link>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted">
              {p.hasData
                ? "No creative is wearing out."
                : "Alerts appear once there are ten days of delivery."}
            </p>
          )}
        </div>

        <div className="panel flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Disapproved ads</span>
            <span className="text-[11px] text-muted">
              {p.disapproved.length ? `${p.disapproved.length} to fix` : ""}
            </span>
          </div>
          {p.disapproved.length ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {p.disapproved.map((d) => (
                <li key={d.adId} className="flex items-start gap-2.5">
                  <AlertIcon className="mt-px shrink-0 text-[#b4382a]" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[12px]">
                    <span className="flex items-center justify-between gap-2">
                      <Link
                        href={`/campaigns/${d.campaignId}`}
                        className="truncate font-semibold hover:text-orange"
                      >
                        {d.adName}
                      </Link>
                      <StatusChip status="disapproved" />
                    </span>
                    <span className="text-muted">
                      {d.reasons[0] ?? "No reason given"} · {d.campaignName} ·{" "}
                      {relative(d.checkedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted">
              Every published ad passed review.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
