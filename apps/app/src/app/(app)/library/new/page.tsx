import Link from "next/link";
import { PendingButton } from "@/components/pending-button";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/org";
import { createProduct, importProduct } from "@/server/library";
import { ImagePicker } from "@/components/image-picker";
import { IMAGE_ACCEPT } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

const errors: Record<string, string> = {
  name: "Give the product a name.",
  image: "Choose a product photo.",
  type: "Photos must be PNG, JPG or WebP.",
  size: "Photos must be 15 MB or smaller.",
  url: "Could not import from that page.",
};

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string; detail?: string; welcome?: string }> }) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  const { error, detail, welcome } = await searchParams;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/library" className="hover:text-ink">
              Library
            </Link>{" "}
            · New product
          </div>
          <h1 className="m-0">Add a product</h1><p className="m-0 mt-2 text-muted">{welcome ? "One product is enough for a first ad. Paste its page, or upload a photo." : "Paste a product page, or upload a photo. The background is removed automatically."}</p>
        </div>
      </header>

      <form action={importProduct} className="panel flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Import from a product page</span>
          <span className="text-[11px] text-muted">Name, description, price and photo</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input name="url" type="url" required placeholder="https://yourbrand.com/products/everyday-serum" className={`${inputClass} flex-1`} />
          <PendingButton className="btn btn-dark h-11 shrink-0" pendingLabel="Importing…">Import ↗︎</PendingButton>
        </div>
        {error === "url" ? <p className="m-0 text-[12px] text-[#b4382a]">{detail ? decodeURIComponent(detail) : errors.url} Upload a photo below instead.</p> : null}
      </form>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[1.2px] text-muted"><span className="h-px flex-1 bg-line" />or upload<span className="h-px flex-1 bg-line" /></div>

      <form action={createProduct} className="grid grid-cols-1 items-start gap-[26px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Product photo</span>
            <span className="text-[11px] text-muted">PNG, JPG or WebP · up to 15 MB</span>
          </div>
          <ImagePicker name="image" accept={IMAGE_ACCEPT} required label="Choose a photo" hint="Front-on, plain background, product filling the frame works best" />
          <p className="m-0 text-[12px] text-muted">
            Large photos are resized to 2048px on the long edge. The background is removed automatically and the cutout is passed to every scene generation as a reference.
          </p>
        </section>

        <section className="panel side-sticky flex flex-col gap-4 p-5">
          <span className="eyebrow">Details · {ctx.brand.name}</span>
          {error ? <p className="m-0 rounded-[7px] bg-[#fbe3d9] px-3 py-2 text-[13px] text-[#b4382a]">{errors[error] ?? "Something went wrong."}</p> : null}
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Name</span>
            <input name="name" required placeholder="Everyday Serum 30ml" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">
              Description <span className="field-hint">Optional</span>
            </span>
            <textarea
              name="description"
              rows={4}
              placeholder="What it is, who it’s for, the one thing that makes it different."
              className="w-full rounded-[7px] border border-line bg-surface px-3 py-2.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-muted/70 focus:border-ink"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">
                Price <span className="field-hint">Optional</span>
              </span>
              <input name="price" placeholder="$48" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">
                Product URL <span className="field-hint">Optional</span>
              </span>
              <input name="url" type="url" placeholder="https://" className={inputClass} />
            </label>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <PendingButton className="btn btn-orange h-11" pendingLabel="Uploading…">
              Upload and cut out <span aria-hidden="true">↗︎</span>
            </PendingButton>
            <Link href="/library" className="btn btn-outline h-11">
              Cancel
            </Link>
          </div>
        </section>
      </form>
    </>
  );
}
