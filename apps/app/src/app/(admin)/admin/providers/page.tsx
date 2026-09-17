import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { loadProviders } from "@/server/admin-data";
import { Chip, Kpi, Kpis, ago, int } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  await requireAdmin();
  const providers = await loadProviders();
  const configured = providers.filter((p) => p.configured).length;
  const failing = providers.filter((p) => p.failed24h > 0).length;

  return (
    <>
      <PageHeader title="Providers" description="Which integrations have credentials in this environment, and how each one has behaved lately according to generation events. Read-only." />

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
              <div className="env-list" aria-label="Environment variables">
                {p.env.map((k) => (
                  <code key={k} className={p.missing.includes(k) ? "missing" : ""}>
                    {k}
                  </code>
                ))}
              </div>
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
