import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingButton } from "@/components/pending-button";
import { Wordmark } from "@/components/spark";
import { requireOrg } from "@/server/org";
import { importFirstProduct } from "@/server/onboarding";

const inputClass = "h-12 w-full rounded-[7px] border border-line bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

/**
 * Onboarding, step 2: get to a first ad. Paste a product link and Adcraft imports the name,
 * description and photo, cuts the background out, and opens a pre-filled brief.
 */
export default async function FirstAdPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[520px]">
        <div className="mb-8"><Wordmark size={26} /></div>
        <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">Step 2 of 2 · Your first ad</div>
        <h1 className="mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">
          {ctx.brand.name} is ready.<br />
          <span className="font-serif italic text-orange">What are we advertising first?</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">Paste a product page. Adcraft pulls the name, description and photo, removes the background, and opens a brief with it filled in. About a minute to your first ad.</p>
        {error ? <p className="mt-4 rounded-[7px] border border-[#f0c9c2] bg-[#fdf1ee] px-4 py-3 text-sm text-[#b4382a]">{decodeURIComponent(error)}</p> : null}
        <form action={importFirstProduct} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Product page
            <input name="url" type="url" required autoFocus placeholder="https://yourbrand.com/products/everyday-serum" className={inputClass} />
          </label>
          <PendingButton className="btn btn-orange h-12 justify-between text-[15px]" pendingLabel="Importing the product…">
            Import and write the brief <span aria-hidden="true">↗︎</span>
          </PendingButton>
        </form>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
          <Link href="/library/new?welcome=1" className="font-semibold text-ink hover:text-orange">Upload a photo instead ↗︎</Link>
          <Link href="/characters" className="font-semibold text-ink hover:text-orange">Start with a presenter video ↗︎</Link>
          <Link href="/dashboard" className="hover:text-ink">Skip for now</Link>
        </div>
        <p className="mt-6 text-xs text-muted">{ctx.credits.balance} free credits — about {Math.floor(ctx.credits.balance / 2)} static ads, or one presenter video.</p>
      </div>
    </main>
  );
}
