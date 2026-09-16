import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/server/org";
import { CREDITS, VIDEO_RATIOS, buildVideoDocument, getConceptForVideo, presenterChoices, videoModelChoices } from "@/server/videos";
import { documentDurationSec } from "@adcraft/render/video";
import { createVideo } from "../actions";
import { VideoForm } from "./video-form";

export const dynamic = "force-dynamic";

export default async function NewVideoPage({ searchParams }: { searchParams: Promise<{ conceptId?: string; kind?: string }> }) {
  const ctx = await requireOrg();
  const { conceptId, kind } = await searchParams;
  if (!conceptId) redirect("/briefs");
  const concept = await getConceptForVideo(ctx.org.id, conceptId);
  if (!concept) notFound();

  const models = videoModelChoices();
  const { avatars, voices } = await presenterChoices();
  const defaultModel = models.find((m) => m.isDefault)?.id ?? models[0]!.id;
  const preview = (k: "video" | "ugc") => {
    const doc = buildVideoDocument(concept, { kind: k, model: defaultModel, ratio: "9:16" });
    return {
      scenes: doc.scenes.map((s) => ({ id: s.id, line: s.line, prompt: s.prompt, durationSec: s.durationSec, hookText: s.hookText, role: s.role })),
      durationSec: Math.round(documentDurationSec(doc)),
      credits: CREDITS[k],
    };
  };
  const initialKind: "video" | "ugc" = kind === "ugc" || (kind !== "video" && concept.kind === "ugc") ? "ugc" : "video";

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            ·{" "}
            <Link href={`/briefs/${concept.briefId}`} className="hover:text-ink">
              {concept.briefTitle}
            </Link>{" "}
            · New video
          </div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {concept.title}. <span className="font-serif italic tracking-[-0.6px] text-orange">Script to storyboard to video.</span>
          </h1>
          <p className="m-0 max-w-[640px] text-[13px] text-muted">
            {concept.data.hook}
            {concept.product ? ` · ${concept.product.name}` : ""}
            {!concept.product?.cutoutKey ? " · No product cutout yet, scenes will be generated from the prompt alone." : ""}
          </p>
        </div>
        <Link href={`/briefs/${concept.briefId}`} className="btn btn-outline h-11">
          Back to concepts
        </Link>
      </header>

      <VideoForm
        conceptId={concept.id}
        initialKind={initialKind}
        models={models}
        ratios={VIDEO_RATIOS.map((r) => ({ id: r.id, label: r.label, hint: r.hint }))}
        avatars={avatars.map((a) => ({ id: a.id, label: a.label, previewUrl: a.previewUrl }))}
        voices={voices}
        storyboards={{ video: preview("video"), ugc: preview("ugc") }}
        balance={ctx.credits.balance}
        action={createVideo}
      />
    </>
  );
}
