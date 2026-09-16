import Link from "next/link";
import { requireOrg } from "@/server/org";
import { listCreatives, type CreativeStatus } from "@/server/creatives";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlayIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const ratioClass: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1.91:1": "aspect-[1.91/1]",
};

const gradients = [
  "radial-gradient(120% 90% at 20% 10%, #fbe7cf 0%, #f0b489 45%, #d9744a 100%)",
  "linear-gradient(170deg, #e5ead9 0%, #b9c7a8 45%, #6f8064 100%)",
  "linear-gradient(135deg, #1d2a4a 0%, #2f4a7a 55%, #e97b5a 130%)",
  "linear-gradient(160deg, #2a5bd7 0%, #4f8bf7 50%, #d6f25a 130%)",
];

const STATUS: Record<CreativeStatus, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "text-[#3f7a55]" },
  rendering: { label: "Rendering", cls: "text-muted" },
  failed: { label: "Failed", cls: "text-[#b4382a]" },
};

const KINDS = [
  { id: "", label: "All" },
  { id: "static", label: "Static" },
  { id: "video", label: "Video" },
  { id: "ugc", label: "UGC" },
];

function href(kind: string, status: string) {
  const q = new URLSearchParams();
  if (kind) q.set("kind", kind);
  if (status) q.set("status", status);
  const s = q.toString();
  return s ? `/creatives?${s}` : "/creatives";
}

export default async function CreativesPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const ctx = await requireOrg();
  const { kind = "", status = "" } = await searchParams;
  const items = await listCreatives(ctx.org.id, ctx.brand?.id ?? null, { kind: kind || undefined, status: status || undefined });
  const rendering = items.filter((i) => i.status === "rendering").length;
  const ready = items.filter((i) => i.status === "ready").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const filtered = Boolean(kind || status);

  return (
    <>
      <AutoRefresh active={rendering > 0} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">Creatives · {ctx.brand?.name ?? ctx.org.name}</div>
          <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
            {items.length === 0 && !filtered ? (
              <>
                Nothing here yet. <span className="font-serif italic tracking-[-0.6px] text-orange">Let’s fix that.</span>
              </>
            ) : rendering > 0 ? (
              <>
                {rendering} rendering. <span className="font-serif italic tracking-[-0.6px] text-orange">Every size, in a moment.</span>
              </>
            ) : (
              <>
                {items.length} creative{items.length === 1 ? "" : "s"}.{" "}
                <span className="font-serif italic tracking-[-0.6px] text-orange">Every size it needs to be.</span>
              </>
            )}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[12px] text-muted">
            {ready} ready · {rendering} rendering{failed ? ` · ${failed} failed` : ""}
          </span>
          <Link href="/briefs" className="btn btn-orange h-11">
            From a concept <span aria-hidden="true" className="text-lg leading-none">↗</span>
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-[7px] border border-line bg-white p-[3px] text-[12px] font-medium">
            {KINDS.map((k) => (
              <Link
                key={k.id}
                href={href(k.id, status)}
                className={`inline-flex min-h-9 items-center rounded-[5px] px-3 ${kind === k.id ? "bg-ink text-white" : "text-[#4a4b44] hover:bg-paper"}`}
              >
                {k.label}
              </Link>
            ))}
          </div>
          <div className="flex gap-1 rounded-[7px] border border-line bg-white p-[3px] text-[12px] font-medium">
            {[
              { id: "", label: "Any status" },
              { id: "ready", label: "Ready" },
              { id: "rendering", label: "Rendering" },
              { id: "failed", label: "Failed" },
            ].map((s) => (
              <Link
                key={s.id}
                href={href(kind, s.id)}
                className={`inline-flex min-h-9 items-center rounded-[5px] px-3 ${status === s.id ? "bg-ink text-white" : "text-[#4a4b44] hover:bg-paper"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {items.length ? (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((t, i) => (
              <Link key={t.id} href={`/creatives/${t.id}`} className="tile flex flex-col">
                <div
                  className={`relative flex flex-col p-3.5 text-white ${ratioClass[t.ratio] ?? "aspect-[4/5]"}`}
                  style={{ background: t.previewUrl ? `url(${t.previewUrl}) center/cover` : gradients[i % gradients.length] }}
                >
                  {!t.previewUrl && t.headline ? (
                    <span className="mt-auto font-serif text-[22px] leading-none tracking-[-0.4px]">{t.headline}</span>
                  ) : null}
                  {!t.previewUrl && t.status === "rendering" ? (
                    <span className="absolute inset-x-3.5 bottom-3.5 h-[5px] overflow-hidden rounded-full bg-white/30">
                      <span className="block h-full w-1/2 animate-pulse rounded-full bg-white/90" />
                    </span>
                  ) : null}
                  {t.kind !== "static" ? (
                    <span className="absolute left-1/2 top-[42%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink">
                      <PlayIcon />
                    </span>
                  ) : null}
                  <span className={`absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold ${STATUS[t.status].cls}`}>
                    {STATUS[t.status].label}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="tabular text-[11px] font-medium text-muted">
                      {t.sizes.done}/{t.sizes.total} sizes
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[11px] text-muted">
                    <span className="min-w-0 truncate">{t.model ?? t.kind}</span>
                    <span>{relative(t.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : filtered ? (
          <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
            <div className="font-serif text-[22px] italic">Nothing matches that filter.</div>
            <Link href="/creatives" className="btn btn-outline h-11">
              Show everything
            </Link>
          </div>
        ) : (
          <div className="panel flex flex-col items-start gap-3 border-dashed p-6">
            <div className="font-serif text-[22px] italic">Your wall is empty. That never lasts long.</div>
            <p className="m-0 max-w-[52ch] text-[13px] text-muted">
              Write a brief, pick a concept you like, and the first static ad lands here in 1:1, 4:5, 9:16 and 16:9 — text, logo and product
              exact, scene painted by the model you choose.
            </p>
            <div className="flex items-center gap-3">
              <Link href="/briefs/new" className="btn btn-dark h-11">
                Write a brief <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/briefs" className="btn btn-outline h-11">
                Open a brief
              </Link>
            </div>
          </div>
        )}
      </section>
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
