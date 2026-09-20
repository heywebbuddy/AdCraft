import { inArray } from "drizzle-orm";
import { db, users } from "@adcraft/db";
import { PageHeader } from "@/components/workspace-ui";
import { PendingButton } from "@/components/pending-button";
import { requireAdmin } from "@/server/admin";
import { getPlatformSettings, settingsMeta, type PlanFeatures } from "@/server/platform-settings";
import { savePlatformSettings } from "@/server/admin-actions";
import { PLANS, type PlanId } from "@/server/billing";
import { Flash, Panel, ago } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const FEATURES: Array<[keyof PlanFeatures, string]> = [
  ["video", "Product video"],
  ["ugc", "UGC presenter video"],
  ["publishing", "Publishing to ad platforms"],
];

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const [s, meta] = await Promise.all([getPlatformSettings(), settingsMeta()]);
  const editorIds = [...new Set(Object.values(meta).map((m) => m.updatedBy).filter((x): x is string => Boolean(x)))];
  const editors = editorIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, editorIds)) : [];
  const who = (key: string) => {
    const m = meta[key];
    if (!m) return "default";
    const u = editors.find((e) => e.id === m.updatedBy);
    return `${u?.name ?? u?.email ?? "an admin"} · ${ago(m.updatedAt)}`;
  };

  return (
    <>
      <PageHeader title="Settings & flags" description="Platform-wide switches stored in platform_settings. Everything has a safe default; nothing here restarts anything." />

      <Flash ok={ok} error={error} messages={{ "ok:1": "Settings saved.", "error:trial": "Trial credits must be a whole number between 0 and 100,000." }} />

      <form action={savePlatformSettings} className="admin-grid-2">
        <div className="admin-stack">
          <Panel title="Maintenance banner" eyebrow="Announcements" note={who("maintenanceBanner")}>
            <div className="admin-panel-body admin-form">
              <label>
                <span>
                  Message <small>empty hides the banner</small>
                </span>
                <textarea name="maintenanceBanner" defaultValue={s.maintenanceBanner} maxLength={300} placeholder="Video generation is slower than usual while we upgrade the render farm." />
              </label>
              <p>Shown as a dark strip at the top of every customer workspace within a minute of saving.</p>
            </div>
          </Panel>

          <Panel title="Signups & trial" eyebrow="Growth" note={who("trialCredits")}>
            <div className="admin-panel-body admin-form">
              <label className="check">
                <input type="checkbox" name="signupsEnabled" defaultChecked={s.signupsEnabled} />
                New workspaces can be created
              </label>
              <label>
                <span>
                  Trial credits <small>granted at onboarding · default 10</small>
                </span>
                <input type="number" name="trialCredits" min={0} max={100000} step={1} defaultValue={s.trialCredits} />
              </label>
              <p>Sign-in stays open when signups are off; only the “create a workspace” step is refused.</p>
            </div>
          </Panel>
        </div>

        <div className="admin-stack">
          <Panel title="Guardrail defaults" eyebrow="Safety" note={who("guardrails")}>
            <div className="admin-panel-body admin-form">
              <label><span>Monthly provider budget per workspace <small>USD · blank = off</small></span><input type="number" name="g:monthlyCostCapUsd" min={0} step={1} defaultValue={s.guardrails.monthlyCostCapUsd ?? ""} /></label>
              <label><span>Owner approval above daily budget <small>major units · blank = off</small></span><input type="number" name="g:spendApprovalAbove" min={0} step={1} defaultValue={s.guardrails.spendApprovalAbove ?? ""} /></label>
              <label><span>HeyGen custom voices per workspace <small>account has ~10</small></span><input type="number" name="g:heygenVoicesPerWorkspace" min={0} max={10} step={1} defaultValue={s.guardrails.heygenVoicesPerWorkspace} /></label>
              <label><span>Actions per minute per workspace <small>generation starts use a quarter of this</small></span><input type="number" name="g:actionsPerMinute" min={10} max={10000} step={10} defaultValue={s.guardrails.actionsPerMinute} /></label>
              <p>Workspaces can lower the spend-approval threshold and set their own credit cap under Settings → Guardrails; they cannot raise the provider budget.</p>
            </div>
          </Panel>

          <Panel title="Plan features" eyebrow="Flags" note={who("planFeatures")}>
            <div className="admin-panel-body admin-form">
              {(Object.keys(PLANS) as PlanId[]).map((plan) => (
                <fieldset key={plan} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px 12px", margin: 0 }}>
                  <legend style={{ fontSize: 12, fontWeight: 600, padding: "0 6px" }}>{PLANS[plan].name}</legend>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {FEATURES.map(([key, label]) => (
                      <label key={key} className="check">
                        <input type="checkbox" name={`${plan}:${key}`} defaultChecked={s.planFeatures[plan][key]} />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <p>Turning a feature off hides its entry points for workspaces on that plan (trial follows Starter) and refuses new jobs of that kind.</p>
            </div>
          </Panel>

          <div className="admin-form-actions">
            <PendingButton className="btn btn-dark" pendingLabel="Saving…">
              Save settings
            </PendingButton>
          </div>
        </div>
      </form>
    </>
  );
}
