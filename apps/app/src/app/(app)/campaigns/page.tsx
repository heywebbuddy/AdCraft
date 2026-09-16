import Link from "next/link";
import { PLATFORM_COVERS, PLATFORM_ENV } from "@adcraft/ads";
import { requireOrg } from "@/server/org";
import { listCampaigns, platformCards } from "@/server/ads";
import { disconnectAccountAction } from "@/server/ads-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice, PLATFORM_NAMES, PlatformMark, StatusChip, money, relative } from "./ui";

export const dynamic = "force-dynamic";

const OBJECTIVE_LABEL: Record<string, string> = { awareness: "Awareness", traffic: "Traffic", engagement: "Engagement", leads: "Leads", sales: "Sales" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ connected?: string; accounts?: string; error?: string }> }) {
  const ctx = await requireOrg();
  const { connected, accounts, error } = await searchParams;
  const [cards, campaignRows] = await Promise.all([platformCards(ctx.org.id, ctx.brand?.id ?? null), listCampaigns(ctx.org.id, ctx.brand?.id ?? null)]);
  const connectedCount = cards.reduce((n, c) => n + c.accounts.filter((a) => a.status === "connected").length, 0);
  const publishing = campaignRows.some((c) => c.status === "draft");
  const live = campaignRows.filter((c) => c.status === "active").length;
  const canEdit = ctx.role !== "viewer";

  return (
    <>
      <AutoRefresh active={publishing} everyMs={2500} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">Campaigns</div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {connectedCount === 0 ? (
              <>
                Connect an ad account. <span className="font-serif italic tracking-[-0.6px] text-orange">Publish without leaving.</span>
              </>
            ) : (
              <>
                {live === 0 ? "Nothing live yet." : `${live} live campaign${live === 1 ? "" : "s"}.`}{" "}
                <span className="font-serif italic tracking-[-0.6px] text-orange">{publishing ? "One is publishing now." : "Every ad rolls up to its creative."}</span>
              </>
            )}
          </h1>
          <p className="m-0 max-w-[62ch] text-[15px] text-muted">
            Meta covers Facebook and Instagram; Google covers Demand Gen and YouTube. Tokens are encrypted at rest and refreshed before they expire.
          </p>
        </div>
        {connectedCount > 0 && canEdit ? (
          <Link href="/campaigns/new" className="btn btn-orange h-11">
            New campaign <span aria-hidden="true" className="text-lg leading-none">↗</span>
          </Link>
        ) : null}
      </header>

      {connected ? (
        <Notice tone="ok">
          {PLATFORM_NAMES[connected as keyof typeof PLATFORM_NAMES] ?? connected} connected — {accounts ?? 1} ad account{accounts === "1" ? "" : "s"} added. Insights start syncing within the hour.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error === "forbidden" ? "Only editors and owners can connect ad accounts." : error}</Notice> : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="eyebrow">Connected accounts</div>
          <span className="text-[12px] text-muted">{connectedCount ? `${connectedCount} connected` : "None yet"}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <section key={card.platform} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <PlatformMark platform={card.platform} />
                  <span className="text-[12px] text-muted">{PLATFORM_COVERS[card.platform]}</span>
                </div>
                {card.configured ? <StatusChip status="connected" label="Live API" /> : <StatusChip status="sandbox" label="Sandbox" />}
              </div>

              {card.accounts.length ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {card.accounts.map((a) => (
                    <li key={a.id} className="flex flex-col gap-2 rounded-[7px] border border-line px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] font-semibold">{a.name}</span>
                        <StatusChip status={a.status} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[11px] text-muted">
                          {a.currency} · synced {relative(a.lastSyncedAt)}
                          {a.tokenExpiresAt && a.status === "connected" ? ` · token ${a.tokenExpiresAt < new Date() ? "expired" : `to ${a.tokenExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}` : ""}
                        </span>
                        {canEdit && a.status === "connected" ? (
                          <form action={disconnectAccountAction.bind(null, a.id)}>
                            <button type="submit" className="text-[11px] text-muted hover:text-ink">
                              Disconnect
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[13px] text-muted">
                  {card.configured ? `Sign in to ${card.label} and pick the ad accounts to use.` : `No ${PLATFORM_ENV[card.platform][0]} in .env — connecting creates a sandbox account that simulates the whole flow.`}
                </p>
              )}

              {canEdit ? (
                <a href={`/api/connect/${card.platform}`} className={`btn h-10 self-start ${card.accounts.length ? "btn-outline" : "btn-dark"}`}>
                  {card.accounts.length ? "Reconnect" : card.configured ? `Connect ${card.label}` : `Connect sandbox`}
                </a>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="eyebrow">Campaigns</div>
          <span className="text-[12px] text-muted">{campaignRows.length ? `${campaignRows.length} total` : ""}</span>
        </div>
        {campaignRows.length ? (
          <div className="panel overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[1.5px] text-muted">
                  <th className="px-4 py-3 font-semibold">Campaign</th>
                  <th className="px-3 py-3 font-semibold">Platform</th>
                  <th className="px-3 py-3 font-semibold">Objective</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Daily budget</th>
                  <th className="px-3 py-3 text-right font-semibold">Ads</th>
                  <th className="px-4 py-3 text-right font-semibold">Last synced</th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((c) => (
                  <tr key={c.id} className="border-t border-line hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${c.id}`} className="flex flex-col">
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-[11px] text-muted">
                          {c.accountName}
                          {c.error ? ` · ${c.error.slice(0, 80)}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <PlatformMark platform={c.platform} sandbox={c.sandbox} />
                    </td>
                    <td className="px-3 py-3">{c.objective ? OBJECTIVE_LABEL[c.objective] : "—"}</td>
                    <td className="px-3 py-3">
                      <StatusChip status={c.status === "draft" ? "publishing" : c.status} label={c.status === "draft" ? "Publishing" : undefined} />
                    </td>
                    <td className="tabular px-3 py-3 text-right">{money(c.dailyBudgetMinor, c.currency)}</td>
                    <td className="tabular px-3 py-3 text-right">{c.adsCount}</td>
                    <td className="tabular px-4 py-3 text-right text-muted">{relative(c.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
            <div className="font-serif text-[22px] italic">No campaigns yet.</div>
            <p className="m-0 max-w-[52ch] text-[13px] text-muted">
              {connectedCount
                ? "Pick finished creatives, an audience and a budget. Adcraft maps one form to each platform's native objects and publishes as paused so you can review first."
                : "Connect an account above — a sandbox one works offline — then build your first campaign from finished creatives."}
            </p>
            {connectedCount && canEdit ? (
              <Link href="/campaigns/new" className="btn btn-dark h-11">
                Build a campaign <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
