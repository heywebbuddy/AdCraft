import Link from "next/link";
import { creativeNext, type CreativeStage } from "@/server/next-step";
import { decideForm, requestApprovalForm } from "@/server/collab";
import { money, percent, multiple, PlatformMark } from "@/app/(app)/campaigns/ui";
import { Spark } from "./spark";

/**
 * The one panel that answers "what now?" for a creative. It reads the creative's stage
 * (rendering → draft → review → approved → in a campaign → live) and shows the single
 * action that moves it forward, plus the numbers once it has delivery. Server component.
 */
const STAGE: Record<CreativeStage, { label: string; tone: string; note: string }> = {
  rendering: { label: "Rendering", tone: "bg-[#efeee8] text-muted", note: "Sizes are being produced. You can keep working — this page updates on its own." },
  failed: { label: "Needs attention", tone: "bg-[#fdf1ee] text-[#b4382a]", note: "Nothing finished. Generate again, or try another model." },
  draft: { label: "Draft", tone: "border border-line text-muted", note: "Finished and ready to publish. Send it for review, or approve it yourself." },
  in_review: { label: "In review", tone: "bg-[#fdf3e2] text-[#8a5a0c]", note: "Waiting for a decision. Owners and editors can approve here." },
  changes_requested: { label: "Changes requested", tone: "bg-[#fdeae6] text-[#b4382a]", note: "Refine it with the panel on the right, then request approval again." },
  approved: { label: "Approved", tone: "bg-[#e9f6ec] text-[#3f7a55]", note: "Approved and not yet running anywhere." },
  paused: { label: "In a campaign", tone: "bg-[#eef0e6] text-[#4e5943]", note: "Published as paused. Switch the campaign on when you are ready to spend." },
  live: { label: "Live", tone: "bg-[#e9f6ec] text-[#3f7a55]", note: "Delivering. Numbers below are the last seven days." },
};

export async function NextStep({ orgId, creativeId, renderStatus, kind, canEdit, conceptId }: { orgId: string; creativeId: string; renderStatus: "ready" | "rendering" | "failed"; kind: "static" | "video" | "ugc"; canEdit: boolean; conceptId: string | null }) {
  const n = await creativeNext(orgId, creativeId, renderStatus);
  const s = STAGE[n.stage];
  const variantHref = kind === "static" ? `/creatives/new?conceptId=${conceptId ?? ""}&variantOf=${creativeId}` : `/videos/new?conceptId=${conceptId ?? ""}&variantOf=${creativeId}`;
  const campaignHref = `/campaigns/new?creative=${creativeId}`;

  return (
    <section className="panel flex flex-col gap-3 p-5" aria-labelledby="next-step-title">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow" id="next-step-title">Next</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${s.tone}`}>
          {n.stage === "rendering" ? <Spark size={11} animate="spin" /> : null}
          {s.label}
        </span>
      </div>
      <p className="m-0 text-[13px] text-muted">{s.note}</p>

      {n.performance ? (
        <dl className="m-0 grid grid-cols-4 gap-2 rounded-[7px] border border-line bg-paper px-3 py-2.5 text-center">
          {[
            ["Spend", money(n.performance.spend, n.performance.currency, { compact: true })],
            ["Impr.", n.performance.impressions >= 1000 ? `${(n.performance.impressions / 1000).toFixed(1)}k` : String(n.performance.impressions)],
            ["CTR", percent(n.performance.ctr)],
            ["ROAS", multiple(n.performance.roas)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-[10px] uppercase tracking-[1px] text-muted">{k}</dt>
              <dd className="tabular m-0 text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {n.campaigns.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {n.campaigns.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-[13px]">
              <Link href={`/campaigns/${c.id}`} className="flex min-w-0 items-center gap-2 font-semibold hover:text-orange">
                <PlatformMark platform={c.platform} sandbox={c.sandbox} />
                <span className="truncate">{c.name}</span>
              </Link>
              <span className="shrink-0 text-[11px] text-muted">{c.status} · {c.adCount} {c.adCount === 1 ? "ad" : "ads"}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2">
        {n.stage === "draft" && canEdit ? (
          <>
            <form action={decideForm} className="contents">
              <input type="hidden" name="creativeId" value={creativeId} />
              <input type="hidden" name="decision" value="approve" />
              <button type="submit" className="btn btn-orange h-11 justify-between">Approve and continue <span aria-hidden="true">→</span></button>
            </form>
            <form action={requestApprovalForm} className="contents">
              <input type="hidden" name="creativeId" value={creativeId} />
              <button type="submit" className="btn btn-outline h-11 justify-between">Send for review <span aria-hidden="true">↗︎</span></button>
            </form>
          </>
        ) : null}
        {n.stage === "in_review" && canEdit ? (
          <form action={decideForm} className="contents">
            <input type="hidden" name="creativeId" value={creativeId} />
            <input type="hidden" name="decision" value="approve" />
            <button type="submit" className="btn btn-orange h-11 justify-between">Approve <span aria-hidden="true">→</span></button>
          </form>
        ) : null}
        {n.stage === "changes_requested" && canEdit ? (
          <form action={requestApprovalForm} className="contents">
            <input type="hidden" name="creativeId" value={creativeId} />
            <button type="submit" className="btn btn-outline h-11 justify-between">Request approval again <span aria-hidden="true">↗︎</span></button>
          </form>
        ) : null}
        {(n.stage === "approved" || n.stage === "paused" || n.stage === "live") && canEdit && n.readySizes > 0 ? (
          <Link href={campaignHref} className={`btn h-11 justify-between ${n.stage === "approved" ? "btn-orange" : "btn-outline"}`}>
            {n.stage === "approved" ? "Add to a campaign" : "Add to another campaign"} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {n.stage === "live" || n.stage === "paused" ? (
          <Link href="/performance" className="btn btn-outline h-11 justify-between">See performance <span aria-hidden="true">→</span></Link>
        ) : null}
        {n.stage !== "rendering" && canEdit && conceptId ? (
          <Link href={variantHref} className="btn btn-outline h-11 justify-between">Make a variant <span aria-hidden="true">↗︎</span></Link>
        ) : null}
      </div>
      {n.stage === "draft" && !canEdit ? <p className="m-0 text-[12px] text-muted">Viewers can comment; an editor approves.</p> : null}
    </section>
  );
}
