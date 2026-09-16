import { loadShare, type SharedCreative } from "@/server/share";
import { shareComment, shareDecide } from "@/server/share-actions";
import { ApprovalChip } from "@/components/review-panel";

export const dynamic = "force-dynamic";

const ratioClass: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1.91:1": "aspect-[1.91/1]",
};

const inputClass = "h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[15px] outline-none focus:border-ink";
const textareaClass = "min-h-[96px] w-full resize-y rounded-[7px] border border-line bg-white px-3 py-2 text-[14px] outline-none focus:border-ink";

const errors: Record<string, string> = {
  invalid: "This link isn’t valid.",
  expired: "This link has expired. Ask for a new one.",
  revoked: "This link was turned off.",
  comments_off: "Comments are off for this link.",
  approve_off: "Approving is off for this link.",
  missing: "Add your name and a message.",
};

function relative(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/**
 * Public client-review page. The token is the only credential: no session, no requireOrg.
 * Render files are served via /api/share/[token]/… which re-checks the token.
 */
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string; name?: string }>;
}) {
  const { token } = await params;
  const { ok, error, name } = await searchParams;
  const view = await loadShare(token);

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-[26px] px-6 pb-16 pt-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-[22px] font-semibold leading-none tracking-[-1.1px]">
          <span className="text-[28px] font-normal leading-[.8] text-orange">✳</span>adcraft<span className="-ml-1 text-orange">.</span>
        </div>
        <span className="text-[12px] text-muted">{view.ok ? `Shared by ${view.brandName}` : "Client review"}</span>
      </div>

      {!view.ok ? (
        <section className="flex flex-col gap-2 py-10">
          <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">{errors[view.reason] ?? "Nothing to see here."}</h1>
          <p className="m-0 text-[15px] text-muted">If you were expecting a creative to review, ask the sender for a fresh link.</p>
        </section>
      ) : view.kind === "review" ? (
        <ReviewView token={token} item={view.item} brandName={view.brandName} allowComments={view.link.allowComments} allowApprove={view.link.allowApprove} ok={ok} error={error} name={name} />
      ) : (
        <GalleryView token={token} items={view.items} brandName={view.brandName} />
      )}
    </main>
  );
}

