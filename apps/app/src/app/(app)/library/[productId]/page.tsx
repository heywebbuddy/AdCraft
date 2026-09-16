import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, generationEvents } from "@adcraft/db";
import { requireOrg } from "@/server/org";
import { cutoutStatus, fileUrl, getProduct, productAttributes } from "@/server/library-data";
import { deleteProduct, redoCutout, updateProduct } from "@/server/library";
import { AutoRefresh } from "@/components/auto-refresh";
import { ImagePicker } from "@/components/image-picker";
import { CHECKER_STYLE, CutoutStatusChip } from "@/components/cutout-status";
import { IMAGE_ACCEPT } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[14px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

const errors: Record<string, string> = {
  name: "Give the product a name.",
  image: "This product has no original photo to cut out. Upload one first.",
  type: "Photos must be PNG, JPG or WebP.",
  size: "Photos must be 15 MB or smaller.",
};

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  const { productId } = await params;
  const { error, saved } = await searchParams;
  const product = await getProduct(ctx.org.id, productId);
  if (!product) notFound();

  const a = productAttributes(product);
  const status = cutoutStatus(product);
  const originalUrl = fileUrl(product.imageKey);
  const cutoutUrl = fileUrl(product.cutoutKey);
  const ratio = a.width && a.height ? `${a.width} / ${a.height}` : "1 / 1";

  const events = await db
    .select({ id: generationEvents.id, status: generationEvents.status, durationMs: generationEvents.durationMs, createdAt: generationEvents.createdAt, error: generationEvents.error })
    .from(generationEvents)
    .where(and(eq(generationEvents.orgId, ctx.org.id), sql`${generationEvents.meta}->>'productId' = ${productId}`))
    .orderBy(desc(generationEvents.createdAt))
    .limit(5);

  return (
    <>
      <AutoRefresh active={status === "processing"} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/library" className="hover:text-ink">
              Library
            </Link>{" "}
            · {ctx.brand.name}
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {product.name}.{" "}
            <span className="font-serif italic tracking-[-0.6px] text-orange">
              {status === "ready" ? "Ready for any scene." : status === "failed" ? "The cutout needs another go." : "Cutting it out now."}
            </span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CutoutStatusChip status={status} />
          <Link href={`/briefs/new?product=${product.id}`} className="btn btn-orange h-11">
            Brief with this product <span aria-hidden="true" className="text-lg leading-none">↗</span>
          </Link>
        </div>
      </header>

      {saved ? <div className="panel px-4 py-3 text-[13px] text-muted">Saved.</div> : null}
      {error ? <div className="rounded-[9px] bg-[#fbe3d9] px-4 py-3 text-[13px] text-[#b4382a]">{errors[error] ?? "Something went wrong."}</div> : null}

      <div className="grid items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="panel flex flex-col gap-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Cutout</span>
                <span className="text-[11px] text-muted">{a.cutout?.model ?? "birefnet"}{a.cutout?.removed === false ? " · offline, original kept" : ""}</span>
              </div>
              <div className="flex items-center justify-center overflow-hidden rounded-[7px] border border-line" style={{ aspectRatio: ratio, ...CHECKER_STYLE }}>
                {cutoutUrl && status === "ready" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cutoutUrl} alt={`${product.name} cutout`} className="h-full w-full object-contain" />
                ) : status === "failed" ? (
                  <div className="flex max-w-[28ch] flex-col items-center gap-2 p-6 text-center">
                    <span className="font-serif text-[20px] italic">Couldn’t remove the background.</span>
                    <span className="text-[12px] text-muted">{a.cutout?.error ?? "Unknown error"}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-orange shadow-[0_0_0_3px_#fbe3d9]" />
                    <span className="text-[12px] text-muted">Removing the background…</span>
                  </div>
                )}
              </div>
              <form action={redoCutout.bind(null, product.id)} className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted">{a.cutout?.updatedAt ? `Updated ${relative(new Date(a.cutout.updatedAt))}` : "Not run yet"}</span>
                <button type="submit" disabled={status === "processing" || !product.imageKey} className="btn btn-outline h-11 disabled:cursor-not-allowed disabled:opacity-50">
                  Redo cutout
                </button>
              </form>
            </section>

            <section className="panel flex flex-col gap-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Original</span>
                <span className="tabular text-[11px] text-muted">
                  {a.width && a.height ? `${a.width} × ${a.height}` : "—"}
                  {a.bytes ? ` · ${(a.bytes / 1024).toFixed(0)} KB` : ""}
                </span>
              </div>
              <div className="flex items-center justify-center overflow-hidden rounded-[7px] border border-line bg-[#f1f0ea]" style={{ aspectRatio: ratio }}>
                {originalUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={originalUrl} alt={product.name} className="h-full w-full object-contain" />
                ) : (
                  <span className="font-serif text-[20px] italic text-muted">No image</span>
                )}
              </div>
              <span className="truncate text-[12px] text-muted">{a.originalName ?? product.imageKey?.split("/").pop() ?? ""}</span>
            </section>
          </div>

          <section className="panel flex flex-col gap-2.5 px-4 py-3.5">
            <span className="eyebrow">Cutout history</span>
            {events.length ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px]">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3">
                    <span className={`font-semibold ${e.status === "succeeded" ? "text-[#3f7a55]" : e.status === "failed" ? "text-[#b4382a]" : "text-muted"}`}>
                      {e.status === "succeeded" ? "Succeeded" : e.status === "failed" ? "Failed" : "Running"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted">{e.error ?? ""}</span>
                    <span className="tabular whitespace-nowrap text-muted">
                      {e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)} s · ` : ""}
                      {relative(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[13px] text-muted">No runs yet.</p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <form action={updateProduct.bind(null, product.id)} className="panel flex flex-col gap-4 p-5">
            <span className="eyebrow">Details</span>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">
              Name
              <input name="name" required defaultValue={product.name} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">
              <span>
                Description <span className="font-normal text-muted">(optional)</span>
              </span>
              <textarea
                name="description"
                rows={4}
                defaultValue={product.description ?? ""}
                className="w-full rounded-[7px] border border-line bg-white px-3 py-2.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-muted/70 focus:border-ink"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Price
                <input name="price" defaultValue={product.price ?? ""} placeholder="$48" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">
                Product URL
                <input name="url" type="url" defaultValue={product.url ?? ""} placeholder="https://" className={inputClass} />
              </label>
            </div>
            <div className="flex flex-col gap-1.5 text-[13px] font-medium">
              <span>
                Replace photo <span className="font-normal text-muted">(re-runs the cutout)</span>
              </span>
              <ImagePicker name="image" accept={IMAGE_ACCEPT} compact label="New photo" />
            </div>
            <button type="submit" className="btn btn-dark h-11">
              Save changes
            </button>
          </form>

          <form action={deleteProduct.bind(null, product.id)} className="panel flex items-center justify-between gap-3 border-dashed px-4 py-3.5">
            <span className="text-[12px] text-muted">Removes the photo, cutout and product. Creatives keep their renders.</span>
            <button type="submit" className="btn btn-outline h-11 whitespace-nowrap text-[#b4382a] hover:border-[#b4382a]">
              Delete
            </button>
          </form>
        </div>
      </div>
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
