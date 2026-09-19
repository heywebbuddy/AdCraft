import { OBJECTIVES, type Platform } from "@adcraft/ads";
import { placementsForPlatform, type CampaignDetail } from "@/server/ads";
import { PendingButton } from "@/components/pending-button";
import { Field, chipClass, fieldClass } from "../ui";

const COUNTRIES: Array<[string, string]> = [
  ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["DE", "Germany"], ["FR", "France"],
  ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"], ["SE", "Sweden"], ["IE", "Ireland"], ["IN", "India"], ["SG", "Singapore"], ["AE", "United Arab Emirates"],
];

/** datetime-local wants local wall time without the zone. */
function local(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Edit a campaign in place. Name, daily budget and schedule are always open and, once the
 * campaign is on the platform, are pushed there before we save. Objective, audience and
 * placements can only change while it is still a draft on our side — after publishing they
 * are baked into the platform's ad sets and ads.
 */
export function CampaignEditForm({ campaign: c, published, open, action, isOwner, threshold }: {
  campaign: CampaignDetail;
  published: boolean;
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  isOwner: boolean;
  threshold: number | null;
}) {
  const t = c.raw.targeting;
  const placements = placementsForPlatform(c.platform as Platform);
  const chosen = new Set(c.raw.placements ?? []);
  return (
    <details className="panel group" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold">Edit campaign</span>
          <span className="text-[12px] text-muted">
            {published ? "Name, daily budget and schedule — changes go to the platform first." : "Everything is still open until it publishes."}
          </span>
        </span>
        <span className="text-[12px] font-semibold text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <form action={action} className="flex flex-col gap-5 border-t border-line px-5 py-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Campaign name">
            <input name="name" defaultValue={c.name} required className={`${fieldClass} h-11`} />
          </Field>
          <Field label={`Daily budget (${c.currency})`} hint={threshold !== null && !isOwner ? `Above ${threshold} needs an owner` : undefined}>
            <input name="dailyBudget" type="number" min={1} step="0.01" defaultValue={((c.dailyBudgetMinor ?? 0) / 100).toFixed(2)} required className={`${fieldClass} h-11 tabular`} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Start" hint="Blank = now">
            <input name="startAt" type="datetime-local" defaultValue={local(c.raw.schedule?.startAt)} className={`${fieldClass} h-11`} />
          </Field>
          <Field label="End" hint="Blank = ongoing">
            <input name="endAt" type="datetime-local" defaultValue={local(c.raw.schedule?.endAt)} className={`${fieldClass} h-11`} />
          </Field>
        </div>

        {!published ? (
          <>
            <Field label="Objective">
              <select name="objective" defaultValue={c.objective ?? "traffic"} className={`${fieldClass} h-11`}>
                {OBJECTIVES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label} — {o.hint}</option>
                ))}
              </select>
            </Field>
            <Field label="Countries">
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map(([code, label]) => (
                  <label key={code} className={chipClass}>
                    <input type="checkbox" name="countries" value={code} defaultChecked={(t?.countries ?? ["US"]).includes(code)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid gap-4 md:grid-cols-[120px_120px_minmax(0,1fr)]">
              <Field label="Age from"><input name="ageMin" type="number" min={13} max={100} defaultValue={t?.ageMin ?? 18} className={`${fieldClass} h-11 tabular`} /></Field>
              <Field label="Age to"><input name="ageMax" type="number" min={13} max={100} defaultValue={t?.ageMax ?? 65} className={`${fieldClass} h-11 tabular`} /></Field>
              <Field label="Gender">
                <div className="flex flex-wrap gap-2">
                  {(["female", "male"] as const).map((g) => (
                    <label key={g} className={chipClass}>
                      <input type="checkbox" name="genders" value={g} defaultChecked={(t?.genders ?? []).includes(g)} className="sr-only" />
                      {g === "female" ? "Women" : "Men"}
                    </label>
                  ))}
                  <span className="self-center text-[12px] text-muted">None selected = everyone</span>
                </div>
              </Field>
            </div>
            <Field label="Interests" hint="Comma-separated">
              <input name="interests" defaultValue={(t?.interests ?? []).join(", ")} placeholder="skincare, running, coffee" className={`${fieldClass} h-11`} />
            </Field>
            <Field label="Placements">
              <div className="flex flex-wrap gap-2">
                {placements.map((p) => (
                  <label key={p.id} className={chipClass}>
                    <input type="checkbox" name="placements" value={p.id} defaultChecked={chosen.has(p.id)} className="sr-only" />
                    {p.label} <span className="ml-1 text-[11px] opacity-70">{p.ratio}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="When it publishes">
              <div className="flex flex-wrap gap-2">
                {(["paused", "active"] as const).map((m) => (
                  <label key={m} className={chipClass}>
                    <input type="radio" name="mode" value={m} defaultChecked={(c.raw.publishMode ?? "paused") === m} className="sr-only" />
                    {m === "paused" ? "Start paused" : "Start active"}
                  </label>
                ))}
              </div>
            </Field>
          </>
        ) : (
          <p className="m-0 text-[12px] text-muted">
            Objective, audience and placements are fixed once a campaign is on the platform — start a new campaign to change them.
          </p>
        )}

        <div className="flex items-center gap-3">
          <PendingButton className="btn btn-dark h-11" pendingLabel={published ? "Updating on the platform…" : "Saving…"}>
            Save changes <span aria-hidden="true">↗︎</span>
          </PendingButton>
        </div>
      </form>
    </details>
  );
}