function Sizes({ token, item, compact = false }: { token: string; item: SharedCreative; compact?: boolean }) {
  const doc = item.creative.document as { headline?: string; brand?: { colors?: { primary?: string; accent?: string } } };
  const ready = item.sizes.filter((s) => s.outputKey);
  if (ready.length === 0) {
    return <div className="panel border-dashed p-6 text-[13px] text-muted">Still rendering. Check back in a minute.</div>;
  }
  return (
    <div className={`grid items-start gap-4 ${compact ? "grid-cols-2 md:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
      {ready.map((s) => (
        <a key={s.variantId} href={`/api/share/${token}/${s.outputKey}`} target="_blank" rel="noreferrer" className="tile flex flex-col">
          <div
            className={`relative flex flex-col p-3.5 text-white ${ratioClass[s.ratio] ?? "aspect-[4/5]"}`}
            style={{
              background: s.outputKey
                ? `url(/api/share/${token}/${s.outputKey}) center/cover`
                : `linear-gradient(160deg, ${doc.brand?.colors?.primary ?? "#242521"} 0%, ${doc.brand?.colors?.accent ?? "#e65c32"} 130%)`,
            }}
          />
          <div className="flex items-center justify-between gap-2 px-[13px] pb-[13px] pt-3 text-[12px]">
            <span className="min-w-0 truncate font-semibold">{s.label}</span>
            <span className="tabular text-muted">
              {s.ratio} · {s.width}×{s.height}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}

function ReviewView({
  token,
  item,
  brandName,
  allowComments,
  allowApprove,
  ok,
  error,
  name,
}: {
  token: string;
  item: SharedCreative;
  brandName: string;
  allowComments: boolean;
  allowApprove: boolean;
  ok?: string;
  error?: string;
  name?: string;
}) {
  const status = item.approval?.status ?? "draft";
  const open = item.comments.filter((c) => !c.resolvedAt);
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">{brandName} · for your review</div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {item.creative.name}. <span className="font-serif italic text-muted">Every size it needs to be.</span>
          </h1>
        </div>
        <ApprovalChip status={status} />
      </header>

      {error ? <p className="m-0 text-[13px] text-orange">{errors[error] ?? "Something went wrong."}</p> : null}
      {ok === "comment" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Thanks {name}, your comment is with the team.</p> : null}
      {ok === "approved" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Approved. Thanks {name}, the team has been told.</p> : null}
      {ok === "changes_requested" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Noted, {name}. The team will make changes.</p> : null}

      <div className="grid items-start gap-[26px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <Sizes token={token} item={item} />

        <div className="flex flex-col gap-4">
          {allowApprove ? (
            <section className="panel flex flex-col gap-3 p-4">
              <span className="eyebrow">Your decision</span>
              {status === "approved" ? (
                <p className="m-0 text-[13px] text-muted">Already approved{item.approval?.decidedBy ? ` by ${item.approval.decidedBy}` : ""}.</p>
              ) : null}
              <form action={shareDecide} className="flex flex-col gap-2.5">
                <input type="hidden" name="token" value={token} />
                <input name="name" required placeholder="Your name" defaultValue={name ?? ""} className={inputClass} />
                <input name="note" placeholder="A note for the team (optional)" className={inputClass} />
                <div className="flex flex-wrap gap-2">
                  <button name="decision" value="approve" className="btn btn-orange h-11">
                    Approve ✓
                  </button>
                  <button name="decision" value="changes_requested" className="btn btn-outline h-11">
                    Request changes
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="panel flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Comments</span>
              <span className="text-[11px] text-muted">{open.length} open</span>
            </div>
            {open.length === 0 ? <p className="m-0 text-[13px] text-muted">No open comments.</p> : null}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {open.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${c.authorId ? "bg-ink text-white" : "border border-dashed border-[#d4d3ca] text-muted"}`}>
                    {c.authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex gap-2 text-[12px]">
                      <span className="font-semibold">{c.authorName}</span>
                      <span className="text-muted">{relative(c.createdAt)}</span>
                    </span>
                    <span className="whitespace-pre-wrap text-[13px]">{c.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            {allowComments ? (
              <form action={shareComment} className="flex flex-col gap-2.5 border-t border-line pt-3">
                <input type="hidden" name="token" value={token} />
                <input name="name" required placeholder="Your name" defaultValue={name ?? ""} className={inputClass} />
                <textarea name="body" required placeholder="What should change? What’s working?" className={textareaClass} />
                <button className="btn btn-dark h-11 self-start">Send comment</button>
              </form>
            ) : (
              <p className="m-0 text-[12px] text-muted">Comments are off for this link.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function GalleryView({ token, items, brandName }: { token: string; items: SharedCreative[]; brandName: string }) {
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <div className="eyebrow">{brandName} · approved creative</div>
        <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
          {items.length} approved {items.length === 1 ? "creative" : "creatives"}. <span className="font-serif italic text-muted">Ready to run.</span>
        </h1>
      </header>
      {items.length === 0 ? (
        <div className="panel border-dashed p-6 text-[13px] text-muted">Nothing approved yet. This page fills up as creative is signed off.</div>
      ) : (
        <div className="flex flex-col gap-8">
          {items.map((item) => (
            <section key={item.creative.id} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="m-0 text-[20px] font-medium tracking-[-0.8px]">{item.creative.name}</h2>
                <span className="text-[12px] text-muted">{item.sizes.filter((s) => s.outputKey).length} sizes</span>
              </div>
              <Sizes token={token} item={item} compact />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
