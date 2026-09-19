import { PageHeader } from "@/components/workspace-ui";
import { SettingsNav } from "@/components/settings-nav";
import { requireOrg } from "@/server/org";
import { guardrailStatus } from "@/server/guardrails";
import { saveGuardrails } from "@/server/guardrail-actions";

export const dynamic = "force-dynamic";

const inputClass = "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink disabled:opacity-60";

/**
 * Settings → Guardrails: the limits that keep a workspace from surprising itself — spend
 * approval, monthly credit cap, finish emails — plus this month's usage against the
 * platform's budget.
 */
export default async function GuardrailsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const ctx = await requireOrg();
  const { ok } = await searchParams;
  const g = await guardrailStatus(ctx.org.id);
  const owner = ctx.role === "owner";
  const spend = g.org.spendApprovalAbove === undefined ? g.platform.spendApprovalAbove : g.org.spendApprovalAbove;
  return (
    <>
      <PageHeader title="Guardrails" description="Limits that keep publishing and generation predictable for everyone in the workspace." />
      <SettingsNav active="guardrails" role={ctx.role} />
      <div className="grid max-w-[980px] gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <form action={saveGuardrails} className="panel flex flex-col gap-6 p-5">
          {ok ? <p className="m-0 text-[13px] text-[#3f7a55]">Saved.</p> : null}
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <label className="field-label" htmlFor="spendApprovalAbove">Owner approval for daily budgets above</label>
            <div className="flex items-center gap-3">
              <input id="spendApprovalAbove" name="spendApprovalAbove" type="number" min={0} step={1} defaultValue={spend ?? ""} placeholder={g.platform.spendApprovalAbove === null ? "off" : String(g.platform.spendApprovalAbove)} className={`${inputClass} max-w-[160px] tabular`} disabled={!owner} />
              <span className="text-[12px] text-muted">per day, in the account currency. Editors publish above this as paused; an owner switches it on. Leave empty for the platform default ({g.platform.spendApprovalAbove ?? "off"}); enter 0 to turn the rule off.</span>
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <label className="field-label" htmlFor="monthlyCreditCap">Monthly credit limit</label>
            <div className="flex items-center gap-3">
              <input id="monthlyCreditCap" name="monthlyCreditCap" type="number" min={0} step={1} defaultValue={g.org.monthlyCreditCap ?? ""} placeholder="no limit" className={`${inputClass} max-w-[160px] tabular`} disabled={!owner} />
              <span className="text-[12px] text-muted">Generation stops for the month once this many credits are spent. {g.month.credits} used so far this month.</span>
            </div>
          </fieldset>
          <label className="flex items-start gap-3 text-[13px]">
            <input type="checkbox" name="notifyOnFinish" defaultChecked={g.org.notifyOnFinish !== false} disabled={!owner} className="mt-1 accent-[#e65c32]" />
            <span><strong className="font-semibold">Email owners and editors when long jobs finish</strong><br /><span className="text-muted">Videos, character ads, characters, looks and digital twins — including failures with the reason.</span></span>
          </label>
          <label className="flex items-start gap-3 text-[13px]">
            <input type="checkbox" name="approvalBeforePublish" defaultChecked={g.org.approvalBeforePublish === true} disabled={!owner} className="mt-1 accent-[#e65c32]" />
            <span><strong className="font-semibold">Require an approved review before an ad can be added to a campaign</strong><br /><span className="text-muted">Drafts and ads with changes requested are hidden from the campaign builder.</span></span>
          </label>
          {owner ? <button className="btn btn-dark h-11 self-start">Save guardrails</button> : <p className="m-0 text-[12px] text-muted">Only owners can change guardrails.</p>}
        </form>
        <aside className="flex flex-col gap-4">
          <section className="panel flex flex-col gap-2 p-5">
            <span className="eyebrow">This month</span>
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-2 text-[13px]">
              <dt className="text-muted">Provider spend</dt><dd className="tabular m-0 font-semibold">${g.month.costUsd.toFixed(2)}{g.platform.monthlyCostCapUsd !== null ? <span className="font-normal text-muted"> / ${g.platform.monthlyCostCapUsd}</span> : null}</dd>
              <dt className="text-muted">Credits used</dt><dd className="tabular m-0 font-semibold">{g.month.credits}{g.org.monthlyCreditCap != null ? <span className="font-normal text-muted"> / {g.org.monthlyCreditCap}</span> : null}</dd>
            </dl>
            {g.platform.monthlyCostCapUsd !== null ? <div className="h-1.5 overflow-hidden rounded-full bg-well"><div className="h-full bg-[#7c8868]" style={{ width: `${Math.min(100, (g.month.costUsd / g.platform.monthlyCostCapUsd) * 100)}%` }} /></div> : null}
            <p className="m-0 text-[12px] text-muted">The platform budget protects against runaway costs; it resets on the 1st. Ask support to raise it.</p>
          </section>
          <section className="panel flex flex-col gap-2 p-5 text-[12px] text-muted">
            <span className="eyebrow">Also in force</span>
            <p className="m-0">Custom HeyGen voices: up to {g.platform.heygenVoicesPerWorkspace} per workspace (clones, designed voices and twin voices).</p>
            <p className="m-0">Copy is checked for medical, financial, superlative and personal-attribute claims before publishing; hard failures block, soft ones are shown.</p>
            <p className="m-0">Generation starts are rate-limited per workspace.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
