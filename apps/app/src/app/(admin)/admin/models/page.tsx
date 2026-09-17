import { PageHeader } from "@/components/workspace-ui";
import { PendingButton } from "@/components/pending-button";
import { requireAdmin } from "@/server/admin";
import { loadModels, USD_PER_CREDIT } from "@/server/admin-data";
import { saveModelOverrides } from "@/server/admin-actions";
import { Chip, Empty, Flash, Panel, Table, ago, int, money, pct } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const unit: Record<string, string> = { image: "per image", video: "per second", text: "per call", presenter: "per second", voice: "per call", music: "per call" };

export default async function AdminModelsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requireAdmin();
  const { ok } = await searchParams;
  const { registry, unregistered } = await loadModels();
  const overridden = registry.filter((m) => Object.keys(m.override).length).length;

  return (
    <>
      <PageHeader
        title="Models & pricing"
        description="The registry from @adcraft/ai with the credits we charge per unit, next to what each call actually cost us. Overrides are stored in platform settings and read through getModelOverrides()."
      />

      <Flash ok={ok} messages={{ "ok:1": "Overrides saved." }} />

      <form action={saveModelOverrides}>
        <Panel title="Registry" eyebrow={`${registry.length} models`} note={overridden ? `${overridden} overridden` : "no overrides"}>
          <Table minWidth={820}>
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th className="num">Registry credits</th>
                <th className="num">Override</th>
                <th className="num">Measured avg cost</th>
                <th className="num">Avg credits / call</th>
                <th className="num">Margin</th>
                <th className="num">Calls</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {registry.map((m) => {
                const avgCost = m.measured?.avgCost ?? null;
                const avgCredits = m.measured?.avgCredits ?? null;
                const rev = avgCredits != null ? avgCredits * USD_PER_CREDIT : null;
                const margin = rev != null && rev > 0 && avgCost != null ? (rev - avgCost) / rev : null;
                return (
                  <tr key={m.id} style={m.enabled ? undefined : { opacity: 0.55 }}>
                    <td>
                      <span className="cell-primary">
                        <strong>
                          {m.label} {m.default ? <Chip plain>default</Chip> : null}
                        </strong>
                        <small>
                          <span className="model-kind">{m.kind}</span> · {m.id}
                          {m.notes ? ` · ${m.notes}` : ""}
                        </small>
                      </span>
                    </td>
                    <td className="muted">{m.provider}</td>
                    <td className="num">
                      {m.creditsPerUnit} <span className="muted">{unit[m.kind] ?? ""}</span>
                    </td>
                    <td className="num">
                      <input className="admin-inline-input" type="number" step="0.5" min="0" name={`credits:${m.id}`} defaultValue={m.override.creditsPerUnit ?? ""} placeholder={String(m.creditsPerUnit)} aria-label={`Credits per unit override for ${m.label}`} />
                    </td>
                    <td className="num">{avgCost != null ? money(avgCost, 4) : <span className="muted">—</span>}</td>
                    <td className="num">{avgCredits != null ? avgCredits.toFixed(1) : <span className="muted">—</span>}</td>
                    <td className="num">{pct(margin, 0)}</td>
                    <td className="num">
                      {m.measured ? (
                        <span className="cell-primary" style={{ alignItems: "flex-end" }}>
                          <strong>
                            {int(m.measured.n)}
                            {m.measured.failed ? <span style={{ color: "var(--bad)", fontWeight: 400 }}> · {m.measured.failed} failed</span> : null}
                          </strong>
                          <small>{m.measured.lastUsed ? ago(m.measured.lastUsed) : "never"}</small>
                        </span>
                      ) : (
                        <span className="muted">never</span>
                      )}
                    </td>
                    <td>
                      <input type="checkbox" name={`enabled:${m.id}`} defaultChecked={m.enabled} aria-label={`${m.label} enabled`} style={{ accentColor: "var(--ink)", width: 15, height: 15 }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="admin-panel-body" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <p>Leave an override blank to use the registry value. Disabled models stay in the registry but pickers can hide them once they read overrides.</p>
            <PendingButton className="btn btn-dark" pendingLabel="Saving…">
              Save overrides
            </PendingButton>
          </div>
        </Panel>
      </form>

      <Panel title="Seen in events but not in the registry" eyebrow="Unregistered" note="Cutouts, sample models and one-offs">
        {unregistered.length === 0 ? (
          <Empty title="Every model in the events table is registered" />
        ) : (
          <Table minWidth={520}>
            <thead>
              <tr>
                <th>Model id</th>
                <th className="num">Calls</th>
                <th className="num">Failed</th>
                <th className="num">Avg cost</th>
                <th>Last used</th>
              </tr>
            </thead>
            <tbody>
              {unregistered.map((u) => (
                <tr key={u.model || "(blank)"}>
                  <td>
                    <code>{u.model || "(blank)"}</code>
                  </td>
                  <td className="num">{int(u.n)}</td>
                  <td className="num">{int(u.failed)}</td>
                  <td className="num">{u.avgCost != null ? money(u.avgCost, 4) : "—"}</td>
                  <td className="muted">{u.lastUsed ? ago(u.lastUsed) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
