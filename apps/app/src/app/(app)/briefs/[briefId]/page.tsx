import { PlatformLogo } from "@/components/platform-logo";
import Link from "next/link";
import { FlowSteps } from "@/components/flow-steps";
import { Spark } from "@/components/spark";
import { MakeVideoLink } from "@/components/video-links";
import { notFound } from "next/navigation";
import type { ConceptData } from "@adcraft/db";
import { requireOrg } from "@/server/org";
import {
  DEFAULT_CONCEPT_COUNT,
  FORMATS,
  OBJECTIVES,
  PLATFORMS,
  loadBrief,
  type StoredBriefData,
} from "@/server/briefs";
import { PlayIcon, PlusIcon } from "@/components/icons";
import { generateMoreConcepts, setConceptStatus } from "../actions";
import { relative } from "../format";
import { Poller } from "./poller";

export const dynamic = "force-dynamic";

const formatLabel = Object.fromEntries(
  FORMATS.map((f) => [f.id, f.label]),
) as Record<string, string>;
const objectiveLabel = Object.fromEntries(
  OBJECTIVES.map((o) => [o.id, o.label]),
) as Record<string, string>;
const platformLabel = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.label]),
) as Record<string, string>;
const kindLabel: Record<string, string> = {
  static: "Static",
  video: "Video",
  ugc: "UGC",
};

type StoredConceptData = ConceptData & { platformFit?: string[] };

