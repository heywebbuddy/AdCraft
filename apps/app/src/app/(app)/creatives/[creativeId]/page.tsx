import Link from "next/link";
import { notFound } from "next/navigation";
import { STATIC_TEMPLATES } from "@adcraft/render";
import { requireOrg } from "@/server/org";
import { getCreative, imageModelChoices, STATIC_SCENE_CREDITS, type CreativeStatus } from "@/server/creatives";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReviewPanel } from "@/components/review-panel";
import { AlertIcon } from "@/components/icons";
import { regenerateScene, rerender, updateCreativeDocument } from "../actions";
import { Editor } from "./editor";

export const dynamic = "force-dynamic";

const ratioClass: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1.91:1": "aspect-[1.91/1]",
};

const STATUS: Record<CreativeStatus, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-[#e6f2ea] text-[#3f7a55]" },
  rendering: { label: "Rendering", cls: "bg-[#efeee8] text-muted" },
  failed: { label: "Failed", cls: "bg-[#fdf1ee] text-[#b4382a]" },
};

function fileName(name: string, ratio: string, w: number, h: number) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "creative";
  return `${slug}-${ratio.replace(":", "x")}-${w}x${h}.png`;
}

function kb(n: number | null) {
  return n ? `${Math.round(n / 1024)} KB` : "";
}

