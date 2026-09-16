import { Spark } from "@/components/spark";
import {
  PageHeader,
  CollectionSearch,
  EmptyState,
} from "@/components/workspace-ui";
import Link from "next/link";
import { requireOrg } from "@/server/org";
import { FORMATS, listBriefs } from "@/server/briefs";
import { relative } from "./format";

export const dynamic = "force-dynamic";

const formatLabel = Object.fromEntries(
  FORMATS.map((f) => [f.id, f.label]),
) as Record<string, string>;

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const ctx = await requireOrg();
  const all = await listBriefs(ctx.org.id, ctx.brand?.id ?? null);
  const items = all.filter((b) =>
    b.title.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const generating = items.filter((b) => b.generating).length;

  return (
    <>
      <PageHeader
        title="Creative briefs"
        description="Give your next campaign a clear direction. Explore concepts, hooks, and formats."
        actions={
          <Link href="/briefs/new" className="btn btn-orange">
            ＋ New brief
          </Link>
        }
      />
      <div className="collection-toolbar">
        <CollectionSearch
          action="/briefs"
          query={q}
          placeholder="Search briefs…"
        />
        <span className="collection-count">
          {items.length} briefs{generating ? ` · ${generating} generating` : ""}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={
            q ? "No matching briefs" : "A clear brief. A stronger campaign."
          }
          description={
            q
              ? "Try a different title to find the brief you’re looking for."
              : "Define your audience, offer, and objective. We’ll help turn your direction into concepts ready to create."
          }
          href={q ? "/briefs" : "/briefs/new"}
          action={q ? "Clear search" : "Create your first brief"}
        />
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
                    <span className="truncate text-[14px] font-semibold">
                      {b.title}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {b.formats.map((f) => (
                        <span
                          key={f}
                          className="rounded bg-[#efeee8] px-[7px] py-0.5 text-[11px] text-[#4a4b44]"
                        >
                          {formatLabel[f] ?? f}
                        </span>
                      ))}
                      {b.platforms.length ? (
                        <span className="text-[11px] text-muted">
                          · {b.platforms.join(", ")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-[13px] capitalize text-[#4a4b44]">
                    {b.objective}
                  </span>
                  <span className="flex items-center gap-2 text-[13px]">
                    {b.generating ? (
                      <>
                        <Spark size={12} animate="spin" className="text-orange" />
                        <span className="font-semibold text-orange">
                          Generating
                        </span>
                      </>
                    ) : b.conceptCount > 0 ? (
                      <span className="tabular">
                        {b.conceptCount} concept
                        {b.conceptCount === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-muted">Draft</span>
                    )}
                  </span>
                  <span className="tabular text-[12px] text-muted md:text-right">
                    {relative(b.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
