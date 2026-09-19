import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/server/org";
import { getCampaign, isPending } from "@/server/ads";
import { retryPublishAction, setAdStatusAction, setCampaignStatusAction, syncCampaignAction } from "@/server/ads-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice, PlatformMark, StatusChip, money, relative } from "../ui";

export const dynamic = "force-dynamic";

const OBJECTIVE_LABEL: Record<string, string> = { awareness: "Awareness", traffic: "Traffic", engagement: "Engagement", leads: "Leads", sales: "Sales" };

function fmtDate(iso: string | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<{ syncing?: string }> }) {
  const ctx = await requireOrg();
  const { campaignId } = await params;
  const { syncing } = await searchParams;
  const c = await getCampaign(ctx.org.id, campaignId);
  if (!c) notFound();
  const canEdit = ctx.role !== "viewer";
  const publishing = c.status === "draft";
  const published = !isPending(c.externalId);
  const adList = c.adSets.flatMap((s) => s.ads);
  const reviewed = adList.filter((a) => a.review);
  const disapproved = reviewed.filter((a) => a.review?.status === "disapproved");
  const t = c.raw.targeting;

  return (
    <>
      <AutoRefresh active={publishing || Boolean(syncing)} everyMs={2500} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/campaigns" className="hover:text-ink">
              Campaigns
            </Link>{" "}
            · {c.account.name}
          </div>
          <h1 className="m-0 truncate text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {c.name}{" "}
            <span className="font-serif italic tracking-[-0.6px] text-orange">
              {publishing ? "is publishing…" : c.status === "error" ? "needs attention." : c.status === "active" ? "is live." : c.status === "paused" ? "is paused." : "is archived."}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
            <PlatformMark platform={c.platform} sandbox={c.sandbox} />
            <StatusChip status={publishing ? "publishing" : c.status} label={publishing ? "Publishing" : undefined} />
            <span>{c.objective ? OBJECTIVE_LABEL[c.objective] : "—"}</span>
            <span className="tabular">{money(c.dailyBudgetMinor, c.currency)} / day</span>
            <span>Synced {relative(c.lastSyncedAt)}</span>
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {c.status === "error" ? (
              <form action={retryPublishAction.bind(null, c.id)}>
                <button type="submit" className="btn btn-orange h-11">
                  Retry publish
                </button>
              </form>
            ) : null}
            {c.status === "active" ? (
              <form action={setCampaignStatusAction.bind(null, c.id, "paused")}>
                <button type="submit" className="btn btn-outline h-11">
                  Pause
                </button>
              </form>
            ) : null}
            {c.status === "paused" ? (
              <form action={setCampaignStatusAction.bind(null, c.id, "active")}>
                <button type="submit" className="btn btn-orange h-11">
                  Resume
                </button>
              </form>
            ) : null}
            {c.status !== "archived" && !publishing ? (
              <form action={setCampaignStatusAction.bind(null, c.id, "archived")}>
                <button type="submit" className="btn btn-outline h-11 text-muted">
                  Archive
                </button>
              </form>
            ) : null}
            {published ? (
              <form action={syncCampaignAction.bind(null, c.id)}>
                <button type="submit" className="btn btn-dark h-11">
                  Sync now
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </header>

      {c.raw.error ? (
        <Notice tone="error">
          <span className="font-semibold">Publish failed.</span> {c.raw.error}
        </Notice>
      ) : null}
      {syncing ? <Notice tone="info">Syncing review outcomes and metrics from {c.sandbox ? "the sandbox" : "the platform"}…</Notice> : null}
      {disapproved.length ? (
        <Notice tone="error">
          {disapproved.length} ad{disapproved.length === 1 ? " was" : "s were"} disapproved. Fix the creative and publish a new campaign, or appeal in the platform&rsquo;s Ads Manager.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="flex min-w-0 flex-col gap-4">
          {c.adSets.map((set) => (
            <section key={set.id} className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold">{set.name}</span>
                  <span className="text-[11px] text-muted">
                    {set.placements.length} placement{set.placements.length === 1 ? "" : "s"} · {set.ads.length} ad{set.ads.length === 1 ? "" : "s"} · {isPending(set.externalId) ? "not on platform yet" : set.externalId}
                  </span>
                </div>
                {/* The header chip already says it; only a set that differs from the campaign gets its own. */}
                {(set.status === "draft" ? "publishing" : set.status) !== (publishing ? "publishing" : c.status) ? (
                  <StatusChip status={set.status === "draft" ? "publishing" : set.status} label={set.status === "draft" ? "Publishing" : undefined} />
                ) : null}
              </div>
              {set.ads.length ? (
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[1.5px] text-muted">
                      <th className="px-4 py-2.5 font-semibold">Ad</th>
                      <th className="px-3 py-2.5 font-semibold">Placement</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Review</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Platform id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {set.ads.map((ad) => (
                      <tr key={ad.id} className="border-t border-line align-top">
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            {ad.creative.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={ad.creative.previewUrl} alt="" className="h-[56px] w-[44px] shrink-0 rounded-[5px] border border-line object-cover" />
                            ) : (
                              <div className="h-[56px] w-[44px] shrink-0 rounded-[5px] bg-well" />
                            )}
                            <div className="flex min-w-0 flex-col gap-0.5">
                              {ad.creative.id ? (
                                <Link href={`/creatives/${ad.creative.id}`} className="truncate font-semibold hover:text-orange">
                                  {ad.creative.name}
                                </Link>
                              ) : (
                                <span className="truncate font-semibold">{ad.creative.name}</span>
                              )}
                              <span className="text-[11px] text-muted">{ad.name}</span>
                              {ad.error ? <span className="text-[11px] text-[#b4382a]">{ad.error}</span> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-col">
                            <span>{ad.creative.placementLabel}</span>
                            <span className="text-[11px] text-muted">{ad.creative.ratio}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <StatusChip status={ad.status === "draft" ? "publishing" : ad.status} label={ad.status === "draft" ? "Publishing" : undefined} />
                            {canEdit && !isPending(ad.externalId) && (ad.status === "active" || ad.status === "paused") ? (
                              <form action={setAdStatusAction.bind(null, ad.id, ad.status === "active" ? "paused" : "active")}>
                                <button type="submit" className="whitespace-nowrap text-[11px] font-semibold text-muted hover:text-ink">
                                  {ad.status === "active" ? "Pause ad" : "Resume ad"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {ad.review ? (
                            <div className="flex flex-col gap-1">
                              <StatusChip status={ad.review.status} />
                              {ad.review.reasons?.length ? <span className="max-w-[26ch] text-[11px] text-[#b4382a]">{ad.review.reasons.join("; ")}</span> : null}
                              <span className="text-[11px] text-muted">{ad.review.effectiveStatus ?? ""}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted">{isPending(ad.externalId) ? "—" : "Not checked yet"}</span>
                          )}
                        </td>
                        <td className="tabular px-4 py-3 text-right text-[11px] text-muted">
                          <span className="block max-w-[22ch] truncate" title={ad.externalId}>
                            {isPending(ad.externalId) ? "pending" : ad.externalId}
                          </span>
                          {ad.creativeExternalId ? (
                            <span className="block max-w-[22ch] truncate" title={ad.creativeExternalId}>
                              creative {ad.creativeExternalId}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-4 py-4 text-[13px] text-muted">No ads in this set.</div>
              )}
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Setup</span>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
              <dt className="text-muted">Objective</dt>
              <dd className="m-0 font-semibold">{c.objective ? OBJECTIVE_LABEL[c.objective] : "—"}</dd>
              <dt className="text-muted">Budget</dt>
              <dd className="tabular m-0 font-semibold">{money(c.dailyBudgetMinor, c.currency)} / day</dd>
              <dt className="text-muted">Schedule</dt>
              <dd className="m-0 font-semibold">
                {fmtDate(c.raw.schedule?.startAt) ?? "Now"} → {fmtDate(c.raw.schedule?.endAt) ?? "ongoing"}
              </dd>
              {t ? (
                <>
                  <dt className="text-muted">Audience</dt>
                  <dd className="m-0 font-semibold">
                    {t.countries.join(", ")} · {t.ageMin}–{t.ageMax} · {t.genders.length === 1 ? (t.genders[0] === "female" ? "women" : "men") : "everyone"}
                    {t.interests.length ? ` · ${t.interests.join(", ")}` : ""}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">Placements</dt>
              <dd className="m-0 font-semibold">{(c.raw.placements ?? []).join(", ") || "—"}</dd>
              <dt className="text-muted">Published</dt>
              <dd className="m-0 font-semibold">{c.raw.publishMode === "active" ? "Active" : "As paused"}</dd>
            </dl>
          </section>

          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Platform ids</span>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
              <dt className="text-muted">Account</dt>
              <dd className="tabular m-0 truncate" title={c.account.externalId}>
                {c.account.externalId}
              </dd>
              <dt className="text-muted">Campaign</dt>
              <dd className="tabular m-0 truncate" title={c.externalId}>
                {published ? c.externalId : "pending"}
              </dd>
              {c.adSets.map((s) => (
                <span key={s.id} className="contents">
                  <dt className="text-muted">Ad set</dt>
                  <dd className="tabular m-0 truncate" title={s.externalId}>
                    {isPending(s.externalId) ? "pending" : s.externalId}
                  </dd>
                </span>
              ))}
              <dt className="text-muted">Operation</dt>
              <dd className="tabular m-0 truncate text-muted">{c.id}</dd>
            </dl>
          </section>

          <section className="panel flex flex-col gap-2 px-4 py-3.5">
            <span className="eyebrow">Activity</span>
            {c.raw.log?.length ? (
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {[...c.raw.log].reverse().map((l, i) => (
                  <li key={i} className="flex flex-col text-[12px]">
                    <span className={l.message.startsWith("Failed") ? "text-[#b4382a]" : ""}>{l.message}</span>
                    <span className="text-[11px] text-muted">{relative(new Date(l.at))}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <span className="text-[12px] text-muted">Nothing yet.</span>
            )}
          </section>

          {published ? (
            <Link href="/performance" className="btn btn-outline h-11">
              See performance <span aria-hidden="true">↗︎</span>
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
