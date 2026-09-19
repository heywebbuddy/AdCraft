"use client";

import { useRef, useState } from "react";
import { PresenterLibrary, type PresenterChoice, type PresenterGroup } from "@/app/(app)/characters/presenter-library";
import { auditionVoiceAction, loadPresenterLooks, searchVoicesAction } from "@/app/(app)/characters/actions";
import { VoiceField, type CatalogVoice } from "@/components/voice-picker";
import "@/app/(app)/characters/studio.css";
import { Spark } from "@/components/spark";
import { PlayIcon } from "@/components/icons";
import shell from "@/app/(app)/creatives/new/static-ad-form.module.css";

type Model = { id: string; label: string; notes: string; isDefault: boolean; audio: boolean; durations: number[]; creditsPerSec: number };
type Choice = { id: string; label: string; previewUrl?: string };
type Ratio = { id: "9:16" | "1:1" | "16:9" | "4:5"; label: string; hint: string };
type ScenePreview = { id: string; line: string; prompt: string; durationSec: number; hookText?: string; role?: string };

export type VideoFormProps = {
  conceptId: string;
  initialKind: "video" | "ugc";
  models: Model[];
  ratios: Ratio[];
  groups: PresenterGroup[];
  defaultVoice: CatalogVoice | null;
  storyboards: Record<"video" | "ugc", { scenes: ScenePreview[]; durationSec: number; credits: number }>;
  balance: number;
  action: (formData: FormData) => Promise<void>;
};

const ratioBox: Record<Ratio["id"], string> = { "9:16": "h-8 w-[18px]", "1:1": "h-7 w-7", "16:9": "h-[18px] w-8", "4:5": "h-8 w-[26px]" };

