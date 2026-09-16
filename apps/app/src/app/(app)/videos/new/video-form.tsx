"use client";

import { useState } from "react";
import { PlayIcon } from "@/components/icons";

type Model = { id: string; label: string; notes: string; isDefault: boolean; audio: boolean; durations: number[]; creditsPerSec: number };
type Choice = { id: string; label: string; previewUrl?: string };
type Ratio = { id: "9:16" | "1:1" | "16:9" | "4:5"; label: string; hint: string };
type ScenePreview = { id: string; line: string; prompt: string; durationSec: number; hookText?: string; role?: string };

export type VideoFormProps = {
  conceptId: string;
  initialKind: "video" | "ugc";
  models: Model[];
  ratios: Ratio[];
  avatars: Choice[];
  voices: Choice[];
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
  const board = p.storyboards[kind];
  const chosen = p.models.find((m) => m.id === model);
  const short = board.credits > p.balance;

  return (
    <form
      action={p.action}
      onSubmit={() => setPending(true)}
      className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <input type="hidden" name="conceptId" value={p.conceptId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="ratio" value={ratio} />

      <div className="flex min-w-0 flex-col gap-[26px]">
        {/* Kind */}
        <section className="flex flex-col gap-3">
          <div className="eyebrow">Format</div>
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
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">Video model</div>
            <span className="text-[12px] text-muted">{kind === "ugc" ? "Used for the B-roll clips" : "Used for every scene clip"}</span>
          </div>
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
                  {m.isDefault ? <span className="rounded-full bg-orange px-2 py-[2px] text-[10px] font-semibold text-white">Default</span> : null}
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
        <section className="flex flex-col gap-3">
          <div className="eyebrow">Primary size</div>
          <div className="flex flex-wrap gap-2">
            {p.ratios.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRatio(r.id)}
                className={`flex items-center gap-3 rounded-[7px] border bg-white px-3.5 py-2.5 text-left transition ${ratio === r.id ? "border-ink shadow-[0_0_0_3px_#efeee8]" : "border-line hover:border-muted"}`}
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
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Presenter (licensed stock avatar)</span>
              <select name="avatarId" className="h-11 rounded-[7px] border border-line bg-white px-3 text-[13px] outline-none focus:border-ink" defaultValue={p.avatars[0]?.id}>
                {p.avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Voice</span>
              <select name="voiceId" className="h-11 rounded-[7px] border border-line bg-white px-3 text-[13px] outline-none focus:border-ink" defaultValue={p.voices[0]?.id}>
                {p.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="m-0 text-[12px] text-muted sm:col-span-2">
              Stock avatars and voices only. Custom faces or cloned voices need a consent flow first (PLAN §4), and the video carries an “AI-generated” label.
            </p>
          </section>
        ) : null}

        {/* Storyboard preview */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">Storyboard from the script</div>
            <span className="text-[12px] text-muted">
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
      <aside className="panel sticky top-6 flex flex-col gap-4 p-5">
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
          {pending ? "Starting…" : "Generate video"} <span aria-hidden="true">↗</span>
        </button>
        <p className="m-0 text-[11px] leading-relaxed text-muted">Takes a few minutes. You can leave the page; the storyboard fills in as each scene lands.</p>
      </aside>
    </form>
  );
}
