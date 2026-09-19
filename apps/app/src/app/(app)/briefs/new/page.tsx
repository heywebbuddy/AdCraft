import Link from "next/link";
import { requireOrg } from "@/server/org";
import { briefPrefillFromCreative, FORMATS, listProductsForBrand } from "@/server/briefs";
import { FlowSteps } from "@/components/flow-steps";
import { BriefForm } from "./brief-form";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  title: "a title",
  objective: "an objective",
  audience: "an audience",
  platforms: "at least one platform",
  formats: "at least one format",
  product: "a product from this brand",
};

export default async function NewBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; format?: string; product?: string; from?: string }>;
}) {
  const ctx = await requireOrg();
  const { error, format, product: productParam, from } = await searchParams;
  const prefill = from ? await briefPrefillFromCreative(ctx.org.id, from) : null;
  const product = prefill?.productId ?? productParam;
  const initialFormat =
    (format && FORMATS.some((f) => f.id === format) ? format : prefill?.formats[0]) ?? "static";
  const productList = await listProductsForBrand(ctx.org.id, ctx.brand?.id ?? null);
  const missing = error
    ? error
        .split(",")
        .map((k) => ERRORS[k])
        .filter(Boolean)
    : [];

  return (
    <>
      <FlowSteps
        current="brief"
        format={
          initialFormat === "video" ? "Product video" : initialFormat === "ugc" ? "Presenter video" : "Static ad"
        }
      />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">
            <Link href="/briefs" className="hover:text-ink">
              Briefs
            </Link>{" "}
            · New
          </div>
          <h1 className="m-0">
            {prefill
              ? "Next round"
              : initialFormat === "video"
                ? "A new product video"
                : initialFormat === "ugc"
                  ? "A new presenter video"
                  : "A new static ad"}
          </h1>
          <p className="m-0 mt-2 text-muted">
            Start with the brief: who it is for and what it must say. Ideas come next, then the ad.
          </p>
        </div>
        <span className="text-[12px] text-muted">
          Costs 1 credit · {ctx.credits.balance} left
        </span>
      </header>

      <BriefForm
        products={productList}
        brandName={ctx.brand?.name ?? "your brand"}
        brandHref={ctx.brand ? `/brands/${ctx.brand.id}` : "/brands"}
        credits={ctx.credits.balance}
        missing={missing}
        prefillNote={prefill?.note ?? null}
        initial={{
          title: prefill?.title ?? "",
          productId: productList.some((p) => p.id === product) ? (product ?? "") : "",
          objective: prefill?.objective ?? "conversion",
          audience: prefill?.audience ?? "",
          offer: prefill?.offer ?? "",
          platforms: prefill?.platforms ?? ["meta", "instagram"],
          formats: prefill?.formats?.length ? prefill.formats : [initialFormat],
          tone: prefill?.tone ?? "",
          constraints: prefill?.constraints.join("\n") ?? "",
        }}
      />
    </>
  );
}
