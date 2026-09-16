import Link from "next/link";
import { STATIC_TEMPLATES } from "@adcraft/render";
import { requireOrg } from "@/server/org";
import { getConceptForCreative, imageModelChoices, STATIC_PLACEMENT_IDS, STATIC_SCENE_CREDITS } from "@/server/creatives";
import { getPlacement } from "@adcraft/specs";
import { createCreativeFromConcept } from "../actions";
import { TemplateThumb } from "../template-thumb";
import { listTemplatesFor } from "@/server/collab-data";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  credits: `You need ${STATIC_SCENE_CREDITS} credits to paint a scene. Top up and try again.`,
  concept: "That concept could not be turned into a creative. Try again from the brief.",
};

const optionClass =
  "group flex cursor-pointer flex-col gap-2 rounded-[9px] border border-line bg-white p-3 transition-colors hover:border-ink has-checked:border-ink has-checked:shadow-[0_0_0_2px_#242521]";

export default async function NewCreativePage({ searchParams }: { searchParams: Promise<{ conceptId?: string; error?: string }> }) {
  const ctx = await requireOrg();
  const { conceptId, error } = await searchParams;
  const concept = conceptId ? await getConceptForCreative(ctx.org.id, conceptId) : null;
  const models = imageModelChoices();
  const kit = concept?.brand.kit;
  const saved = await listTemplatesFor(ctx.org.id, ctx.brand?.id ?? null, "static");
  const colors = { primary: kit?.colors.primary ?? "#242521", accent: kit?.colors.accent ?? "#e65c32" };
  const sizes = STATIC_PLACEMENT_IDS.map((id) => getPlacement(id));

  if (!concept) {
    return (
      <>
        <header className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/creatives" className="hover:text-ink">
              Creatives
            </Link>{" "}
            · New
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            Start from a concept. <span className="font-serif italic tracking-[-0.6px] text-orange">Pick one in a brief.</span>
          </h1>
        </header>
        <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
          <p className="m-0 max-w-[52ch] text-[13px] text-muted">
            A creative is a concept made real: its headline, CTA and visual direction, painted by an image model and laid out by a
            template in every size. Open a brief and choose the concept you want to make.
          </p>
          <div className="flex gap-3">
            <Link href="/briefs" className="btn btn-dark h-11">
              Open briefs <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/briefs/new" className="btn btn-outline h-11">
              Write a new one
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/creatives" className="hover:text-ink">
              Creatives
            </Link>{" "}
            ·{" "}
            <Link href={`/briefs/${concept.briefId}`} className="hover:text-ink">
              {concept.briefTitle}
            </Link>{" "}
            · New
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {concept.title}. <span className="font-serif italic tracking-[-0.6px] text-orange">Make it real.</span>
          </h1>
        </div>
        <span className="text-[12px] text-muted">
          Costs {STATIC_SCENE_CREDITS} credits · {ctx.credits.balance} left
        </span>
      </header>

      {error && ERRORS[error] ? (
        <div className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">{ERRORS[error]}</div>
      ) : null}

      <form action={createCreativeFromConcept} className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]">
        <input type="hidden" name="conceptId" value={concept.id} />
        <div className="panel flex flex-col gap-7 p-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">Template</span>
              <span className="text-[11px] text-muted">Text, logo and product are exact in every size. You can switch later.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STATIC_TEMPLATES.map((t, i) => (
                <label key={t.id} className={optionClass}>
                  <input type="radio" name="template" value={t.id} defaultChecked={i === 0} className="sr-only" />
                  <TemplateThumb template={t.id} colors={colors} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold">{t.label}</span>
                    <span className="text-[11px] leading-snug text-muted">{t.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            {saved.length ? (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] text-muted">Saved layouts</span>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {saved.map((t) => {
                    const base = (t.document as { template?: string }).template;
                    return (
                      <label key={t.id} className={optionClass}>
                        <input type="radio" name="template" value={`saved:${t.id}`} className="sr-only" />
                        <TemplateThumb template={(base === "split" || base === "minimal" || base === "bold" ? base : "hero") as "hero"} colors={colors} />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-semibold">{t.name}</span>
                          <span className="text-[11px] leading-snug text-muted">{t.isShared ? "Shared across brands" : (t.brandName ?? "This brand")}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">Image model</span>
              <span className="text-[11px] text-muted">Paints the scene layer only.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {models.map((m) => (
                <label key={m.id} className={`${optionClass} min-h-[84px] justify-between`}>
                  <input type="radio" name="model" value={m.id} defaultChecked={m.isDefault} className="sr-only" />
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{m.label}</span>
                    {m.isDefault ? <span className="rounded-full bg-[#fbe3d9] px-[7px] py-px text-[10px] font-semibold text-orange">Default</span> : null}
                  </span>
                  <span className="text-[11px] leading-snug text-muted">{m.notes || "via fal.ai"}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button type="submit" className="btn btn-orange h-11">
              Make the ad <span aria-hidden="true" className="text-lg leading-none">↗</span>
            </button>
            <Link href={`/briefs/${concept.briefId}`} className="btn btn-outline h-11">
              Back to brief
            </Link>
            <span className="text-[12px] text-muted">About twenty seconds. Sizes render one after another.</span>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Copy</span>
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold leading-snug tracking-[-0.3px]">{concept.data.headline}</span>
              <span className="text-[13px] text-muted">{concept.data.hook}</span>
            </div>
            <span className="inline-flex w-fit rounded-full px-3 py-1 text-[12px] font-semibold text-white" style={{ background: colors.accent }}>
              {concept.data.cta}
            </span>
          </section>
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Scene direction</span>
            <p className="m-0 text-[13px] text-muted">{concept.data.visualDirection}</p>
          </section>
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Layers</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
              <li className="flex justify-between gap-2">
                <span>Brand</span>
                <span className="text-muted">{concept.brand.name}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Logo</span>
                <span className="text-muted">{kit?.logoUrl ? "From kit" : "Brand name"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Product</span>
                <span className="text-muted">
                  {concept.product ? (concept.product.cutoutKey ? concept.product.name : concept.product.imageKey ? `${concept.product.name} · no cutout yet` : "No photo") : "None"}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Fonts</span>
                <span className="text-muted">{kit?.fonts.heading}</span>
              </li>
            </ul>
          </section>
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Sizes</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
              {sizes.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{s.label}</span>
                  <span className="tabular text-muted">
                    {s.ratio} · {s.width}×{s.height}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {concept.existingCreatives > 0 ? (
            <p className="m-0 px-1 text-[12px] text-muted">
              This concept already has {concept.existingCreatives} creative{concept.existingCreatives === 1 ? "" : "s"}.{" "}
              <Link href="/creatives" className="font-semibold text-orange">
                See them ↗
              </Link>
            </p>
          ) : null}
        </aside>
      </form>
    </>
  );
}
