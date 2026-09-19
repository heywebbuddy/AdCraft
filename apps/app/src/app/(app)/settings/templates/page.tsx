import { PageHeader } from "@/components/workspace-ui";
import Link from "next/link";
import { requireOrg } from "@/server/org";
import { listTemplatesFor } from "@/server/collab-data";
import { deleteTemplateForm } from "@/server/collab";
import { SettingsNav } from "@/components/settings-nav";
import { STATIC_TEMPLATES, type StaticTemplate } from "@adcraft/render";
import { TemplateThumb } from "../../creatives/template-thumb";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = { static: "Static", video: "Video", ugc: "UGC" };
const templateLabel = Object.fromEntries(STATIC_TEMPLATES.map((t) => [t.id, t.label])) as Record<string, string>;
const isStaticTemplate = (t: string | undefined): t is StaticTemplate => STATIC_TEMPLATES.some((s) => s.id === t);

export default async function TemplatesPage() {
  const ctx = await requireOrg();
  const list = await listTemplatesFor(ctx.org.id, null, null);
  const canEdit = ctx.role !== "viewer";

  return (
    <>
      <PageHeader title="Templates" description="Save creative directions and reuse what works."/>

      <SettingsNav active="templates" role={ctx.role} />

      {list.length === 0 ? (
        <div className="panel flex max-w-[720px] flex-col items-start gap-3 border-dashed p-6">
          <div className="font-serif text-[22px] italic">Nothing saved yet.</div>
          <p className="m-0 max-w-[52ch] text-[13px] text-muted">
            Open any creative’s review page and choose “Save as template”. Shared templates show up for every brand in {ctx.org.name}; brand templates stay with their brand.
          </p>
          <Link href="/creatives" className="btn btn-dark h-11">
            Browse creatives <span aria-hidden="true">↗︎</span>
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => {
            const doc = t.document as { headline?: string; template?: string; brand?: { colors?: { primary?: string; accent?: string } } };
            const colors = { primary: doc.brand?.colors?.primary ?? "#242521", accent: doc.brand?.colors?.accent ?? "#e65c32" };
            const template: StaticTemplate = isStaticTemplate(doc.template) ? doc.template : "hero";
            const layout = doc.template ? `${templateLabel[doc.template] ?? doc.template.charAt(0).toUpperCase() + doc.template.slice(1)} layout` : "Layout";
            return (
              <div key={t.id} className="tile flex flex-col">
                <div className="relative bg-[#efeee8] p-3">
                  <TemplateThumb template={template} colors={colors} />
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-surface px-2 py-[3px] text-[10px] font-semibold text-muted">
                    {t.isShared ? "Shared" : t.brandName ?? "Brand"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-[13px] pb-[13px] pt-3">
                  <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="text-[11px] font-medium text-muted">{kindLabel[t.kind] ?? t.kind}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="min-w-0 truncate">{layout} · {t.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
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
