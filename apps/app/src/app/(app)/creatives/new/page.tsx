import Link from "next/link";
import { FlowSteps } from "@/components/flow-steps";
import { DesktopHint } from "@/components/desktop-hint";
import { requireOrg } from "@/server/org";
import { getConceptForCreative, imageModelChoices, STATIC_PLACEMENT_IDS, getCreative } from "@/server/creatives";
import { getPlacement } from "@adcraft/specs";
import { listTemplatesFor } from "@/server/collab-data";
import { StaticAdForm } from "./static-ad-form";
import type { StaticTemplate } from "@adcraft/render";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  preview: "The new studio generation workflow is awaiting approval before it is connected.",
  credits: "There aren't enough credits for the selected output. Choose fewer sizes or add credits.",
  concept: "We couldn't start this creative. Check the provider connection and selected sizes, then try again.",
  unavailable: "The selected model is unavailable. Connect its provider or choose another model.",
};
export default async function NewCreativePage({ searchParams }: { searchParams: Promise<{ conceptId?: string; error?: string; detail?: string; variantOf?: string }> }) {
  const ctx = await requireOrg();
  const { conceptId, error, detail, variantOf } = await searchParams;
  const original = variantOf ? await getCreative(ctx.org.id, variantOf) : null;
  const concept = conceptId ? await getConceptForCreative(ctx.org.id, conceptId) : null;
  if (!concept) return <>
    <header><div className="eyebrow">Creatives · New</div><h1 className="mt-3 text-[32px] font-medium tracking-[-1.3px]">Every great ad starts with an idea.</h1></header>
    <section className="panel flex flex-col items-start gap-4 p-7"><p className="m-0 max-w-[55ch] text-[13px] text-muted">Choose a concept in a creative brief. Its message, product and brand kit come with you into the studio.</p><Link className="btn btn-dark h-11" href="/briefs">Choose a creative brief ↗︎</Link></section>
  </>;
  const [models, saved] = await Promise.all([imageModelChoices(), listTemplatesFor(ctx.org.id, concept.brand.id, "static")]);
  const kit = concept.brand.kit;
  const productKey = concept.product?.imageKey ?? concept.product?.cutoutKey;
  return <>
    <FlowSteps current="ad" links={{ ideas: `/briefs/${concept.briefId}` }} format="Static ad" />
      <DesktopHint what="Making an ad" />
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2.5"><div className="eyebrow"><Link href="/creatives" className="hover:text-ink">Ads</Link> <span className="mx-1.5 opacity-40">/</span> <Link href={`/briefs/${concept.briefId}`} className="hover:text-ink">{concept.briefTitle}</Link> <span className="mx-1.5 opacity-40">/</span> Static studio</div>
      <h1 className="m-0 text-[30px] font-medium leading-tight tracking-[-1.25px] sm:text-[34px]">Make your next <span className="font-serif italic font-normal text-[#7c8868]">great impression.</span></h1><p className="m-0 text-[12px] text-muted">From a promising concept to an ad worth stopping for.</p></div>
      <span className="mb-1 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] text-muted">✳︎ <span className="ml-1 font-semibold text-ink">{ctx.credits.balance}</span> credits available</span>
    </header>
    {original && <div className="rounded-md border border-[#cfe3d6] bg-[#e9f3ec] px-4 py-3 text-[12px] text-[#3f7a55]">A variant of <strong>{original.name}</strong> ({original.document.mode === "ai" ? "AI-designed" : original.document.template}). Same idea and product — pick a different approach or art direction so the two can be compared fairly.</div>}
    {error === "guardrail" && detail && <div role="alert" className="rounded-md border border-[#efd4c7] bg-[#fff6ee] px-4 py-3 text-[12px] text-[#aa5034]">{decodeURIComponent(detail)}</div>}
    {error && errors[error] && <div role="alert" className="rounded-md border border-[#efd4c7] bg-[#fff6ee] px-4 py-3 text-[12px] text-[#aa5034]">{errors[error]}</div>}
    <StaticAdForm concept={{ id: concept.id, briefId: concept.briefId, headline: concept.data.headline, hook: concept.data.hook, cta: concept.data.cta, brand: concept.brand.name, direction: concept.data.visualDirection, product: concept.product?.name ?? null, imageUrl: productKey ? `/api/files/${productKey}` : null, colors: { primary: kit.colors.primary, accent: kit.colors.accent ?? "#e65c32" } }} models={models} sizes={STATIC_PLACEMENT_IDS.map((id) => { const p = getPlacement(id); return { id, ratio: p.ratio, width: p.width, height: p.height, label: p.label }; })} saved={saved.map((t) => ({ id: t.id, name: t.name, template: ((t.document as { template?: StaticTemplate }).template ?? "hero") }))} balance={ctx.credits.balance} canEdit={ctx.role !== "viewer"} />
  </>;
}
