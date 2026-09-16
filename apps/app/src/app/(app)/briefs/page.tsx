import Link from "next/link";
import { requireOrg } from "@/server/org";
import { FORMATS, listBriefs } from "@/server/briefs";
import { relative } from "./format";

export const dynamic = "force-dynamic";

const formatLabel = Object.fromEntries(FORMATS.map((f) => [f.id, f.label])) as Record<string, string>;

export default async function BriefsPage() {
  const ctx = await requireOrg();
  const items = await listBriefs(ctx.org.id, ctx.brand?.id ?? null);
  const generating = items.filter((b) => b.generating).length;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">Briefs · {ctx.brand?.name ?? ctx.org.name}</div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {items.length === 0 ? (
              <>
                No briefs yet. <span className="font-serif italic tracking-[-0.6px] text-orange">Two lines is enough.</span>
              </>
            ) : generating > 0 ? (
              <>
                {items.length} brief{items.length === 1 ? "" : "s"}.{" "}
                <span className="font-serif italic tracking-[-0.6px] text-orange">
                  {generating} generating right now.
                </span>
              </>
            ) : (
              <>
                {items.length} brief{items.length === 1 ? "" : "s"}.{" "}
                <span className="font-serif italic tracking-[-0.6px] text-orange">Every ad starts here.</span>
              </>
            )}
          </h1>
        </div>
        <Link href="/briefs/new" className="btn btn-orange h-11 shrink-0">
          New brief <span aria-hidden="true" className="text-lg leading-none">↗</span>
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
          <div className="font-serif text-[22px] italic">Tell us who it is for and what you are offering.</div>
          <p className="m-0 max-w-[56ch] text-[13px] text-muted">
            A brief is a title, an audience and an offer. Adcraft turns it into eight hooks and angles across the formats
            you pick, ready to make into ads.
          </p>
          <Link href="/briefs/new" className="btn btn-dark h-11">
            Write the first brief <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <section className="panel overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_90px] items-center gap-4 border-b border-line px-4 py-2.5 max-md:hidden">
            <span className="eyebrow">Brief</span>
            <span className="eyebrow">Objective</span>
            <span className="eyebrow">Status</span>
            <span className="eyebrow text-right">Created</span>
          </div>
          <ul className="m-0 list-none p-0">
            {items.map((b) => (
              <li key={b.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/briefs/${b.id}`}
                  className="grid items-center gap-4 px-4 py-3.5 hover:bg-paper md:grid-cols-[minmax(0,1fr)_120px_150px_90px]"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate text-[14px] font-semibold">{b.title}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {b.formats.map((f) => (
                        <span key={f} className="rounded bg-[#efeee8] px-[7px] py-0.5 text-[11px] text-[#4a4b44]">
                          {formatLabel[f] ?? f}
                        </span>
                      ))}
                      {b.platforms.length ? (
                        <span className="text-[11px] text-muted">· {b.platforms.join(", ")}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-[13px] capitalize text-[#4a4b44]">{b.objective}</span>
                  <span className="flex items-center gap-2 text-[13px]">
                    {b.generating ? (
                      <>
                        <span className="h-[7px] w-[7px] rounded-full bg-orange shadow-[0_0_0_3px_#fbe3d9]" />
                        <span className="font-semibold text-orange">Generating</span>
                      </>
                    ) : b.conceptCount > 0 ? (
                      <span className="tabular">
                        {b.conceptCount} concept{b.conceptCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-muted">Draft</span>
                    )}
                  </span>
                  <span className="tabular text-[12px] text-muted md:text-right">{relative(b.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
