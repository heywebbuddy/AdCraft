import {
  PageHeader,
  CollectionSearch,
  EmptyState,
} from "@/components/workspace-ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/org";
import {
  cutoutStatus,
  fileUrl,
  listProducts,
  productAttributes,
} from "@/server/library-data";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlusIcon } from "@/components/icons";
import { CHECKER_STYLE, CutoutStatusChip } from "@/components/cutout-status";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; q?: string }>;
}) {
  const ctx = await requireOrg();
  if (!ctx.brand) redirect("/brands/new");
  const { deleted, q = "" } = await searchParams;
  const all = await listProducts(ctx.org.id, ctx.brand.id);
  const items = all.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const ready = items.filter((p) => cutoutStatus(p) === "ready").length;
  const processing = items.filter(
    (p) => cutoutStatus(p) === "processing",
  ).length;

  return (
    <>
      <AutoRefresh active={processing > 0} />
      <PageHeader
        title="Product library"
        description="Your product imagery, organized and ready for every creative."
        actions={
          <Link href="/library/new" className="btn btn-orange">
            <PlusIcon width={15} height={15} /> Add product
          </Link>
        }
      />
      <div className="collection-toolbar">
        <CollectionSearch
          action="/library"
          query={q}
          placeholder="Search products…"
        />
        <span className="collection-count">
          {items.length} products · {ready} ready
          {processing ? ` · ${processing} processing` : ""}
        </span>
      </div>

      {deleted ? (
        <div className="panel px-4 py-3 text-[13px] text-muted">
          Product removed.
        </div>
      ) : null}

      {items.length ? (
        <div className="creative-grid">
          {items.map((p) => {
            const a = productAttributes(p);
            const status = cutoutStatus(p);
            const src = fileUrl(p.cutoutKey) ?? fileUrl(p.imageKey);
            return (
              <Link
                key={p.id}
                href={`/library/${p.id}`}
                className="tile flex flex-col"
              >
                <div
                  className="relative flex h-[240px] items-center justify-center overflow-hidden p-5"
                  style={{
                    ...(p.cutoutKey
                      ? CHECKER_STYLE
                      : { background: "#f1f0ea" }),
                  }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={p.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="font-serif text-[20px] italic text-muted">
                      No image
                    </span>
                  )}
                  <span className="absolute right-2.5 top-2.5">
                    <CutoutStatusChip status={status} />
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span className="min-w-0 truncate">{p.name}</span>
                    {p.price ? (
                      <span className="tabular text-[11px] font-medium text-muted">
                        {p.price}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[11px] text-muted">
                    <span className="min-w-0 truncate">
                      {a.width && a.height ? `${a.width} × ${a.height}` : "—"}
                    </span>
                    <span>{relative(p.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            q
              ? "No matching products"
              : "Your products, ready for the spotlight"
          }
          description={
            q
              ? "Try another product name or clear your search."
              : "Add a product photo to build your library. We’ll prepare the image for your next creative."
          }
          href={q ? "/library" : "/library/new"}
          action={q ? "Clear search" : "Add your first product"}
        />
      )}
    </>
  );
}

function relative(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
