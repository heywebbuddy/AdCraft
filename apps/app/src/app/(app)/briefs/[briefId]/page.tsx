import Link from "next/link";
import { FlowSteps } from "@/components/flow-steps";
import { Spark } from "@/components/spark";
import { MakeVideoLink } from "@/components/video-links";
import { notFound } from "next/navigation";
import type { ConceptData } from "@adcraft/db";
import { requireOrg } from "@/server/org";
import {
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
}: {
  params: Promise<{ briefId: string }>;
}) {
  const ctx = await requireOrg();
  const { briefId } = await params;
  const detail = await loadBrief(ctx.org.id, briefId);
  if (!detail) notFound();

  const { brief, product, concepts, event } = detail;
  const data = brief.data as StoredBriefData;
  const generating = event?.status === "started";
  const failed = event?.status === "failed";
  const waiting = generating && concepts.length === 0;
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
          ? `${concepts.length} concepts. Pick the keepers.`
          : "No concepts yet.";

  return (
    <>
      {generating ? <Poller intervalMs={3000} /> : null}

      <FlowSteps current="ideas" links={{ brief: "/briefs/new" }} format={brief.data.formats[0] === "video" ? "Product video" : brief.data.formats[0] === "ugc" ? "Presenter video" : "Static ad"} />
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
                className="rounded bg-[#efeee8] px-[7px] py-0.5 text-[11px] text-[#4a4b44]"
              >
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
                className="rounded bg-[#efeee8] px-[7px] py-0.5 text-[11px] text-[#4a4b44]"
              >
                {formatLabel[f] ?? f}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Tone · constraints</span>
          <span className="text-[13px] text-[#4a4b44]">
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
                ? "Sample concepts · Connect an AI provider for generated directions."
                : "Eight directions from your brief. Pick one to make the ad — or a few, and compare."}
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
            were not charged.{" "}
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

        {waiting ? (
          <div className="flex flex-col gap-4">
          <div className="status-working flex items-center gap-2.5 text-[13px] text-muted">
            <Spark size={18} animate="spin" className="text-orange" />
            Claude is writing hooks, angles and scripts. About a minute.
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="h-5 w-14 animate-pulse rounded bg-[#efeee8]" />
                  <span className="h-3 w-20 animate-pulse rounded bg-[#efeee8]" />
                </div>
                <span className="h-7 w-11/12 animate-pulse rounded bg-[#efeee8]" />
                <span className="h-7 w-2/3 animate-pulse rounded bg-[#efeee8]" />
                <span className="h-3 w-full animate-pulse rounded bg-[#efeee8]" />
                <span className="h-3 w-5/6 animate-pulse rounded bg-[#efeee8]" />
                <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-[#efeee8]">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-orange" />
                </div>
              </div>
            ))}
            <p className="m-0 text-[13px] text-muted sm:col-span-2 xl:col-span-3">
              Claude is reading the brand kit and the brief. This page updates
              on its own.
            </p>
          </div>
          </div>
        ) : concepts.length === 0 && !failed ? (
          <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
            <div className="font-serif text-[22px] italic">
              Nothing here yet.
            </div>
            <form action={generateMoreConcepts.bind(null, brief.id)}>
              <button type="submit" className="btn btn-dark h-11">
                Generate concepts <span aria-hidden="true">↗</span>
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
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#efeee8] px-2.5 py-1 text-[11px] font-semibold text-[#4a4b44]">
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
                      <dd className="m-0 text-[#4a4b44]">{d.primaryText}</dd>
                    </div>
                    {d.description ? (
                      <div className="flex flex-col gap-0.5">
                        <dt className="eyebrow">Description</dt>
                        <dd className="m-0 text-[#4a4b44]">{d.description}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-dashed border-[#d4d3ca] bg-paper px-2.5 py-1 text-[11px] font-medium text-[#4a4b44]">
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
                    <p className="m-0 text-[#4a4b44]">{d.visualDirection}</p>
                  </div>

                  {excerpt ? (
                    <div className="flex flex-col gap-1 rounded-[7px] bg-paper px-3 py-2.5 text-[12px]">
                      <span className="eyebrow">Script</span>
                      {excerpt.lines.map((line, i) => (
                        <p key={i} className="m-0 text-[#4a4b44]">
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
                            Make the ad <span aria-hidden="true">↗</span>
                          </Link>
                        ) : null}
                        <MakeVideoLink conceptId={c.id} kind={c.kind} />
                        {c.kind !== "static" ? (
                          <Link
                            href={`/creatives/new?conceptId=${c.id}`}
                            className="btn btn-outline h-11"
                          >
                            Static version <span aria-hidden="true">↗</span>
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
          </div>
        )}
      </section>
    </>
  );
}
