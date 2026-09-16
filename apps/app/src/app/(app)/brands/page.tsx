import Link from "next/link";
import { requireOrg } from "@/server/org";
import { activeKitsFor } from "@/server/brands-data";
import { selectBrand } from "@/server/brands";
import { fontStack, KIT_FONTS_STYLESHEET } from "@/lib/brand-kit";
import { PlusIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const ctx = await requireOrg();
  const kits = await activeKitsFor(
    ctx.org.id,
    ctx.brands.map((b) => b.id),
  );

  return (
    <>
      <link rel="stylesheet" href={KIT_FONTS_STYLESHEET} precedence="default" />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">{ctx.org.name}</div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            Brands. <span className="font-serif italic tracking-[-0.6px] text-orange">Set the kit once, every ad follows it.</span>
          </h1>
        </div>
        <Link href="/brands/new" className="btn btn-orange h-11">
          New brand <span aria-hidden="true" className="text-lg leading-none">↗</span>
        </Link>
      </header>

      {ctx.brands.length ? (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ctx.brands.map((b) => {
            const kit = kits.get(b.id);
            const c = kit?.colors;
            const current = b.id === ctx.brand?.id;
            return (
              <div key={b.id} className="tile flex flex-col">
                <Link href={`/brands/${b.id}`} className="flex aspect-[16/10] flex-col justify-between p-4" style={{ background: c?.background ?? "#f8f7f3", color: c?.text ?? "#242521" }}>
                  <div className="flex items-center justify-between">
                    {kit?.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={kit.logoUrl} alt="" className="max-h-6 max-w-[110px] object-contain" />
                    ) : (
                      <span className="text-[14px] font-semibold tracking-[-0.3px]" style={{ fontFamily: fontStack(kit?.fonts.heading ?? "DM Sans"), color: c?.primary }}>
                        {b.name}
                      </span>
                    )}
                    {current ? (
                      <span className="rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold text-[#3f7a55]">Current</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[22px] leading-[1.05] tracking-[-0.6px]" style={{ fontFamily: fontStack(kit?.fonts.heading ?? "DM Sans"), color: c?.primary }}>
                      {kit?.tagline || "Made for mornings that matter."}
                    </span>
                    <span
                      className="inline-flex h-7 w-fit items-center px-3 text-[11px] font-semibold"
                      style={{
                        background: kit?.ctaStyle === "outline" ? "transparent" : c?.accent ?? "#e65c32",
                        color: kit?.ctaStyle === "outline" ? c?.accent ?? "#e65c32" : "#fff",
                        border: `1.5px solid ${c?.accent ?? "#e65c32"}`,
                        borderRadius: kit?.ctaStyle === "pill" ? 999 : kit?.ctaStyle === "rounded" ? 6 : 0,
                      }}
                    >
                      Shop now →
                    </span>
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-3 px-[13px] pb-[13px] pt-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[13px] font-semibold">{b.name}</span>
                    <span className="truncate text-[11px] text-muted">
                      {[b.industry, b.website?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ") || "No details yet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      {[c?.primary, c?.accent, c?.background].map((col, i) => (
                        <span key={i} className="h-4 w-4 rounded-[4px] border border-line" style={{ background: col ?? "#fff" }} />
                      ))}
                    </span>
                    {!current ? (
                      <form action={selectBrand.bind(null, b.id)}>
                        <button type="submit" className="text-[11px] font-semibold text-orange">
                          Switch
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
          <div className="font-serif text-[22px] italic">No brands in this workspace yet.</div>
          <p className="m-0 max-w-[52ch] text-[13px] text-muted">A brand holds its products, colours, fonts and tone. Every brief and creative belongs to one.</p>
          <Link href="/brands/new" className="btn btn-dark h-11">
            <PlusIcon width={16} height={16} /> Create the first brand
          </Link>
        </div>
      )}
    </>
  );
}
