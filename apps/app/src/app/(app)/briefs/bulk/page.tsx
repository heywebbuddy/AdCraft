import Link from "next/link";
import { STATIC_TEMPLATES } from "@adcraft/render";
import { getCatalog } from "@/server/model-catalog";
import { requireOrg } from "@/server/org";
import { listBriefsWithConcepts } from "@/server/bulk-data";
import { bulkGenerate } from "@/server/bulk";
import { BulkPicker } from "./picker";

export const dynamic = "force-dynamic";

const SIZES = ["1:1", "4:5", "9:16", "16:9"];
const CREDITS_PER_CREATIVE = 2;

const errors: Record<string, string> = {
  role: "Viewers can’t generate creative.",
  concepts: "Pick at least one concept.",
  templates: "Pick at least one format.",
  unavailable: "Generation isn’t available yet: the studio’s create-from-concept action is missing. Try again after the next deploy.",
};

export default async function BulkPage({ searchParams }: { searchParams: Promise<{ queued?: string; failed?: string; error?: string }> }) {
  const ctx = await requireOrg();
  const { queued, failed, error } = await searchParams;
  const list = await listBriefsWithConcepts(ctx.org.id, ctx.brand?.id ?? null);
  const total = list.reduce((n, b) => n + b.concepts.length, 0);
  const catalog = await getCatalog();
  const models = catalog.available("image").map((m) => ({ id: m.id, label: m.label, isDefault: m.id === catalog.default("image").id }));

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            / Bulk generate
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            One brief, many ads. <span className="font-serif italic text-orange">Concepts × formats × every size.</span>
          </h1>
        </div>
        <Link href="/creatives" className="btn btn-outline h-11">
          All creatives <span aria-hidden="true">↗︎</span>
        </Link>
      </header>

      {error ? <p className="m-0 text-[13px] text-orange">{errors[error] ?? "Something went wrong."}</p> : null}
      {queued ? (
        <section className="panel flex flex-wrap items-center justify-between gap-3 border-ink px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">
              {queued} creative{queued === "1" ? "" : "s"} queued{failed ? `, ${failed} failed` : ""}.
            </span>
            <span className="text-[12px] text-muted">Each renders in {SIZES.join(", ")}. Watch them land on the wall.</span>
          </div>
          <Link href="/creatives" className="btn btn-orange h-11">
            Go to creatives <span aria-hidden="true">↗︎</span>
          </Link>
        </section>
      ) : null}

      {total === 0 ? (
        <div className="panel flex max-w-[720px] flex-col items-start gap-3 border-dashed p-6">
          <div className="font-serif text-[22px] italic">No concepts to pick from yet.</div>
          <p className="m-0 max-w-[52ch] text-[13px] text-muted">
            Write a brief for {ctx.brand?.name ?? "your brand"} and Adcraft proposes hooks and angles. Come back here to turn a batch of them into ads at once.
          </p>
          <Link href="/briefs/new" className="btn btn-dark h-11">
            New brief <span aria-hidden="true">↗︎</span>
          </Link>
        </div>
      ) : (
        <form action={bulkGenerate} className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <BulkPicker briefs={list} />

          <aside className="side-sticky flex flex-col gap-4">
            <section className="panel flex flex-col gap-3 p-4">
              <span className="eyebrow">Formats</span>
              {STATIC_TEMPLATES.map((t, i) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-[7px] border border-line px-3 py-2.5 text-[13px] has-[:checked]:border-ink">
                  <input type="checkbox" name="templates" value={t.id} defaultChecked={i === 0} className="mt-0.5 accent-[#e65c32]" data-bulk="template" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">{t.label}</span>
                    <span className="text-[12px] text-muted">{t.blurb}</span>
                  </span>
                </label>
              ))}
            </section>

            <section className="panel flex flex-col gap-3 p-4">
              <span className="eyebrow">Sizes</span>
              <div className="flex flex-wrap gap-1.5">
                {SIZES.map((s) => (
                  <span key={s} className="rounded bg-[#efeee8] px-2 py-0.5 text-[11px] font-semibold text-[#4a4b44]">
                    {s}
                  </span>
                ))}
              </div>
              <p className="m-0 text-[12px] text-muted">Every creative is rendered in all four placements. Resizes are free; the scene is generated once.</p>
            </section>

            <section className="panel flex flex-col gap-3 p-4">
              <span className="eyebrow">Image model</span>
              <select name="model" defaultValue={models.find((m) => m.isDefault)?.id} className="h-10 rounded-[7px] border border-line bg-surface px-2 text-[13px] outline-none focus:border-ink">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </section>

            <section className="panel flex flex-col gap-2 p-4">
              <div className="flex justify-between text-[12px]">
                <span className="font-semibold">Estimate</span>
                <span className="tabular text-muted" data-bulk="estimate" data-credits={CREDITS_PER_CREATIVE}>
                  0 creatives · 0 credits
                </span>
              </div>
              <p className="m-0 text-[12px] text-muted">
                {CREDITS_PER_CREATIVE} credits per creative. You have {ctx.credits.balance}.
              </p>
              <button className="btn btn-orange h-11 justify-between" disabled={ctx.role === "viewer"}>
                Generate in bulk <span aria-hidden="true">↗︎</span>
              </button>
            </section>
          </aside>
        </form>
      )}
    </>
  );
}
