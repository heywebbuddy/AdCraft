import type { BrandKitData } from "@adcraft/db";
import { PendingButton } from "./pending-button";

const inputClass =
  "h-10 w-full rounded-[7px] border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

/**
 * "From your website": the screenshot, palette and font names the import found, with the
 * form to run it (again). Reads as a reference strip above the editor, not as more fields.
 */
export function SiteFindings({
  site,
  website,
  canEdit,
  action,
}: {
  site: BrandKitData["site"];
  website: string | null;
  canEdit: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const host = (site?.url ?? website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <section className="panel flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">From your website</span>
          <span className="text-[13px] text-muted">
            {site
              ? `Read ${host} on ${new Date(site.importedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Re-run after a redesign.`
              : "Adcraft can read the logo, colours, fonts and tagline straight from the site, with a screenshot for reference."}
          </span>
        </div>
        {canEdit ? (
          <form action={action} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input name="website" defaultValue={site?.url ?? website ?? ""} placeholder="https://yourbrand.com" required className={`${inputClass} sm:w-[280px]`} aria-label="Website to read" />
            <PendingButton className="btn btn-dark h-10 whitespace-nowrap" pendingLabel="Reading the site…">
              {site ? "Read again" : "Read the website"} <span aria-hidden="true">↗︎</span>
            </PendingButton>
          </form>
        ) : null}
      </div>

      {site ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {site.screenshotUrl ? (
            <a href={site.url} target="_blank" rel="noreferrer noopener" className="group relative block overflow-hidden rounded-[9px] border border-line bg-paper" title={`Open ${host}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={site.screenshotUrl} alt={`Screenshot of ${host}`} className="block aspect-[16/10] w-full object-cover object-top" loading="lazy" />
              <span className="absolute bottom-2 left-2 rounded-full bg-[#242521e6] px-2 py-[3px] text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                {host} ↗
              </span>
            </a>
          ) : (
            <div className="grid aspect-[16/10] place-items-center rounded-[9px] border border-dashed border-line text-[12px] text-muted">No screenshot — the page took too long to load.</div>
          )}
          <div className="flex flex-col gap-4 text-[13px]">
            <div className="flex flex-col gap-2">
              <span className="field-label">Colours on the site</span>
              <div className="flex flex-wrap gap-1.5">
                {site.palette.map((hex) => (
                  <span key={hex} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 font-mono text-[11px] uppercase text-muted">
                    <span className="swatch h-5 w-5 rounded-full" style={{ background: hex }} />
                    {hex}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="field-label">Fonts the site uses</span>
              <span className="text-muted">
                {site.fonts.length ? site.fonts.slice(0, 4).join(" · ") : "Nothing declared — system fonts."}
                {site.fonts.length ? <span className="block text-[11px]">Mapped to the closest kit fonts below; change them if the match is off.</span> : null}
              </span>
            </div>
            {site.headline ? (
              <div className="flex flex-col gap-1.5">
                <span className="field-label">Headline on the page</span>
                <span className="font-serif text-[17px] leading-snug text-ink">“{site.headline}”</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
