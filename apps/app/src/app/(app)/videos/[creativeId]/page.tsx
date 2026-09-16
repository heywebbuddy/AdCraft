import Link from "next/link";
import { Spark } from "@/components/spark";
import { notFound } from "next/navigation";
import { requireOrg } from "@/server/org";
import { STEPS, getVideo, videoModelChoices, type VideoEvent } from "@/server/videos";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlayIcon } from "@/components/icons";
import { regenerateSceneAction, rerunAction, saveScene } from "../actions";

export const dynamic = "force-dynamic";

const ratioClass: Record<string, string> = { "9:16": "aspect-[9/16]", "1:1": "aspect-square", "16:9": "aspect-video", "4:5": "aspect-[4/5]" };

function fileUrl(asset: { key?: string; url?: string } | undefined) {
  if (!asset) return null;
  if (asset.key) return `/api/files/${asset.key}`;
  return asset.url ?? null;
}

function seconds(ms: number | null) {
  return ms ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s` : "";
}

function stepState(steps: Array<{ id: string; label: string }>, running: VideoEvent | null, lastRoot: VideoEvent | null, events: VideoEvent[]) {
  const currentStep = running?.step ?? lastRoot?.step ?? "";
  const idx = steps.findIndex((s) => s.id === currentStep);
  const done = lastRoot?.status === "succeeded";
  return steps.map((s, i) => {
    const stepEvents = events.filter((e) => !e.root && e.step === s.id);
    if (done) return { ...s, state: "done" as const, events: stepEvents };
    if (running) return { ...s, state: i < idx ? ("done" as const) : i === idx ? ("running" as const) : ("pending" as const), events: stepEvents };
    if (lastRoot?.status === "failed") return { ...s, state: i < idx ? ("done" as const) : i === idx ? ("failed" as const) : ("pending" as const), events: stepEvents };
    return { ...s, state: "pending" as const, events: stepEvents };
  });
}

export default async function VideoPage({ params }: { params: Promise<{ creativeId: string }> }) {
  const ctx = await requireOrg();
  const { creativeId } = await params;
  const v = await getVideo(ctx.org.id, creativeId);
  if (!v) notFound();

  const doc = v.document;
  const models = videoModelChoices();
  const modelLabel = models.find((m) => m.id === doc.model)?.label ?? doc.model;
  const lastRoot = v.events.find((e) => e.root) ?? null;
  const steps = stepState(STEPS[v.kind], v.running, lastRoot, v.events);
  const rendering = v.status === "rendering";
  const scenes = doc.scenes.filter((s) => s.role !== "broll");
  const broll = doc.scenes.filter((s) => s.role === "broll");
  const readySizes = v.variants.filter((x) => x.render?.status === "succeeded");
  const spent = v.events.filter((e) => e.root && e.status === "succeeded").reduce((s, e) => s + e.credits, 0);

  const headline = rendering
    ? `${v.running?.detail || "Generating"}.`
    : v.status === "failed"
      ? "Something failed. Fix and re-run."
      : readySizes.length
        ? `${readySizes.length} size${readySizes.length === 1 ? "" : "s"} ready.`
        : "Not generated yet.";

  return (
    <>
      <AutoRefresh everyMs={3000} active={rendering} />

      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            ·{" "}
            <Link href={`/briefs/${v.concept.briefId}`} className="hover:text-ink">
              {v.concept.title}
            </Link>{" "}
            · {v.kind === "ugc" ? "UGC video" : "Product video"} · {modelLabel} · {doc.ratio}
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {v.name}. <span className="font-serif italic tracking-[-0.6px] text-orange">{headline}</span>
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <span className="rounded bg-[#efeee8] px-[7px] py-1 text-[11px] text-[#4a4b44]">
            {spent ? `${spent} credits spent` : `${v.credits} credits per run`} · ~{v.durationSec} s
          </span>
          <form action={rerunAction}>
            <input type="hidden" name="creativeId" value={v.id} />
            <button type="submit" disabled={rendering} className="btn btn-outline h-11 disabled:cursor-not-allowed disabled:opacity-60">
              Re-assemble
            </button>
          </form>
          <form action={rerunAction}>
            <input type="hidden" name="creativeId" value={v.id} />
            <input type="hidden" name="fresh" value="1" />
            <button type="submit" disabled={rendering} className="btn btn-dark h-11 disabled:cursor-not-allowed disabled:opacity-60">
              Regenerate everything <span aria-hidden="true">↗</span>
            </button>
          </form>
        </div>
      </header>

      {v.lastError && !rendering ? (
        <div className="rounded-[7px] border border-[#f0c4b8] bg-[#fbe3d9] px-4 py-3 text-[13px] text-[#b4382a]">
          <strong className="font-semibold">Last run failed.</strong> {v.lastError}
        </div>
      ) : null}

      <div className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="flex min-w-0 flex-col gap-[26px]">
          {/* Progress */}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <div className="eyebrow flex items-center gap-2">
                {rendering ? <Spark size={13} animate="spin" className="text-orange" /> : <span className="h-[7px] w-[7px] rounded-full bg-line" />}
                Pipeline
              </div>
              <span className="text-[12px] text-muted">
                {rendering && v.running ? `Running · ${Math.max(1, Math.round((Date.now() - v.running.createdAt.getTime()) / 1000))} s` : lastRoot ? `Last run ${lastRoot.status}` : "Queued"}
              </span>
            </div>
            <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => {
                const ok = s.events.filter((e) => e.status === "succeeded").length;
                const failed = s.events.find((e) => e.status === "failed");
                return (
                  <li key={s.id} className={`panel flex flex-col gap-1.5 p-3.5 ${s.state === "running" ? "border-orange" : ""}`}>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex items-center gap-2 font-semibold">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                            s.state === "done" ? "bg-[#3f7a55] text-white" : s.state === "running" ? "bg-orange text-white" : s.state === "failed" ? "bg-[#b4382a] text-white" : "bg-[#efeee8] text-muted"
                          }`}
                        >
                          {s.state === "done" ? "✓" : i + 1}
                        </span>
                        {s.label}
                      </span>
                      <span className="text-[11px] text-muted">{ok ? `${ok} done` : ""}</span>
                    </div>
                    <div className="text-[12px] text-muted">
                      {s.state === "running" ? v.running?.detail : s.state === "failed" ? failed?.error?.slice(0, 80) || "Failed" : s.events[0]?.detail || "—"}
                    </div>
                    {s.state === "running" ? (
                      <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-orange">
                        <Spark size={12} animate="spin" /> Working
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          {/* UGC: voice + presenter */}
          {v.kind === "ugc" ? (
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="panel flex flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between text-[13px] font-semibold">
                  <span>Voice-over</span>
                  <span className="text-[11px] font-medium text-muted">{doc.voice?.audio?.durationSec ? `${doc.voice.audio.durationSec.toFixed(1)} s` : "pending"}</span>
                </div>
                {fileUrl(doc.voice?.audio) ? <audio controls preload="none" src={fileUrl(doc.voice?.audio) ?? undefined} className="w-full" /> : <div className="h-10 rounded-[5px] bg-[#efeee8]" />}
                <div className="text-[12px] text-muted">Voice {doc.voice?.voiceId || "stock"} · ElevenLabs</div>
              </div>
              <div className="panel flex gap-3.5 p-3.5">
                <div className="w-[72px] shrink-0 overflow-hidden rounded-[5px] bg-[#efeee8]">
                  {fileUrl(doc.presenter?.clip) ? <video muted playsInline preload="metadata" src={fileUrl(doc.presenter?.clip) ?? undefined} className="aspect-[9/16] w-full object-cover" /> : <div className="aspect-[9/16] w-full" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[13px] font-semibold">
                    <span>Presenter</span>
                    <span className="rounded-full bg-[#efeee8] px-2 py-[2px] text-[10px] font-semibold text-[#4a4b44]">AI-generated</span>
                  </div>
                  <div className="text-[12px] text-muted">Avatar {doc.presenter?.avatarId || "stock"} · HeyGen · licensed stock avatar</div>
                  <div className="text-[12px] text-muted">{doc.presenter?.clip?.durationSec ? `${doc.presenter.clip.durationSec.toFixed(1)} s take` : "Waiting for the voice track"}</div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Storyboard */}
          <section className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="eyebrow">Storyboard</div>
                <h2 className="m-0 text-[24px] font-medium tracking-[-1px]">
                  {scenes.length} scenes. <span className="font-serif italic text-muted">Edit a caption, regenerate a shot.</span>
                </h2>
              </div>
              <span className="text-[12px] text-muted">Captions re-assemble instantly. Prompt changes regenerate the scene ({v.kind === "ugc" ? "B-roll only" : `${Math.ceil(v.credits / Math.max(1, scenes.length))} credits`}).</span>
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...scenes, ...broll].map((s, i) => {
                const clip = fileUrl(s.clip);
                const still = fileUrl(s.still);
                const sceneEvents = v.events.filter((e) => e.sceneId === s.id);
                const busy = rendering && sceneEvents.some((e) => e.status === "started");
                const err = s.error ?? sceneEvents.find((e) => e.status === "failed")?.error ?? null;
                const isBroll = s.role === "broll";
                return (
                  <div key={s.id} className="tile flex flex-col">
                    <div className={`relative overflow-hidden bg-[#efeee8] ${ratioClass[doc.ratio] ?? "aspect-[9/16]"} ${doc.ratio === "9:16" ? "max-h-[360px]" : ""}`}>
                      {clip ? (
                        <video muted loop playsInline autoPlay preload="metadata" src={clip} poster={still ?? undefined} className="h-full w-full object-cover" />
                      ) : still ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={still} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center gap-2 text-[12px] text-muted">
                          {busy ? <><Spark size={20} animate="spin" className="text-orange" /> Generating…</> : "No still yet"}
                        </div>
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold text-ink">
                        {isBroll ? `B-roll ${i - scenes.length + 1}` : `Scene ${i + 1}`} · {s.durationSec} s
                      </span>
                      <span className={`absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold ${clip ? "text-[#3f7a55]" : busy ? "text-orange" : err ? "text-[#b4382a]" : "text-muted"}`}>
                        {busy ? <Spark size={10} animate="spin" /> : null}
                        {clip ? "Clip" : busy ? "Working" : err ? "Failed" : still ? "Still" : "Queued"}
                      </span>
                      {s.hookText ? (
                        <span className="absolute inset-x-3 top-10 text-center font-serif text-[20px] italic leading-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,.6)]">{s.hookText}</span>
                      ) : null}
                    </div>
                    <form action={saveScene} className="flex flex-col gap-2 px-[13px] pb-[13px] pt-3">
                      <input type="hidden" name="creativeId" value={v.id} />
                      <input type="hidden" name="sceneId" value={s.id} />
                      {!isBroll ? (
                        <label className="flex flex-col gap-1">
                          <span className="eyebrow">Caption</span>
                          <textarea name="caption" defaultValue={s.caption} rows={2} className="resize-none rounded-[7px] border border-line bg-white px-2.5 py-2 text-[13px] leading-snug outline-none focus:border-ink" />
                        </label>
                      ) : null}
                      {i === 0 && !isBroll ? (
                        <label className="flex flex-col gap-1">
                          <span className="eyebrow">Hook text</span>
                          <input name="hookText" defaultValue={s.hookText ?? ""} placeholder="Big text over the first scene" className="h-9 rounded-[7px] border border-line bg-white px-2.5 text-[13px] outline-none focus:border-ink" />
                        </label>
                      ) : null}
                      <details className="group">
                        <summary className="cursor-pointer select-none text-[11px] font-semibold text-muted hover:text-ink">Scene prompt</summary>
                        <textarea name="prompt" defaultValue={s.prompt} rows={3} className="mt-1.5 w-full resize-none rounded-[7px] border border-line bg-white px-2.5 py-2 text-[12px] leading-snug outline-none focus:border-ink" />
                      </details>
                      {err ? <div className="text-[11px] text-[#b4382a]">{err.slice(0, 140)}</div> : null}
                      <div className="flex items-center justify-between gap-2">
                        <button type="submit" disabled={rendering} className="btn btn-outline h-9 px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-60">
                          Save
                        </button>
                        <button type="submit" formAction={regenerateSceneAction} disabled={rendering} className="text-[12px] font-semibold text-orange hover:underline disabled:cursor-not-allowed disabled:opacity-60">
                          Regenerate ↗
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Players */}
          <section className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <div className="eyebrow">Every size</div>
              <h2 className="m-0 text-[24px] font-medium tracking-[-1px]">
                Rendered videos. <span className="font-serif italic text-muted">Safe zones respected per placement.</span>
              </h2>
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {v.variants.map((x) => {
                const r = x.render;
                return (
                  <div key={x.id} className="panel flex flex-col gap-3 p-3.5">
                    <div className={`overflow-hidden rounded-[5px] bg-ink ${ratioClass[x.ratio] ?? "aspect-[9/16]"} ${x.ratio === "9:16" ? "mx-auto w-full max-w-[220px]" : ""}`}>
                      {r?.status === "succeeded" && r.url ? (
                        <video controls playsInline preload="metadata" src={r.url} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[12px] text-white/70">
                          {r?.status === "running" || (rendering && !r) ? <Spark size={26} animate={r?.status === "running" ? "spin" : "breathe"} /> : null}
                          {r?.status === "running" ? "Rendering…" : r?.status === "failed" ? "Render failed" : rendering ? "Waiting" : "Not rendered"}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate font-semibold">{x.label}</span>
                      <span className="tabular text-[11px] text-muted">
                        {x.ratio} · {x.width}×{x.height}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className={r?.status === "succeeded" ? "text-[#3f7a55]" : r?.status === "failed" ? "text-[#b4382a]" : "text-muted"}>
                        {r?.status === "succeeded" ? `Ready · ${r.fileBytes ? `${(r.fileBytes / 1048576).toFixed(1)} MB` : "mp4"}` : r?.status === "failed" ? r.error?.slice(0, 60) : r?.status ?? "queued"}
                      </span>
                      {r?.status === "succeeded" && r.url ? (
                        <a href={r.url} download={`${v.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${x.ratio.replace(":", "x")}.mp4`} className="font-semibold text-orange hover:underline">
                          Download ↓
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Activity */}
        <aside className="flex flex-col gap-3">
          <div className="eyebrow">Activity</div>
          <div className="panel flex flex-col divide-y divide-line">
            {v.events.length === 0 ? <div className="p-3.5 text-[12px] text-muted">Nothing yet.</div> : null}
            {v.events.slice(0, 24).map((e) => (
              <div key={e.id} className="flex flex-col gap-0.5 p-3">
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate font-semibold">{e.label}</span>
                  <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${e.status === "succeeded" ? "text-[#3f7a55]" : e.status === "failed" ? "text-[#b4382a]" : "text-orange"}`}>{e.status}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                  <span className="min-w-0 truncate">
                    {e.provider} · {e.model || "—"}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </span>
                  <span className="tabular shrink-0">
                    {e.credits ? `${e.credits} cr · ` : ""}
                    {seconds(e.durationMs)}
                  </span>
                </div>
                {e.error ? <div className="text-[11px] text-[#b4382a]">{e.error.slice(0, 160)}</div> : null}
              </div>
            ))}
          </div>
          <div className="panel flex flex-col gap-2 p-3.5 text-[12px] text-muted">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <PlayIcon width={12} height={12} /> What's in the render
            </div>
            <div>
              {scenes.length} scenes · captions ({doc.captions.style}) · {doc.brand.logo ? "logo" : "brand name"} end card “{doc.endCard.cta}”
              {doc.music ? " · music" : ""}
              {doc.aiLabel ? " · AI-generated label" : ""}
            </div>
            <div>Model {modelLabel} · engine remotion-local</div>
          </div>
        </aside>
      </div>
    </>
  );
}
