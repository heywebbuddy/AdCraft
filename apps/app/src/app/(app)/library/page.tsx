import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/org";
import { cutoutStatus, fileUrl, listProducts, productAttributes } from "@/server/library-data";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlusIcon } from "@/components/icons";
import { CHECKER_STYLE, CutoutStatusChip } from "@/components/cutout-status";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  const { deleted } = await searchParams;
  const items = await listProducts(ctx.org.id, ctx.brand.id);
  const ready = items.filter((p) => cutoutStatus(p) === "ready").length;
  const processing = items.filter((p) => cutoutStatus(p) === "processing").length;

  return (
    <>
      <AutoRefresh active={processing > 0} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">Library · {ctx.brand.name}</div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            Products. <span className="font-serif italic tracking-[-0.6px] text-orange">Cut out and ready for any scene.</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[12px] text-muted">
            {items.length} product{items.length === 1 ? "" : "s"} · {ready} ready{processing ? ` · ${processing} processing` : ""}
          </span>
          <Link href="/library/new" className="btn btn-orange h-11">
            Add product <span aria-hidden="true" className="text-lg leading-none">↗</span>
          </Link>
        </div>
      </header>

      {deleted ? <div className="panel px-4 py-3 text-[13px] text-muted">Product removed.</div> : null}

      {items.length ? (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((p) => {
            const a = productAttributes(p);
            const status = cutoutStatus(p);
            const src = fileUrl(p.cutoutKey) ?? fileUrl(p.imageKey);
            const ratio = a.width && a.height ? `${a.width} / ${a.height}` : "1 / 1";
            return (
              <Link key={p.id} href={`/library/${p.id}`} className="tile flex flex-col">
                <div
                  className="relative flex items-center justify-center overflow-hidden"
                  style={{ aspectRatio: ratio, ...(p.cutoutKey ? CHECKER_STYLE : { background: "#f1f0ea" }) }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={p.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="font-serif text-[20px] italic text-muted">No image</span>
                  )}
                  <span className="absolute right-2.5 top-2.5">
                    <CutoutStatusChip status={status} />
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span className="min-w-0 truncate">{p.name}</span>
                    {p.price ? <span className="tabular text-[11px] font-medium text-muted">{p.price}</span> : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[11px] text-muted">
                    <span className="min-w-0 truncate">{a.width && a.height ? `${a.width} × ${a.height}` : "—"}</span>
                    <span>{relative(p.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
          <div className="font-serif text-[22px] italic">No products yet. One photo is enough to start.</div>
          <p className="m-0 max-w-[56ch] text-[13px] text-muted">
            Upload a product photo for {ctx.brand.name}. We remove the background automatically and use the cutout as a reference in every
            generated scene, so the product is never repainted.
          </p>
          <Link href="/library/new" className="btn btn-dark h-11">
            <PlusIcon width={16} height={16} /> Add the first product
          </Link>
        </div>
      )}
    </>
  );
}

function relative(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
