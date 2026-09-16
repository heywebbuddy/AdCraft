import Link from "next/link";
import { requireOrg } from "@/server/org";

export default async function PerformancePage() {
  await requireOrg();
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <div className="eyebrow">Performance</div>
        <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
          Numbers per creative, <span className="font-serif italic text-orange">once ad accounts connect.</span>
        </h1>
        <p className="m-0 max-w-[62ch] text-[15px] text-muted">
          Spend, CTR, CPA and ROAS will roll up to the Adcraft creative each ad came from, with fatigue alerts and “make more like the winner”. That ships with campaign publishing in the final release.
        </p>
      </header>
      <Link href="/creatives" className="btn btn-outline h-11 self-start">
        Back to creatives <span aria-hidden="true">↗</span>
      </Link>
    </>
  );
}
