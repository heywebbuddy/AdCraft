import { PageHeader } from "@/components/workspace-ui";
import Link from "next/link";
import { requireOrg } from "@/server/org";
import { createBrand } from "@/server/brands";
import { PendingButton } from "@/components/pending-button";

export const dynamic = "force-dynamic";

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

export default async function NewBrandPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireOrg();
  const { error } = await searchParams;
  const first = ctx.brands.length === 0;

  return (
    <>
      <PageHeader title="Add a brand" description="Set the foundation for a consistent creative identity."/>

      <form action={createBrand} className="panel flex w-full max-w-[520px] flex-col gap-4 p-5">
        <p className="m-0 text-[13px] text-muted">
          Give us the website and Adcraft reads the logo, colours, fonts and tagline from it. Everything stays editable on the next screen.
        </p>
        {error ? <p className="m-0 rounded-[7px] bg-[#fbe3d9] px-3 py-2 text-[13px] text-[#b4382a]">The brand needs a name.</p> : null}
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Brand name</span>
          <input name="name" required autoFocus placeholder="Éclat Skin" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">
            Website <span className="field-hint">Optional</span>
          </span>
          <input name="website" placeholder="eclatskin.com" className={inputClass} />
        </label>
        <label className="flex items-start gap-2.5 text-[13px] leading-snug">
          <input type="checkbox" name="importSite" value="1" defaultChecked className="mt-[3px]" />
          <span>
            <span className="font-semibold">Set up the kit from the website</span>
            <span className="block text-muted">Logo, colours, fonts, tagline and tone, read from the site with a screenshot for reference. Ten to twenty seconds.</span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">
            Industry <span className="field-hint">Optional</span>
          </span>
          <input name="industry" placeholder="Skincare" className={inputClass} />
        </label>
        <div className="mt-1 flex items-center gap-3">
          <PendingButton className="btn btn-orange h-11" pendingLabel="Reading the website…">
            Create brand <span aria-hidden="true">↗︎</span>
          </PendingButton>
          {!first ? (
            <Link href="/brands" className="btn btn-outline h-11">
              Cancel
            </Link>
          ) : null}
        </div>
      </form>
    </>
  );
}