export function VideoForm(p: VideoFormProps) {
  const [kind, setKind] = useState<"video" | "ugc">(p.initialKind);
  const [model, setModel] = useState(p.models.find((m) => m.isDefault)?.id ?? p.models[0]?.id ?? "");
  const [ratio, setRatio] = useState<Ratio["id"]>("9:16");
  const [pending, setPending] = useState(false);
  const [avatar, setAvatar] = useState<PresenterChoice | null>(null);
  const [voice, setVoice] = useState<CatalogVoice | null>(p.defaultVoice);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const board = p.storyboards[kind];
  const chosen = p.models.find((m) => m.id === model);
  const short = board.credits > p.balance;

  return (
    <form
      action={p.action}
      onSubmit={() => setPending(true)}
      className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <input type="hidden" name="conceptId" value={p.conceptId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="ratio" value={ratio} />

      <div className={shell.main}>
        {/* Kind */}
        <section className={shell.section}>
          <div className={shell.sectionHead}><div><span className={shell.step}>01</span><h2>Choose the format</h2></div><span className={shell.micro}>What kind of video</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { id: "video", title: "Product video", blurb: "Scene-by-scene clips from the product cutout, captions, logo end card. About 15 s.", credits: p.storyboards.video.credits },
                { id: "ugc", title: "UGC-style video", blurb: "AI presenter with voice-over, product B-roll, on-screen hook. About 30 s. Labelled AI-generated.", credits: p.storyboards.ugc.credits },
              ] as const
            ).map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`panel flex flex-col gap-2 p-4 text-left transition ${kind === k.id ? "border-ink shadow-[0_0_0_3px_#efeee8]" : "hover:border-muted"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <PlayIcon width={12} height={12} /> {k.title}
                  </span>
                  <span className="rounded bg-[#efeee8] px-[7px] py-0.5 text-[11px] text-[#4a4b44]">{k.credits} credits</span>
                </div>
                <p className="m-0 text-[12px] leading-relaxed text-muted">{k.blurb}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Model */}
        <section className={shell.section}>
          <div className={shell.sectionHead}><div><span className={shell.step}>02</span><h2>Pick the video model</h2></div><span className={shell.micro}>{kind === "ugc" ? "Used for the B-roll clips" : "Used for every scene clip"}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {p.models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={`panel flex flex-col gap-1.5 p-3.5 text-left transition ${model === m.id ? "border-ink shadow-[0_0_0_3px_#efeee8]" : "hover:border-muted"}`}
              >
                <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                  <span>{m.label}</span>
                  {m.isDefault ? <span className="rounded-full bg-ink px-2 py-[2px] text-[10px] font-semibold text-white">Default</span> : null}
                </div>
                <div className="text-[11px] text-muted">
                  {m.durations.join(" / ")} s clips · {m.audio ? "native audio" : "silent"}
                </div>
                {m.notes ? <div className="text-[11px] text-muted">{m.notes}</div> : null}
              </button>
            ))}
          </div>
        </section>

        {/* Ratio */}
        <section className={shell.section}>
          <div className={shell.sectionHead}><div><span className={shell.step}>03</span><h2>Primary size</h2></div><span className={shell.micro}>The other sizes follow</span></div>
          <div className="flex flex-wrap gap-2">
            {p.ratios.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRatio(r.id)}
                className={`flex items-center gap-3 rounded-[7px] border bg-surface px-3.5 py-2.5 text-left transition ${ratio === r.id ? "border-ink shadow-[0_0_0_3px_#efeee8]" : "border-line hover:border-muted"}`}
              >
                <span className={`rounded-[3px] border border-ink ${ratioBox[r.id]}`} />
                <span className="flex flex-col">
                  <span className="text-[13px] font-semibold">{r.label}</span>
                  <span className="text-[11px] text-muted">{r.hint}</span>
                </span>
              </button>
            ))}
            <span className="self-center text-[12px] text-muted">Every video is also resized to the other two.</span>
          </div>
        </section>

        {/* UGC presenter + voice */}
        {kind === "ugc" ? (
          <section className={shell.section}>
          <div className={shell.sectionHead}><div><span className={shell.step}>02b</span><h2>Who presents it</h2></div><span className={shell.micro}>A licensed presenter from the cast library, and a voice</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow">Presenter</span>
              <input type="hidden" name="avatarId" value={avatar?.look.id ?? ""} />
              <button type="button" onClick={() => libraryDialog.current?.showModal()} className="flex h-14 items-center gap-3 rounded-[7px] border border-line bg-surface px-2 text-left text-[13px] hover:border-ink">
                {avatar?.look.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar.look.previewUrl} alt="" className="h-10 w-8 rounded-[5px] object-cover" />
                ) : (
                  <span className="grid h-10 w-8 place-items-center rounded-[5px] bg-[#efeee8] text-[15px]">✦</span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate font-semibold">{avatar ? `${avatar.person.name} · ${avatar.look.name}` : "Choose a presenter"}</strong>
                  <small className="text-[11px] text-muted">{p.groups.length.toLocaleString()} people in the HeyGen library</small>
                </span>
                <span className="pr-2 text-[12px] font-semibold text-orange">Change ↗︎</span>
              </button>
              <dialog ref={libraryDialog} className="cs-dialog cs-library-dialog" aria-labelledby="pl-title" onClick={(e) => { if (e.target === e.currentTarget) libraryDialog.current?.close(); }}>
                <PresenterLibrary groups={p.groups} loadLooks={loadPresenterLooks} selectedId={avatar?.look.id} ratio={ratio} onSelect={(c) => { setAvatar(c); libraryDialog.current?.close(); }} onClose={() => libraryDialog.current?.close()} />
              </dialog>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="eyebrow">Voice</span>
              <input type="hidden" name="voiceId" value={voice?.id ?? ""} />
              <VoiceField voice={voice} search={searchVoicesAction} audition={auditionVoiceAction} onChange={setVoice} label="" />
            </div>
            <p className="m-0 text-[12px] text-muted sm:col-span-2">
              Library presenters and catalogue voices only. Custom faces or cloned voices need a consent flow first (PLAN §4), and the video carries an “AI-generated” label.
            </p>
          </div>
          </section>
        ) : null}

        {/* Storyboard preview */}
        <section className={shell.section}>
          <div className={shell.sectionHead}><div><span className={shell.step}>04</span><h2>Storyboard from the script</h2></div>
            <span className={shell.micro}>
              {board.scenes.filter((s) => s.role !== "broll").length} scenes · ~{board.durationSec} s
            </span>
          </div>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {board.scenes.map((s, i) => (
              <li key={s.id} className="panel flex items-start gap-3.5 p-3.5">
                <span className="tabular mt-0.5 w-6 shrink-0 text-[12px] font-semibold text-muted">{s.role === "broll" ? "B" : i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {s.hookText ? <span className="font-serif text-[18px] italic leading-tight tracking-[-0.3px] text-orange">{s.hookText}</span> : null}
                  {s.role === "broll" ? (
                    <span className="text-[13px] leading-relaxed text-muted">Product B-roll cut-in · {s.prompt}</span>
                  ) : s.line ? (
                    <span className="text-[13px] leading-relaxed">{s.line}</span>
                  ) : (
                    <span className="text-[13px] leading-relaxed text-muted">Visual only · {s.prompt}</span>
                  )}
                </div>
                <span className="tabular shrink-0 text-[12px] text-muted">{s.durationSec} s</span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-[12px] text-muted">You can edit captions, tweak a scene prompt and regenerate single scenes on the storyboard after this step.</p>
        </section>
      </div>

      {/* Summary */}
      <aside className="panel side-sticky flex flex-col gap-4 p-5">
        <div className="eyebrow">Ready to generate</div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">Format</dt>
          <dd className="m-0 font-semibold">{kind === "ugc" ? "UGC-style video" : "Product video"}</dd>
          <dt className="text-muted">Model</dt>
          <dd className="m-0 font-semibold">{chosen?.label ?? model}</dd>
          <dt className="text-muted">Sizes</dt>
          <dd className="m-0 font-semibold">{ratio} first, then the rest</dd>
          <dt className="text-muted">Length</dt>
          <dd className="m-0 font-semibold tabular">~{board.durationSec} s</dd>
          <dt className="text-muted">Credits</dt>
          <dd className={`m-0 font-semibold tabular ${short ? "text-[#b4382a]" : ""}`}>
            {board.credits} <span className="font-normal text-muted">of {p.balance}</span>
          </dd>
        </dl>
        {short ? <p className="m-0 rounded-[7px] bg-[#fbe3d9] px-3 py-2 text-[12px] text-[#b4382a]">Not enough credits for this run. Top up in Settings.</p> : null}
        <button type="submit" disabled={pending || short} className="btn btn-orange h-11 disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? <Spark size={14} animate="spin" /> : null}
          {pending ? "Starting…" : "Generate video"} <span aria-hidden="true">↗︎</span>
        </button>
        <p className="m-0 text-[11px] leading-relaxed text-muted">Takes a few minutes. You can leave the page; the storyboard fills in as each scene lands.</p>
      </aside>
    </form>
  );
}
