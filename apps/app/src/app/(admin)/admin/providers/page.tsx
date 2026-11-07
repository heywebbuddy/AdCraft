import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { loadProviders } from "@/server/admin-data";
import { Chip, Flash, Kpi, Kpis, ago, int } from "@/components/admin/ui";
import { PendingButton } from "@/components/pending-button";
import { saveProviderKeysAction } from "@/server/admin-actions";
import { isPlainKey } from "@/server/provider-keys";

export const dynamic = "force-dynamic";

const SOURCE_LABEL = { database: "saved here", environment: "from server environment", missing: "not set" } as const;

export default async function AdminProvidersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin();
  const { ok, error } = await searchParams;
  const providers = await loadProviders();
  const configured = providers.filter((p) => p.configured).length;
  const failing = providers.filter((p) => p.failed24h > 0).length;

  return (
    <>
      <PageHeader title="Providers" description="Add or change each integration's keys here, and see how it has behaved lately according to generation events. Keys are stored encrypted and take priority over the server's environment variables." />

      <Flash ok={ok} error={error} messages={{
        "ok:none": "Nothing changed.",
        "error:provider": "Unknown provider.",
        ...Object.fromEntries(providers.map((p) => [`ok:${p.id}`, `${p.name} saved.${["smtp", "resend", "google-auth"].includes(p.id) ? " Sign-in methods apply after the app restarts." : " It applies to the next request."}`])),
      }} />

      <Kpis label="Provider summary">
        <Kpi label="Configured" value={int(configured)} sub={`of ${providers.length}`} />
        <Kpi label="Failing · 24h" value={int(failing)} />
        <Kpi label="Calls · 24h" value={int(providers.reduce((n, p) => n + p.total24h, 0))} />
      </Kpis>

      <div className="admin-providers">
        {providers.map((p) => {
          const tone = !p.configured ? "neutral" : p.failed24h > 0 && p.failed24h >= p.total24h / 2 ? "bad" : p.failed24h > 0 ? "warn" : "good";
          const label = !p.configured ? "Not configured" : p.failed24h > 0 ? `${p.failed24h} failed · 24h` : p.eventKey ? "Healthy" : "Configured";
          return (
            <section key={p.id} className="panel admin-provider">
              <div className="admin-provider-head">
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.area}</small>
                </div>
                <Chip tone={tone}>{label}</Chip>
              </div>
              <form action={saveProviderKeysAction} className="admin-form provider-keys">
                <input type="hidden" name="provider" value={p.id} />
                {p.fields.map((f) => (
                  <label key={f.key}>
                    <span>
                      <code className={f.source === "missing" ? "missing" : ""}>{f.key}</code>{" "}
                      <small>
                        {SOURCE_LABEL[f.source]}
                        {f.hint ? ` · ${f.hint}` : ""}
                      </small>
                    </span>
                    <input
                      name={`key_${f.key}`}
                      type={isPlainKey(f.key) ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={f.source === "missing" ? "Paste value" : "Leave blank to keep"}
                    />
                    {f.source === "database" ? (
                      <span className="check">
                        <input type="checkbox" name={`clear_${f.key}`} /> <small>Remove the saved value</small>
                      </span>
                    ) : null}
                  </label>
                ))}
                <div className="admin-form-actions">
                  <PendingButton>Save</PendingButton>
                </div>
              </form>
              {p.eventKey ? (
                <dl>
                  <dt>Last success</dt>
                  <dd>{ago(p.lastSuccessAt)}</dd>
                  <dt>Last failure</dt>
                  <dd>{ago(p.lastFailureAt)}</dd>
                  <dt>Calls · 24h</dt>
                  <dd>
                    {int(p.total24h)}
                    {p.failed24h ? ` (${p.failed24h} failed)` : ""}
                  </dd>
                  {p.lastError ? (
                    <>
                      <dt>Last error</dt>
                      <dd title={p.lastError} style={{ color: "var(--bad)" }}>
                        {p.lastError}
                      </dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
              {p.note && !p.configured ? <small style={{ fontSize: 11, color: "var(--muted)" }}>{p.note}</small> : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
