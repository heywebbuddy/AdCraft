import Link from "next/link";
import { redirect } from "next/navigation";
import { OBJECTIVES } from "@adcraft/ads";
import { requireOrg } from "@/server/org";
import { listAdAccounts, listPublishableCreatives, placementsForPlatform } from "@/server/ads";
import { Notice } from "../ui";
import { CampaignBuilder, type BuilderPlacement } from "./builder";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ error?: string; account?: string }> }) {
  const ctx = await requireOrg();
  if (ctx.role === "viewer") redirect("/campaigns?error=forbidden");
  const { error, account } = await searchParams;
  const [accounts, creatives] = await Promise.all([listAdAccounts(ctx.org.id, ctx.brand?.id ?? null), listPublishableCreatives(ctx.org.id, ctx.brand?.id ?? null)]);
  const connected = accounts.filter((a) => a.status === "connected");
  if (connected.length === 0) redirect("/campaigns");

  const placements: BuilderPlacement[] = (["meta", "tiktok", "google"] as const).flatMap((platform) =>
    placementsForPlatform(platform).map((p) => ({ id: p.id, platform, label: p.label, ratio: p.ratio, media: p.media, specPlatform: p.platform })),
  );

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/campaigns" className="hover:text-ink">
              Campaigns
            </Link>{" "}
            · New
          </div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            One form. <span className="font-serif italic tracking-[-0.6px] text-orange">Every platform&rsquo;s native objects.</span>
          </h1>
          <p className="m-0 max-w-[62ch] text-[15px] text-muted">
            Pick the account, audience, placements and budget, then assign finished creatives. Hard spec failures block publishing; soft ones are shown so you can decide.
          </p>
        </div>
        <span className="text-[12px] text-muted">{creatives.length} finished creative{creatives.length === 1 ? "" : "s"} in {ctx.brand?.name ?? "this brand"}</span>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <CampaignBuilder
        accounts={connected.map((a) => ({ id: a.id, platform: a.platform, name: a.name, currency: a.currency, sandbox: a.sandbox }))}
        placements={placements}
        creatives={creatives}
        objectives={OBJECTIVES.map((o) => ({ id: o.id, label: o.label, hint: o.hint }))}
        brandName={ctx.brand?.name ?? ctx.org.name}
        brandWebsite={ctx.brand?.website ?? ""}
        initialAccountId={account ?? null}
      />
    </>
  );
}
