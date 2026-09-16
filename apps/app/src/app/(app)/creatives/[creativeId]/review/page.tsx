import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/server/org";
import { creativeSummary, listShareLinks, rendersFor } from "@/server/collab-data";
import { createShareLinkForm, revokeShareLinkForm, saveAsTemplateForm } from "@/server/collab";
import { baseUrl } from "@/server/url";
import { ReviewPanel } from "@/components/review-panel";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

const ratioClass: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1.91:1": "aspect-[1.91/1]",
};

const inputClass = "h-10 w-full rounded-[7px] border border-line bg-white px-3 text-[13px] outline-none focus:border-ink";

export default async function CreativeReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ creativeId: string }>;
  searchParams: Promise<{ shared?: string; template?: string }>;
}) {
  const ctx = await requireOrg();
  const { creativeId } = await params;
  const { shared, template } = await searchParams;
  const creative = await creativeSummary(creativeId, ctx.org.id);
  if (!creative) notFound();
  const [sizesMap, links, origin] = await Promise.all([rendersFor([creativeId]), listShareLinks(ctx.org.id, creativeId), baseUrl()]);
  const sizes = sizesMap.get(creativeId) ?? [];
  const ready = sizes.filter((s) => s.outputKey);
  const canShare = ctx.role !== "viewer";
  const justShared = shared ? links.find((l) => l.id === shared) : null;
  const doc = creative.document as { headline?: string; brand?: { colors?: { primary?: string; accent?: string } } };
  const returnTo = `/creatives/${creativeId}/review`;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/creatives" className="hover:text-ink">
              Creatives
            </Link>{" "}
            / <Link href={`/creatives/${creativeId}`} className="hover:text-ink">{creative.name}</Link> / Review
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {creative.name}. <span className="font-serif italic text-muted">{ready.length ? `${ready.length} of ${sizes.length} sizes ready.` : "Rendering the first size."}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href={`/creatives/${creativeId}`} className="btn btn-outline h-11">
            Open in editor <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      {justShared ? (
        <section className="panel flex flex-col gap-3 border-ink p-5">
          <span className="eyebrow">Share link created</span>
          <p className="m-0 text-[13px] text-muted">
            Anyone with this link can view the creative
            {justShared.allowComments ? ", comment" : ""}
            {justShared.allowApprove ? " and approve or request changes" : ""}. No sign-in needed.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[7px] border border-line bg-paper px-3 py-2 text-[12px]">
              {origin}/share/{justShared.token}
            </code>
            <CopyButton text={`${origin}/share/${justShared.token}`} label="Copy link" />
          </div>
        </section>
      ) : null}
      {template === "saved" ? (
        <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">
          Saved as a template.{" "}
          <Link href="/settings/templates" className="font-semibold text-orange">
            See templates ↗
          </Link>
        </p>
      ) : null}

      <div className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-[26px]">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Every size</span>
              <span className="text-[12px] text-muted">{creative.brand.name}</span>
            </div>
            {sizes.length === 0 ? (
              <div className="panel border-dashed p-6 text-[13px] text-muted">No sizes yet. Renders show up here as they finish.</div>
            ) : (
              <div className="flex flex-wrap items-start gap-4 [&>*]:w-[calc(50%-8px)] lg:[&>*]:w-[calc(33.333%-11px)]">
                {sizes.map((s) => (
                  <div key={s.variantId} className="tile flex flex-col">
                    <div
                      className={`relative flex flex-col p-3.5 text-white ${ratioClass[s.ratio] ?? "aspect-[4/5]"}`}
                      style={{
                        background: s.outputKey
                          ? `url(/api/files/${s.outputKey}) center/cover`
                          : `linear-gradient(160deg, ${doc.brand?.colors?.primary ?? "#242521"} 0%, ${doc.brand?.colors?.accent ?? "#e65c32"} 130%)`,
                      }}
                    >
                      {!s.outputKey && doc.headline ? <span className="mt-auto font-serif text-[20px] leading-none tracking-[-0.4px]">{doc.headline}</span> : null}
                      <span
                        className={`absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold ${
                          s.outputKey ? "text-[#3f7a55]" : s.status === "failed" ? "text-[#b4382a]" : "text-muted"
                        }`}
                      >
                        {s.outputKey ? "Ready" : s.status === "failed" ? "Failed" : s.status === "none" ? "Waiting" : "Rendering"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-[13px] pb-[13px] pt-3 text-[12px]">
                      <span className="min-w-0 truncate font-semibold">{s.label}</span>
                      <span className="tabular text-muted">
                        {s.ratio} · {s.width}×{s.height}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {canShare ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="panel flex flex-col gap-3 p-4">
                <span className="eyebrow">Share for review</span>
                <p className="m-0 text-[13px] text-muted">A public link for a client. They see every size and, if you allow it, comment and approve without an account.</p>
                <form action={createShareLinkForm} className="flex flex-col gap-2.5">
                  <input type="hidden" name="creativeId" value={creativeId} />
                  <input type="hidden" name="kind" value="review" />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="allowComments" defaultChecked className="accent-[#e65c32]" /> Allow comments
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="allowApprove" className="accent-[#e65c32]" /> Allow approve / request changes
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    Expires in
                    <select name="expiresInDays" defaultValue="14" className="h-9 rounded-[7px] border border-line bg-white px-2 text-[12px] outline-none focus:border-ink">
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="0">never</option>
                    </select>
                  </label>
                  <button className="btn btn-dark h-10 self-start text-[13px]">Create link</button>
                </form>
                {links.length ? (
                  <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-line p-0 pt-3 text-[12px]">
                    {links.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-muted">/share/{l.token}</code>
                        <span className="text-muted">
                          {l.allowComments ? "comments" : "view"}
                          {l.allowApprove ? " + approve" : ""}
                          {l.expiresAt ? ` · until ${l.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                        </span>
                        <CopyButton text={`${origin}/share/${l.token}`} label="Copy" className="h-8" />
                        <form action={revokeShareLinkForm}>
                          <input type="hidden" name="shareLinkId" value={l.id} />
                          <button className="text-muted hover:text-[#b4382a]">Revoke</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="panel flex flex-col gap-3 p-4">
                <span className="eyebrow">Save as template</span>
                <p className="m-0 text-[13px] text-muted">Keep this layout, copy and colours as a starting point for the next brief.</p>
                <form action={saveAsTemplateForm} className="flex flex-col gap-2.5">
                  <input type="hidden" name="creativeId" value={creativeId} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input name="name" placeholder={`${creative.name} template`} className={inputClass} />
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="isShared" className="accent-[#e65c32]" /> Share with every brand in {ctx.org.name}
                  </label>
                  <button className="btn btn-outline h-10 self-start text-[13px]">Save template</button>
                </form>
              </section>
            </div>
          ) : null}
        </div>

        <ReviewPanel creativeId={creativeId} variantLabels={Object.fromEntries(sizes.map((s) => [s.variantId, s.label]))} />
      </div>
    </>
  );
}
