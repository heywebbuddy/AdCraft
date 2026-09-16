import Link from "next/link";
import { requireOrg } from "@/server/org";
import { listTemplatesFor } from "@/server/collab-data";
import { deleteTemplateForm } from "@/server/collab";
import { SettingsNav } from "@/components/settings-nav";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = { static: "Static", video: "Video", ugc: "UGC" };

export default async function TemplatesPage() {
  const ctx = await requireOrg();
  const list = await listTemplatesFor(ctx.org.id, null, null);
  const canEdit = ctx.role !== "viewer";

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <div className="eyebrow">Templates</div>
        <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
          {list.length} saved {list.length === 1 ? "template" : "templates"}.{" "}
          <span className="font-serif italic text-muted">Start the next brief from a winner.</span>
        </h1>
      </header>

      <SettingsNav active="templates" role={ctx.role} />

      {list.length === 0 ? (
        <div className="panel flex max-w-[720px] flex-col items-start gap-3 border-dashed p-6">
          <div className="font-serif text-[22px] italic">Nothing saved yet.</div>
          <p className="m-0 max-w-[52ch] text-[13px] text-muted">
            Open any creative’s review page and choose “Save as template”. Shared templates show up for every brand in {ctx.org.name}; brand templates stay with their brand.
          </p>
          <Link href="/creatives" className="btn btn-dark h-11">
            Browse creatives <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => {
            const doc = t.document as { headline?: string; template?: string; brand?: { colors?: { primary?: string; accent?: string } } };
            const from = doc.brand?.colors?.primary ?? "#242521";
            const to = doc.brand?.colors?.accent ?? "#e65c32";
            return (
              <div key={t.id} className="tile flex flex-col">
                <div className="relative flex aspect-[4/5] flex-col p-3.5 text-white" style={{ background: `linear-gradient(160deg, ${from} 0%, ${to} 130%)` }}>
                  {doc.headline ? <span className="mt-auto font-serif text-[22px] leading-none tracking-[-0.4px]">{doc.headline}</span> : null}
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-white px-2 py-[3px] text-[10px] font-semibold text-muted">
                    {t.isShared ? "Shared" : t.brandName ?? "Brand"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="text-[11px] font-medium text-muted">{kindLabel[t.kind] ?? t.kind}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="min-w-0 truncate">{doc.template ? `${doc.template} layout` : "layout"} · {t.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    {canEdit ? (
                      <form action={deleteTemplateForm}>
                        <input type="hidden" name="templateId" value={t.id} />
                        <button className="font-semibold text-muted hover:text-[#b4382a]">Delete</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
