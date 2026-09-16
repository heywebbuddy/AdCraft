import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/server/org";
import { getActiveKit, getBrand, listKitVersions } from "@/server/brands-data";
import { saveBrandKit, selectBrand } from "@/server/brands";
import { withDefaults } from "@/lib/brand-kit";
import { BrandKitEditor } from "@/components/brand-kit-editor";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  name: "The brand needs a name.",
  "logo-type": "Logos must be PNG, SVG, JPG or WebP.",
  "logo-size": "Logos must be 15 MB or smaller.",
};

export default async function BrandKitPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; created?: string }>;
}) {
  const ctx = await requireOrg();
  const { brandId } = await params;
  const { error, saved, created } = await searchParams;
  const brand = await getBrand(ctx.org.id, brandId);
  if (!brand) notFound();
  const [active, versions] = await Promise.all([
    getActiveKit(ctx.org.id, brandId),
    listKitVersions(ctx.org.id, brandId),
  ]);
  const kit = withDefaults(active?.data);
  const current = ctx.brand?.id === brand.id;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/brands" className="hover:text-ink">
              Brands
            </Link>{" "}
            · Brand kit · v{active?.version ?? 1}
            {versions.length > 1 ? ` of ${versions.length}` : ""}
          </div>
          <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
            {brand.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {current ? (
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-[#3f7a55]">
              Current brand
            </span>
          ) : (
            <form action={selectBrand.bind(null, brand.id)}>
              <button type="submit" className="btn btn-outline h-11">
                Switch to this brand
              </button>
            </form>
          )}
          <button
            type="submit"
            form="brand-kit-form"
            className="btn btn-orange h-11"
          >
            Save kit{" "}
            <span aria-hidden="true" className="text-lg leading-none">
              ↗
            </span>
          </button>
        </div>
      </header>

      {created ? (
        <div className="panel px-4 py-3 text-[13px] text-muted">
          <span className="font-semibold text-ink">{brand.name}</span> is ready.
          Add the logo and colours so generated ads match from the first one.
        </div>
      ) : null}
      {saved ? (
        <div className="panel px-4 py-3 text-[13px] text-muted">
          Saved as version {active?.version ?? 1}. Earlier versions are kept for
          creatives made with them.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[9px] bg-[#fbe3d9] px-4 py-3 text-[13px] text-[#b4382a]">
          {errors[error] ?? "Something went wrong."}
        </div>
      ) : null}

      <BrandKitEditor
        brand={{
          id: brand.id,
          name: brand.name,
          website: brand.website,
          industry: brand.industry,
        }}
        kit={kit}
        action={saveBrandKit.bind(null, brand.id)}
      />
    </>
  );
}