export default async function CreativePage({
  params,
  searchParams,
}: {
  params: Promise<{ creativeId: string }>;
  searchParams: Promise<{ ratio?: string; error?: string }>;
}) {
  const ctx = await requireOrg();
  const { creativeId } = await params;
  const { ratio, error } = await searchParams;
  const c = await getCreative(ctx.org.id, creativeId);
  if (!c) notFound();

  const selected = c.variants.find((v) => v.ratio === ratio) ?? c.variants.find((v) => v.render?.status === "succeeded") ?? c.variants[0];
  const done = c.variants.filter((v) => v.render?.status === "succeeded" && v.render.outputKey);
  const busy = c.status === "rendering";
  const models = imageModelChoices();
  const currentModel = (c.document.meta?.model as string | undefined) ?? models.find((m) => m.isDefault)?.id;
  const modelLabel = models.find((m) => m.id === currentModel)?.label ?? currentModel ?? "—";
  const sceneReady = c.document.scene.kind === "image";

  const save = updateCreativeDocument.bind(null, c.id);
  const regen = regenerateScene.bind(null, c.id);
  const retry = rerender.bind(null, c.id);

  return (
    <>
      <AutoRefresh active={busy} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/creatives" className="hover:text-ink">
              Creatives
            </Link>{" "}
            ·{" "}
            <Link href={`/briefs/${c.concept.briefId}`} className="hover:text-ink">
              {c.concept.title}
            </Link>
          </div>
          <h1 className="m-0 flex flex-wrap items-center gap-3 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {c.name}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-normal ${STATUS[c.status].cls}`}>
              {busy && c.generating ? "Painting scene" : STATUS[c.status].label}
            </span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[12px] text-muted">
            {done.length}/{c.variants.length} sizes · {modelLabel}
          </span>
          {done.length > 0 ? (
            <a href={`/api/render/${c.id}/zip`} className="btn btn-orange h-11">
              Download all <span aria-hidden="true" className="text-lg leading-none">↓</span>
            </a>
          ) : null}
        </div>
      </header>

      {error === "credits" ? (
        <div className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">
          You need {STATIC_SCENE_CREDITS} credits to paint a new scene.{" "}
          <Link href="/settings/billing" className="font-semibold">
            Top up
          </Link>
          .
        </div>
      ) : null}
      {c.status === "failed" && c.lastError ? (
        <div className="flex items-start gap-2.5 rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">
          <AlertIcon className="mt-px shrink-0" />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">Something failed. Credits were not charged for failed scenes.</span>
            <span className="break-all opacity-80">{c.lastError}</span>
          </span>
        </div>
      ) : null}

      <div className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Preview */}
        <section className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-[7px] border border-line bg-white p-[3px] text-[12px] font-medium">
              {c.variants.map((v) => (
                <Link
                  key={v.id}
                  href={`/creatives/${c.id}?ratio=${encodeURIComponent(v.ratio)}`}
                  scroll={false}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-[5px] px-3 ${
                    selected?.id === v.id ? "bg-ink text-white" : "text-[#4a4b44] hover:bg-paper"
                  }`}
                >
                  {v.ratio}
                  <span
                    className={`h-[6px] w-[6px] rounded-full ${
                      v.render?.status === "succeeded"
                        ? "bg-[#3f7a55]"
                        : v.render?.status === "failed"
                          ? "bg-[#b4382a]"
                          : selected?.id === v.id
                            ? "bg-white/50"
                            : "bg-line"
                    }`}
                  />
                </Link>
              ))}
            </div>
            {selected ? (
              <span className="tabular text-[12px] text-muted">
                {selected.label} · {selected.width}×{selected.height}
              </span>
            ) : null}
          </div>

          <div className="panel flex items-center justify-center overflow-hidden bg-[#efeee8] p-4">
            {selected ? (
              <div
                className={`relative w-full overflow-hidden rounded-[7px] bg-white shadow-[0_10px_24px_#2c25151a] ${ratioClass[selected.ratio] ?? "aspect-[4/5]"} ${
                  selected.ratio === "9:16" ? "max-h-[78vh] max-w-[calc(78vh*9/16)]" : selected.ratio === "4:5" ? "max-h-[78vh] max-w-[calc(78vh*4/5)]" : selected.ratio === "1:1" ? "max-h-[78vh] max-w-[78vh]" : ""
                }`}
              >
                {selected.render?.status === "succeeded" && selected.render.outputKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${selected.render.outputKey}?v=${selected.render.createdAt.getTime()}`}
                    alt={`${c.name} ${selected.ratio}`}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white"
                    style={{
                      background:
                        c.document.scene.kind === "gradient"
                          ? `linear-gradient(${c.document.scene.angle}deg, ${c.document.scene.from}, ${c.document.scene.to})`
                          : `linear-gradient(160deg, ${c.document.brand.colors.primary}, ${c.document.brand.colors.accent})`,
                    }}
                  >
                    {selected.render?.status === "failed" ? (
                      <>
                        <span className="font-serif text-[22px] italic">This size failed to render.</span>
                        <span className="max-w-[40ch] text-[12px] opacity-80">{selected.render.error}</span>
                        <form action={retry}>
                          <button type="submit" className="btn btn-outline h-10">
                            Retry
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        <span className="font-serif text-[22px] italic">{c.generating ? c.generating.label : "Rendering…"}</span>
                        <span className="text-[12px] opacity-80">
                          {c.generating ? c.generating.detail : `${selected.width}×${selected.height} · satori`}
                        </span>
                        <span className="h-[5px] w-40 overflow-hidden rounded-full bg-white/30">
                          <span className="block h-full w-1/2 animate-pulse rounded-full bg-white/90" />
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-10 text-[13px] text-muted">No sizes yet.</div>
            )}
          </div>

          {/* Downloads */}
          <div className="panel flex flex-col gap-1 px-4 py-3">
            <div className="flex items-baseline justify-between pb-1">
              <span className="eyebrow">Download</span>
              <span className="text-[11px] text-muted">PNG · exact placement sizes</span>
            </div>
            {c.variants.map((v) => {
              const ok = v.render?.status === "succeeded" && v.render.outputKey;
              return (
                <div key={v.id} className="flex items-center justify-between gap-3 border-t border-line py-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="tabular w-11 font-semibold">{v.ratio}</span>
                    <span className="truncate text-muted">
                      {v.label} · {v.width}×{v.height}
                    </span>
                  </span>
                  {ok ? (
                    <a
                      href={`/api/files/${v.render!.outputKey}`}
                      download={fileName(c.name, v.ratio, v.width, v.height)}
                      className="flex items-center gap-2 font-semibold text-orange"
                    >
                      <span className="tabular text-[11px] font-medium text-muted">{kb(v.render!.fileBytes)}</span>
                      Download ↓
                    </a>
                  ) : (
                    <span className="text-[12px] text-muted">{v.render?.status === "failed" ? "Failed" : "Rendering…"}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Editor */}
        <aside className="flex flex-col gap-4">
          <section className="panel flex flex-col gap-4 p-4">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Edit</span>
              <span className="text-[11px] text-muted">Saves re-render every size</span>
            </div>
            <Editor creativeId={c.id} document={c.document} templates={STATIC_TEMPLATES.map((t) => ({ id: t.id, label: t.label }))} busy={busy} onSave={save} />
          </section>

          <section className="panel flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">Scene</span>
              <span className="text-[11px] text-muted">{sceneReady ? `Painted by ${modelLabel}` : "Not painted yet"}</span>
            </div>
            {sceneReady && c.document.scene.kind === "image" && c.document.scene.key ? (
              <div className="flex items-center gap-3">
                <div className="h-16 w-[52px] shrink-0 overflow-hidden rounded-[5px] bg-[#efeee8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${c.document.scene.key}`} alt="" className="h-full w-full object-cover" />
                </div>
                <p className="m-0 text-[12px] text-muted">
                  The scene is the only AI layer. Text, logo and product are composed on top, so they stay exact.
                </p>
              </div>
            ) : (
              <p className="m-0 text-[12px] text-muted">Until the scene lands, sizes render on the brand gradient.</p>
            )}
            <form action={regen} className="flex flex-col gap-2.5">
              <select name="model" defaultValue={currentModel} className="h-11 w-full rounded-[7px] border border-line bg-white px-3.5 text-[14px] outline-none focus:border-ink">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={busy} className="btn btn-outline h-11 disabled:cursor-not-allowed disabled:opacity-60">
                  Regenerate scene
                </button>
                <span className="text-[12px] text-muted">
                  Costs {STATIC_SCENE_CREDITS} credits · {ctx.credits.balance} left
                </span>
              </div>
            </form>
          </section>

          {c.status === "failed" ? (
            <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
              <span className="eyebrow">Recover</span>
              <p className="m-0 text-[13px] text-muted">
                Re-render uses the current scene and document. If the scene itself failed, regenerate it above.
              </p>
              <form action={retry}>
                <button type="submit" className="btn btn-dark h-11">
                  Re-render all sizes
                </button>
              </form>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ReviewPanel creativeId={creativeId} />
        <div className="panel flex flex-col gap-2 p-5 text-[13px]">
          <span className="eyebrow">Share and reuse</span>
          <p className="m-0 text-muted">Send a review link to a client, or save this layout as a template for the next brief.</p>
          <Link href={`/creatives/${creativeId}/review`} className="btn btn-outline mt-2 h-11 justify-between">
            Share for review <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </>
  );
}
