import { requireOrg } from "@/server/org";
import { creativeSummary, getApproval, listComments, type ApprovalStatus } from "@/server/collab-data";
import { addCommentForm, decideForm, requestApprovalForm, resolveCommentForm } from "@/server/collab";

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const chipClass: Record<ApprovalStatus, string> = {
  draft: "border-line text-muted",
  in_review: "border-[#f0c987] bg-[#fdf3e2] text-[#8a5a0c]",
  approved: "border-[#bfe0c8] bg-[#e9f6ec] text-[#3f7a55]",
  changes_requested: "border-[#f3c1b8] bg-[#fdeae6] text-[#b4382a]",
};

export function ApprovalChip({ status }: { status: ApprovalStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold ${chipClass[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "approved" ? "bg-[#3f7a55]" : status === "in_review" ? "bg-[#d9932a]" : status === "changes_requested" ? "bg-[#b4382a]" : "bg-[#c9c8bf]"}`} />
      {APPROVAL_LABEL[status]}
    </span>
  );
}

function relative(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const textareaClass = "min-h-[84px] w-full resize-y rounded-[7px] border border-line bg-white px-3 py-2 text-[14px] outline-none focus:border-ink";

export type ReviewPanelProps = {
  creativeId: string;
  /** Pin new comments to one size (variant) instead of the whole creative. */
  variantId?: string | null;
  /** Variant labels, so pinned comments can say which size they refer to. */
  variantLabels?: Record<string, string>;
};

/**
 * Approval status, comment thread and the actions the viewer's role allows.
 * Server component: mount it anywhere inside the (app) group with a creativeId.
 *   viewer  → comment
 *   editor  → comment, request approval, approve / request changes
 *   owner   → everything
 */
export async function ReviewPanel({ creativeId, variantId = null, variantLabels = {} }: ReviewPanelProps) {
  const ctx = await requireOrg();
  const creative = await creativeSummary(creativeId, ctx.org.id);
  if (!creative) return <div className="panel p-4 text-[13px] text-muted">This creative isn’t in your workspace.</div>;
  const [approval, comments] = await Promise.all([getApproval(creativeId), listComments(creativeId)]);
  const status: ApprovalStatus = approval?.status ?? "draft";
  const canRequest = ctx.role === "owner" || ctx.role === "editor";
  const canApprove = ctx.role === "owner" || ctx.role === "editor";
  const open = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);

  return (
    <section className="panel flex flex-col divide-y divide-line">
      {/* Approval */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Approval</span>
          <ApprovalChip status={status} />
        </div>
        {approval?.note ? <p className="m-0 rounded-[7px] bg-paper px-3 py-2 text-[13px] italic">“{approval.note}”</p> : null}
        <p className="m-0 text-[12px] text-muted">
          {status === "draft"
            ? "Not yet sent for review."
            : status === "in_review"
              ? `Requested by ${approval?.requestedBy?.name ?? "a teammate"} · ${relative(approval!.updatedAt)}`
              : `${APPROVAL_LABEL[status]} by ${approval?.decidedBy ?? "a teammate"} · ${approval?.decidedAt ? relative(approval.decidedAt) : ""}`}
        </p>

        {canRequest && status !== "in_review" && status !== "approved" ? (
          <form action={requestApprovalForm} className="flex flex-col gap-2">
            <input type="hidden" name="creativeId" value={creativeId} />
            <input name="note" placeholder="Note for the reviewer (optional)" className="h-10 rounded-[7px] border border-line bg-white px-3 text-[13px] outline-none focus:border-ink" />
            <button className="btn btn-dark h-10 self-start text-[13px]">Request approval</button>
          </form>
        ) : null}

        {canApprove && status !== "approved" ? (
          <form action={decideForm} className="flex flex-col gap-2">
            <input type="hidden" name="creativeId" value={creativeId} />
            <input name="note" placeholder="Decision note (optional)" className="h-10 rounded-[7px] border border-line bg-white px-3 text-[13px] outline-none focus:border-ink" />
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="approve" className="btn btn-orange h-10 text-[13px]">
                Approve ✓
              </button>
              <button name="decision" value="changes_requested" className="btn btn-outline h-10 text-[13px]">
                Request changes
              </button>
            </div>
          </form>
        ) : null}
        {canApprove && status === "approved" ? (
          <form action={decideForm} className="flex items-center gap-2">
            <input type="hidden" name="creativeId" value={creativeId} />
            <button name="decision" value="changes_requested" className="text-[12px] font-semibold text-muted hover:text-ink">
              Reopen and request changes
            </button>
          </form>
        ) : null}
        {!canRequest ? <p className="m-0 text-[12px] text-muted">Viewers can comment; editors and owners approve.</p> : null}
      </div>

      {/* Thread */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Comments</span>
          <span className="text-[11px] text-muted">
            {open.length} open{resolved.length ? ` · ${resolved.length} resolved` : ""}
          </span>
        </div>
        {comments.length === 0 ? <p className="m-0 text-[13px] text-muted">No comments yet. Say what should change, or what’s working.</p> : null}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {[...open, ...resolved].map((c) => (
            <li key={c.id} className={`flex gap-2.5 ${c.resolvedAt ? "opacity-55" : ""}`}>
              <span className={`viewer-avatar viewer-avatar-sm mt-0.5 ${c.authorId ? "" : "viewer-avatar-guest"}`}>
                {c.authorName.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <span className="font-semibold">{c.authorName}</span>
                  <span className="text-muted">{relative(c.createdAt)}</span>
                  {c.variantId && variantLabels[c.variantId] ? (
                    <span className="rounded bg-[#efeee8] px-1.5 py-px text-[10px] font-semibold text-[#4a4b44]">{variantLabels[c.variantId]}</span>
                  ) : null}
                  {c.resolvedAt ? <span className="text-[#3f7a55]">Resolved</span> : null}
                </span>
                <span className={`whitespace-pre-wrap text-[13px] ${c.resolvedAt ? "line-through" : ""}`}>{c.body}</span>
                {!c.resolvedAt ? (
                  <form action={resolveCommentForm}>
                    <input type="hidden" name="commentId" value={c.id} />
                    <button className="text-[11px] font-semibold text-muted hover:text-ink">Mark resolved</button>
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <form action={addCommentForm} className="flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="creativeId" value={creativeId} />
          {variantId ? <input type="hidden" name="variantId" value={variantId} /> : null}
          <textarea name="body" required placeholder={variantId && variantLabels[variantId] ? `Comment on ${variantLabels[variantId]}…` : "Add a comment…"} className={textareaClass} />
          <button className="btn btn-outline h-10 self-start text-[13px]">Comment</button>
        </form>
      </div>
    </section>
  );
}
