import Link from "next/link";
import { requireOrg } from "@/server/org";

export default async function CampaignsPage() {
  await requireOrg();
  const platforms = [
    { name: "Meta", covers: "Facebook and Instagram", how: "Ads Manager → Create → upload the exported 1:1, 4:5 and 9:16 files." },
    { name: "TikTok", covers: "In-feed and Spark Ads", how: "TikTok Ads Manager → upload the 9:16 video or image." },
    { name: "Google", covers: "Demand Gen, Display and YouTube", how: "Google Ads → Assets → upload 1:1, 1.91:1 and 16:9 files." },
  ];
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <div className="eyebrow">Campaigns</div>
        <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
          Publishing from Adcraft <span className="font-serif italic text-orange">is coming in the final release.</span>
        </h1>
        <p className="m-0 max-w-[62ch] text-[15px] text-muted">
          Until then, every finished creative exports in the exact size each platform wants, checked against its spec, so uploads are accepted first time.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {platforms.map((p) => (
          <section key={p.name} className="panel flex flex-col gap-2 p-5">
            <span className="text-[15px] font-semibold">{p.name}</span>
            <span className="text-[12px] text-muted">{p.covers}</span>
            <p className="m-0 mt-2 text-[13px]">{p.how}</p>
          </section>
        ))}
      </div>
      <Link href="/creatives" className="btn btn-dark h-11 self-start">
        Go to creatives <span aria-hidden="true">↗</span>
      </Link>
    </>
  );
}
