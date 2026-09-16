import Link from "next/link";
import { requireOrg } from "@/server/org";
import { FORMATS, OBJECTIVES, PLATFORMS, listProductsForBrand } from "@/server/briefs";
import { createBrief } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  title: "a title",
  objective: "an objective",
  audience: "an audience",
  platforms: "at least one platform",
  formats: "at least one format",
  product: "a product from this brand",
};

const fieldClass =
  "w-full rounded-[7px] border border-line bg-white px-3.5 text-[14px] text-ink outline-none placeholder:text-muted focus:border-ink";
const chipClass =
  "inline-flex h-11 cursor-pointer select-none items-center rounded-[7px] border border-line bg-white px-4 text-[13px] font-medium text-[#4a4b44] transition-colors hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-white";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default async function NewBriefPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireOrg();
  const { error } = await searchParams;
  const productList = await listProductsForBrand(ctx.org.id, ctx.brand?.id ?? null);
  const missing = error
    ? error
        .split(",")
        .map((k) => ERRORS[k])
        .filter(Boolean)
    : [];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            · New
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            Write the brief. <span className="font-serif italic tracking-[-0.6px] text-orange">We will do the rest.</span>
          </h1>
        </div>
        <span className="text-[12px] text-muted">
          Costs 1 credit · {ctx.credits.balance} left
        </span>
      </header>

      {missing.length ? (
        <div className="rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-[13px] text-[#b4382a]">
          Add {missing.join(", ")} and try again.
        </div>
      ) : null}

      <form action={createBrief} className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="panel flex flex-col gap-6 p-6">
          <Field label="Title">
            <input
              name="title"
              required
              autoFocus
              placeholder="Q4 launch: Everyday Serum"
              className={`${fieldClass} h-11`}
            />
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Product" hint="Optional">
              <select name="productId" defaultValue="" className={`${fieldClass} h-11`}>
                <option value="">Whole brand — no specific product</option>
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {productList.length === 0 ? (
                <span className="text-[11px] text-muted">
                  No products in {ctx.brand?.name ?? "this brand"} yet.{" "}
                  <Link href="/library/new" className="font-semibold text-orange">
                    Add one ↗
                  </Link>
                </span>
              ) : null}
            </Field>

            <Field label="Objective">
              <div className="flex flex-wrap gap-2">
                {OBJECTIVES.map((o, i) => (
                  <label key={o.id} className={chipClass} title={o.hint}>
                    <input type="radio" name="objective" value={o.id} defaultChecked={i === 2} className="sr-only" />
                    {o.label}
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Audience" hint="Who is this for?">
            <textarea
              name="audience"
              required
              rows={2}
              placeholder="women 25–40 who care about clean skincare and already buy from DTC brands"
              className={`${fieldClass} min-h-[72px] resize-y py-3`}
            />
          </Field>

          <Field label="Offer / key message" hint="The one thing the ad must say">
            <textarea
              name="offer"
              rows={2}
              placeholder="20% off the first order · a morning routine that takes two minutes"
              className={`${fieldClass} min-h-[72px] resize-y py-3`}
            />
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Platforms">
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <label key={p.id} className={chipClass}>
                    <input
                      type="checkbox"
                      name="platforms"
                      value={p.id}
                      defaultChecked={p.id === "meta" || p.id === "instagram"}
                      className="sr-only"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Formats">
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <label key={f.id} className={chipClass}>
                    <input type="checkbox" name="formats" value={f.id} defaultChecked={f.id === "static"} className="sr-only" />
                    {f.label}
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Tone" hint="Optional — overrides the brand kit">
              <input name="tone" placeholder="playful, direct, no jargon" className={`${fieldClass} h-11`} />
            </Field>
            <Field label="Constraints" hint="One per line">
              <textarea
                name="constraints"
                rows={2}
                placeholder={"no medical claims\nalways show the bottle"}
                className={`${fieldClass} min-h-[72px] resize-y py-3`}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button type="submit" className="btn btn-orange h-11">
              Generate concepts <span aria-hidden="true" className="text-lg leading-none">↗</span>
            </button>
            <Link href="/briefs" className="btn btn-outline h-11">
              Cancel
            </Link>
            <span className="text-[12px] text-muted">About ten seconds. You can keep working.</span>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">What you get</span>
            <p className="m-0 text-[13px] text-muted">
              Eight concepts, each with a hook, a persuasion angle, platform-ready copy, a visual direction and — for
              video and UGC — a scene-by-scene script. Pick the ones you like and make the ad.
            </p>
          </section>
          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Brand kit</span>
            <p className="m-0 text-[13px] text-muted">
              Concepts use {ctx.brand?.name ?? "your brand"}&rsquo;s tone, do-say and don&rsquo;t-say lists automatically.{" "}
              <Link href="/settings/brand" className="font-semibold text-orange">
                Edit kit ↗
              </Link>
            </p>
          </section>
          <section className="flex flex-col gap-2 px-0.5 py-1">
            <span className="eyebrow">Good briefs</span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px] text-[#4a4b44]">
              <li>Name the person, not the demographic.</li>
              <li>One offer per brief. Make another brief for another offer.</li>
              <li>Constraints beat adjectives: &ldquo;no before/after photos&rdquo; is better than &ldquo;tasteful&rdquo;.</li>
            </ul>
          </section>
        </aside>
      </form>
    </>
  );
}
