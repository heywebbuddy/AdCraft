import Link from "next/link";
import { FlowSteps } from "@/components/flow-steps";
import { DesktopHint } from "@/components/desktop-hint";
import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/server/org";
import { planAllows } from "@/server/platform-settings";
import { currentSubscription } from "@/server/billing";
import {
  CREDITS,
  VIDEO_RATIOS,
  buildVideoDocument,
  getConceptForVideo,
  presenterChoices,
  videoModelChoices,
} from "@/server/videos";
import { documentDurationSec } from "@adcraft/render/video";
import { createVideo } from "../actions";
import { VideoForm } from "./video-form";

export const dynamic = "force-dynamic";

export default async function NewVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ conceptId?: string; kind?: string; error?: string }>;
}) {
  const ctx = await requireOrg();
  const { conceptId, kind, error } = await searchParams;
  if (!conceptId) redirect("/briefs");
  const sub = await currentSubscription(ctx.org.id);
  if (!(await planAllows(sub?.plan, kind === "ugc" ? "ugc" : "video"))) redirect(`/briefs?error=plan-${kind === "ugc" ? "ugc" : "video"}`);
  const concept = await getConceptForVideo(ctx.org.id, conceptId);
  if (!concept) notFound();

  const models = await videoModelChoices();
  const { groups, defaultVoice } = await presenterChoices();
  const defaultModel = models.find((m) => m.isDefault)?.id ?? models[0]!.id;
  const preview = (k: "video" | "ugc") => {
    const doc = buildVideoDocument(concept, {
      kind: k,
      model: defaultModel,
      ratio: "9:16",
    });
    return {
      scenes: doc.scenes.map((s) => ({
        id: s.id,
        line: s.line,
        prompt: s.prompt,
        durationSec: s.durationSec,
        hookText: s.hookText,
        role: s.role,
      })),
      durationSec: Math.round(documentDurationSec(doc)),
      credits: CREDITS[k],
    };
  };
  const initialKind: "video" | "ugc" =
    kind === "ugc" || (kind !== "video" && concept.kind === "ugc")
      ? "ugc"
      : "video";

  return (
    <>
      <FlowSteps current="ad" links={{ ideas: `/briefs/${concept.briefId}` }} format={initialKind === "ugc" ? "Presenter video" : "Product video"} />
      <DesktopHint what="Making a video" />
      {error ? <div role="alert" className="rounded-md border border-[#efd4c7] bg-[#fff6ee] px-4 py-3 text-[12px] text-[#aa5034]">{decodeURIComponent(error)}</div> : null}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            ·{" "}
            <Link
              href={`/briefs/${concept.briefId}`}
              className="hover:text-ink"
            >
              {concept.briefTitle}
            </Link>{" "}
            · New video
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            Create a video
          </h1>
          <p className="m-0 max-w-[640px] text-[13px] text-muted">
            {concept.data.hook}
            {concept.product ? ` · ${concept.product.name}` : ""}
            {!concept.product?.cutoutKey
              ? " · No product cutout yet, scenes will be generated from the prompt alone."
              : ""}
          </p>
        </div>
        <Link
          href={`/briefs/${concept.briefId}`}
          className="btn btn-outline h-11"
        >
          Back to concepts
        </Link>
      </header>

      <VideoForm
        conceptId={concept.id}
        initialKind={initialKind}
        models={models}
        ratios={VIDEO_RATIOS.map((r) => ({
          id: r.id,
          label: r.label,
          hint: r.hint,
        }))}
        groups={groups}
        defaultVoice={defaultVoice}
        storyboards={{ video: preview("video"), ugc: preview("ugc") }}
        balance={ctx.credits.balance}
        action={createVideo}
      />
    </>
  );
}
