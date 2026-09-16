import Link from "next/link";
import { requireOrg } from "@/server/org";
import { listCreatives } from "@/server/creatives";
import { AutoRefresh } from "@/components/auto-refresh";
import { CreativesIcon, PlusIcon, PlayIcon } from "@/components/icons";
import {
  PageHeader,
  CollectionSearch,
  EmptyState,
} from "@/components/workspace-ui";
import { CreativeCard } from "@/components/creative-card";
export const dynamic = "force-dynamic";
const KINDS = [
  { id: "", label: "All creatives" },
  { id: "static", label: "Static ads" },
  { id: "video", label: "Videos" },
  { id: "ugc", label: "UGC videos" },
];
function href(kind: string, status: string, query: string) {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  if (query) params.set("q", query);
  return `/creatives${params.size ? "?" + params.toString() : ""}`;
}
export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string; q?: string }>;
}) {
  const ctx = await requireOrg();
  const { kind = "", status = "", q = "" } = await searchParams;
  const all = await listCreatives(ctx.org.id, ctx.brand?.id ?? null, {
    kind: kind || undefined,
    status: status || undefined,
  });
  const items = all.filter((item) =>
    item.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const rendering = all.filter((i) => i.status === "rendering").length;
  const filtered = Boolean(kind || status || q);
  return (
    <>
      <AutoRefresh active={rendering > 0} />
      <PageHeader
        title="All creatives"
        description="Create, organize, and review every ad in your workspace."
        actions={
          <>
            <Link href="/briefs/new?format=video" className="btn btn-outline">
              <PlayIcon width={14} height={14} /> Create video
            </Link>
            <Link href="/briefs" className="btn btn-orange">
              <PlusIcon width={15} height={15} /> Create from a brief
            </Link>
          </>
        }
      />
      <nav className="workspace-tabs" aria-label="Creative format">
        {KINDS.map((k) => (
          <Link
            key={k.id}
            href={href(k.id, status, q)}
            className={kind === k.id ? "active" : ""}
            aria-current={kind === k.id ? "page" : undefined}
          >
            {k.label}
          </Link>
        ))}
      </nav>
      <div className="collection-toolbar">
        <CollectionSearch
          action="/creatives"
          query={q}
          placeholder="Search creatives…"
          hidden={{ kind, status }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="collection-count">
            {items.length} creative{items.length === 1 ? "" : "s"}
          </span>
          <form action="/creatives" className="flex items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="q" value={q} />
            <select
              aria-label="Creative status"
              name="status"
              defaultValue={status}
              className="h-9 border border-line bg-white px-3 text-[11px]"
            >
              <option value="">All statuses</option>
              <option value="ready">Ready</option>
              <option value="rendering">Rendering</option>
              <option value="failed">Failed</option>
            </select>
            <button type="submit" className="btn btn-outline">
              Apply
            </button>
          </form>
        </div>
      </div>
      {items.length ? (
        <div className="creative-grid">
          {items.map((item) => (
            <CreativeCard key={item.id} {...item} />
          ))}
        </div>
      ) : filtered ? (
        <EmptyState
          icon={<CreativesIcon />}
          title="No matching creatives"
          description="Try another search or clear your filters to see all your work."
          href="/creatives"
          action="Clear filters"
        />
      ) : (
        <EmptyState
          icon={<CreativesIcon width={25} height={25} />}
          title="Make something worth stopping for"
          description="Start with a brief, choose a creative direction, and turn it into ads for every platform."
          href="/briefs/new"
          action="Create your first brief"
          secondary={
            <Link href="/briefs/new?format=video" className="btn btn-outline">
              Create a video
            </Link>
          }
        />
      )}
    </>
  );
}
