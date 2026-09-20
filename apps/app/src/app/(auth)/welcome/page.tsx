import { redirect } from "next/navigation";
import { PendingButton } from "@/components/pending-button";
import { Wordmark } from "@/components/spark";
import { eq } from "drizzle-orm";
import { db, dbReady, memberships } from "@adcraft/db";
import { requireViewer } from "@/server/org";
import { createWorkspace } from "@/server/onboarding";
import { BrandDiscovery } from "@/components/brand-discovery";

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await dbReady;
  const viewer = await requireViewer();
  const existing = await db.query.memberships.findFirst({ where: eq(memberships.userId, viewer.userId) });
  if (existing) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1">
      <BrandDiscovery action={createWorkspace}>
        <div className="mb-8">
          <Wordmark size={26} />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">Step 1 of 1 · Your workspace</div>
        <h1 className="mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">
          Hi {viewer.name}.<br />
          <span className="font-serif italic text-orange">Who are we making ads for?</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          A workspace holds your team and billing. A brand holds products, colours and tone. You can add more brands later.
        </p>
        {error === "closed" ? (
          <p className="mt-4 text-sm text-orange">New workspaces are paused for the moment. Please try again a little later.</p>
        ) : error ? (
          <p className="mt-4 text-sm text-orange">Both names are needed.</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Workspace name
            <input name="orgName" required placeholder="Éclat Studio" className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            First brand
            <input name="brandName" required placeholder="Éclat Skin" className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Brand website <span className="font-normal text-muted">(optional)</span>
            {/* A bare domain is what people type; the importer adds the scheme. */}
            <input name="website" type="text" inputMode="url" autoComplete="url" placeholder="eclatskin.com" className={inputClass} />
          </label>
          <PendingButton className="btn btn-orange h-12 justify-between text-[15px]" pendingLabel="Setting up your studio…">
            Open my studio <span aria-hidden="true">↗︎</span>
          </PendingButton>
          <p className="text-xs text-muted">Starts with 10 free credits. No card needed.</p>
        </div>
      </BrandDiscovery>
    </main>
  );
}