/** Concept angle slugs read as labels: "problem/solution" → "Problem/Solution", "social proof" → "Social Proof". */
function angleLabel(angle: string | undefined) {
  if (!angle) return "";
  return angle
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function scriptExcerpt(script: string | undefined, maxLines = 3) {
  if (!script) return null;
  const lines = script.split(/\r?\n/).filter(Boolean);
  return {
    lines: lines.slice(0, maxLines),
    more: Math.max(0, lines.length - maxLines),
  };
}

export default async function BriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ briefId: string }>;
  searchParams: Promise<{ guardrail?: string }>;
}) {
  const ctx = await requireOrg();
  const { briefId } = await params;
  const { guardrail } = await searchParams;
  const detail = await loadBrief(ctx.org.id, briefId);
  if (!detail) notFound();

  const { brief, product, concepts, event } = detail;
  const data = brief.data as StoredBriefData;
  const generating = event?.status === "started";
  const failed = event?.status === "failed";
  const waiting = generating && concepts.length === 0;
  const requested = Math.max(1, Number(event?.meta?.requestedConcepts ?? DEFAULT_CONCEPT_COUNT));
  const completed = Math.min(requested, Math.max(0, Number(event?.meta?.concepts ?? 0)));
  const remaining = generating ? Math.max(0, requested - completed) : 0;
  const selected = concepts.filter((c) => c.status === "selected").length;
  const isSample =
    concepts.some((c) => c.model === "sample") || event?.model === "sample";

  const headline = waiting
    ? "Writing hooks and angles."
    : failed && concepts.length === 0
      ? "Generation failed."
      : selected > 0
        ? `${selected} selected. Make the ads.`
        : concepts.length > 0
          ? `${concepts.length} ideas. Pick the keepers.`
          : "No ideas yet.";

  return (
    <>
      {generating ? <Poller intervalMs={1000} /> : null}

      <FlowSteps current="ideas" links={{ brief: "/briefs/new" }} format={brief.data.formats[0] === "video" ? "Product video" : brief.data.formats[0] === "ugc" ? "Presenter video" : "Static ad"} />
      {guardrail ? <div role="alert" className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">The brief is saved, but the ideas did not start: {decodeURIComponent(guardrail)}</div> : null}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            · {objectiveLabel[data.objective] ?? data.objective} ·{" "}
            {relative(brief.createdAt)}
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {brief.title}
          </h1>
          <p className="m-0 text-[12px] text-muted">{headline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <form action={generateMoreConcepts.bind(null, brief.id)}>
            <button
              type="submit"
              disabled={generating}
              className="btn btn-outline h-11 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Spark size={14} animate="spin" className="text-orange" /> Generating…
                </>
              ) : (
                "Generate more"
              )}
            </button>
          </form>
          <Link href="/briefs/new" className="btn btn-orange h-11">
            <PlusIcon width={15} height={15} /> New brief
          </Link>
        </div>
      </header>

      {/* Brief summary */}
      <section className="panel grid gap-x-8 gap-y-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5 xl:col-span-2">
          <span className="eyebrow">Audience</span>
          <p className="m-0 text-[14px] leading-snug">{data.audience}</p>
        </div>
        <div className="flex flex-col gap-1.5 xl:col-span-2">
          <span className="eyebrow">Offer / key message</span>
          <p className="m-0 text-[14px] leading-snug">
            {data.offer ?? <span className="text-muted">Not specified</span>}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Product</span>
          <span className="text-[13px]">
            {product?.name ?? <span className="text-muted">Whole brand</span>}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Platforms</span>
          <div className="flex flex-wrap gap-1.5">
            {data.platforms.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded bg-well px-[7px] py-0.5 text-[11px] text-ink"
              >
                <PlatformLogo name={p} size={12} />
                {platformLabel[p] ?? p}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Formats</span>
          <div className="flex flex-wrap gap-1.5">
            {data.formats.map((f) => (
              <span
                key={f}
                className="rounded bg-well px-[7px] py-0.5 text-[11px] text-ink"
              >
                {formatLabel[f] ?? f}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Tone · constraints</span>
          <span className="text-[13px] text-ink">
            {data.tone ?? <span className="text-muted">Brand kit tone</span>}
            {data.constraints?.length ? (
              <span className="block text-[12px] text-muted">
                {data.constraints.join(" · ")}
              </span>
            ) : null}
          </span>
        </div>
      </section>

      {/* Concepts */}
      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="eyebrow flex items-center gap-2">
              <span
                className={`h-[7px] w-[7px] rounded-full ${generating ? "bg-orange shadow-[0_0_0_3px_#fbe3d9]" : "bg-line"}`}
              />
              Concepts
            </div>
            <h2 className="m-0 text-[16px] font-semibold tracking-[-.3px]">
              Ideas
            </h2>
            <p className="m-0 text-[12px] text-muted">
              {isSample
                ? "Sample ideas · Connect an AI provider for generated directions."
                : "Ideas arrive one by one. Pick one to make the ad — or a few, and compare."}
            </p>
          </div>
          <span className="text-[12px] text-muted">
            {concepts.length} concept{concepts.length === 1 ? "" : "s"} ·{" "}
            {selected} selected
            {event?.model ? ` · ${event.model}` : ""}
          </span>
        </div>

        {failed ? (
          <div className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">
            The last run failed{event?.error ? `: ${event.error}` : "."} Credits
            were not charged. {concepts.length > 0 ? "Your completed ideas are saved and ready to use. " : ""}{" "}
            <form
              action={generateMoreConcepts.bind(null, brief.id)}
              className="inline"
            >
              <button type="submit" className="font-semibold underline">
                Try again
              </button>
            </form>
          </div>
        ) : null}

        {generating ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-line bg-surface px-4 py-3" role="status" aria-live="polite" aria-atomic="true">
            <div className="flex items-center gap-2.5 text-[13px]">
              <Spark size={18} animate="spin" className="text-orange" />
              <span>{completed === 0 ? "Writing your first idea…" : completed < requested ? `${completed} of ${requested} new ideas ready. Writing the next one…` : "All ideas are ready. Finishing up…"}</span>
            </div>
            <span className="text-[12px] text-muted">{concepts.length > 0 ? "You can select an idea while we keep writing." : "Each idea will appear here as soon as it’s ready."}</span>
          </div>
        ) : null}

        {concepts.length === 0 && !generating && !failed ? (
          <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
            <div className="font-serif text-[22px] italic">
              Nothing here yet.
            </div>
            <form action={generateMoreConcepts.bind(null, brief.id)}>
              <button type="submit" className="btn btn-dark h-11">
                Generate ideas <span aria-hidden="true">↗︎</span>
              </button>
            </form>
          </div>
        ) : (
          <div className="concept-grid grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {concepts.map((c) => {
              const d = c.data as StoredConceptData;
              const isSelected = c.status === "selected";
              const isRejected = c.status === "rejected";
              const excerpt =
                c.kind === "static" ? null : scriptExcerpt(d.script);
              return (
                <article
                  key={c.id}
                  data-selected={isSelected ? "true" : undefined}
                  className={`tile concept-card flex flex-col gap-3.5 p-5 ${isRejected ? "opacity-55" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-well px-2.5 py-1 text-[11px] font-semibold text-ink">
                      {c.kind !== "static" ? (
                        <PlayIcon width={10} height={10} />
                      ) : null}
                      {kindLabel[c.kind] ?? c.kind}
                    </span>
                    <span className="truncate text-[11px] text-muted">
                      {angleLabel(d.angle)}
                    </span>
                  </div>

                  <h3 className="m-0 font-serif text-[22px] italic leading-[1.15] tracking-[-0.4px]">
                    {d.hook}
                  </h3>

                  <dl className="m-0 flex flex-col gap-2 text-[13px]">
                    <div className="flex flex-col gap-0.5">
                      <dt className="eyebrow">Headline</dt>
                      <dd className="m-0 font-semibold">{d.headline}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="eyebrow">Primary text</dt>
                      <dd className="m-0 text-ink">{d.primaryText}</dd>
                    </div>
                    {d.description ? (
                      <div className="flex flex-col gap-0.5">
                        <dt className="eyebrow">Description</dt>
                        <dd className="m-0 text-ink">{d.description}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-dashed border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.8px] text-muted">CTA</span>
                        {d.cta}
                      </span>
                      {d.platformFit?.length ? (
                        <span className="truncate text-[11px] text-muted">
                          {d.platformFit.map((p) => platformLabel[p] ?? p).join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  </dl>

                  <div className="flex flex-col gap-0.5 border-t border-line pt-3 text-[12px]">
                    <span className="eyebrow">Visual direction</span>
                    <p className="m-0 text-ink">{d.visualDirection}</p>
                  </div>

                  {excerpt ? (
                    <div className="flex flex-col gap-1 rounded-[7px] bg-paper px-3 py-2.5 text-[12px]">
                      <span className="eyebrow">Script</span>
                      {excerpt.lines.map((line, i) => (
                        <p key={i} className="m-0 text-ink">
                          {line}
                        </p>
                      ))}
                      {excerpt.more > 0 ? (
                        <span className="text-[11px] text-muted">
                          +{excerpt.more} more scenes
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {isSelected ? (
                      <>
                        {c.kind === "static" ? (
                          <Link
                            href={`/creatives/new?conceptId=${c.id}`}
                            className="btn btn-orange h-11"
                          >
                            Make the ad <span aria-hidden="true">↗︎</span>
                          </Link>
                        ) : null}
                        <MakeVideoLink conceptId={c.id} kind={c.kind} />
                        {c.kind !== "static" ? (
                          <Link
                            href={`/creatives/new?conceptId=${c.id}`}
                            className="btn btn-outline h-11"
                          >
                            Static version <span aria-hidden="true">↗︎</span>
                          </Link>
                        ) : null}
                        <form
                          action={setConceptStatus.bind(null, c.id, "proposed")}
                        >
                          <button
                            type="submit"
                            className="btn btn-outline h-11"
                          >
                            Unselect
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        <form
                          action={setConceptStatus.bind(null, c.id, "selected")}
                        >
                          <button type="submit" className="btn btn-dark h-11">
                            Select
                          </button>
                        </form>
                        {isRejected ? (
                          <form
                            action={setConceptStatus.bind(
                              null,
                              c.id,
                              "proposed",
                            )}
                          >
                            <button
                              type="submit"
                              className="btn btn-outline h-11"
                            >
                              Restore
                            </button>
                          </form>
                        ) : (
                          <form
                            action={setConceptStatus.bind(
                              null,
                              c.id,
                              "rejected",
                            )}
                          >
                            <button
                              type="submit"
                              className="btn btn-outline h-11"
                            >
                              Reject
                            </button>
                          </form>
                        )}
                      </>
                    )}
                    <span className="ml-auto text-[11px] text-muted">
                      {c.model ?? ""}
                    </span>
                  </div>
                </article>
              );
            })}
            {Array.from({ length: remaining }, (_, i) => (
              <div key={`pending-${completed + i}`} className="panel flex min-h-[270px] flex-col gap-4 border-dashed p-5" aria-hidden="true">
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>Idea {String(completed + i + 1).padStart(2, "0")}</span>
                  <span>{i === 0 ? "Writing…" : "Up next"}</span>
                </div>
                <span className="mt-3 h-6 w-11/12 motion-safe:animate-pulse rounded bg-well" />
                <span className="h-6 w-2/3 motion-safe:animate-pulse rounded bg-well" />
                <span className="mt-4 h-3 w-full motion-safe:animate-pulse rounded bg-well" />
                <span className="h-3 w-5/6 motion-safe:animate-pulse rounded bg-well" />
                <span className="mt-auto h-9 w-24 rounded bg-well" />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
