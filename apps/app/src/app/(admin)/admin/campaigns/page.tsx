import Link from "next/link";
import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { loadCampaigns } from "@/server/admin-data";
import { Chip, Empty, Kpi, Kpis, Panel, Table, ago, fmtDate, int, money, statusTone } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  await requireAdmin();
  const { accounts, campaigns } = await loadCampaigns();
  const live = accounts.filter((a) => !a.sandbox).length;
  const expiring = accounts.filter((a) => a.tokenExpiresAt && a.tokenExpiresAt.getTime() - Date.now() < 7 * 86400e3).length;

  return (
    <>
      <PageHeader title="Campaigns" description="Ad accounts and campaigns across every workspace, with sandbox versus live and token expiry. Read-only in v1: changes happen in the customer's workspace." />

      <Kpis label="Distribution summary">
        <Kpi label="Ad accounts" value={int(accounts.length)} sub={`${int(live)} live · ${int(accounts.length - live)} sandbox`} />
        <Kpi label="Campaigns" value={int(campaigns.length)} sub={`${int(campaigns.filter((c) => c.status === "active").length)} active`} />
        <Kpi label="Tokens expiring · 7d" value={int(expiring)} />
        <Kpi label="Sync errors" value={int(accounts.filter((a) => a.status === "error" || a.status === "expired" || a.status === "revoked").length)} />
      </Kpis>

      <Panel title="Ad accounts" eyebrow="Connections" note={`${accounts.length}`}>
        {accounts.length === 0 ? (
          <Empty title="No ad accounts connected anywhere yet" />
        ) : (
          <Table minWidth={860}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Organisation</th>
                <th>Platform</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Token expires</th>
                <th>Last synced</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const soon = a.tokenExpiresAt && a.tokenExpiresAt.getTime() - Date.now() < 7 * 86400e3;
                return (
                  <tr key={a.id}>
                    <td>
                      <span className="cell-primary">
                        <strong>{a.name ?? a.externalId}</strong>
                        <small>
                          {a.externalId}
                          {a.brandName ? ` · ${a.brandName}` : ""}
                        </small>
                      </span>
                    </td>
                    <td>
                      <Link href={`/admin/orgs/${a.orgId}?tab=campaigns`} className="link-quiet">
                        {a.orgName}
                      </Link>
                    </td>
                    <td>{a.platform}</td>
                    <td>{a.sandbox ? <Chip plain>Sandbox</Chip> : <Chip tone="ink" plain>Live</Chip>}</td>
                    <td>
                      <Chip tone={statusTone(a.status)}>{a.status}</Chip>
                    </td>
                    <td className="muted" style={soon ? { color: "var(--warn)" } : undefined}>
                      {a.tokenExpiresAt ? fmtDate(a.tokenExpiresAt) : "—"}
                    </td>
                    <td className="muted">{a.lastSyncedAt ? ago(a.lastSyncedAt) : "never"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel title="Campaigns" eyebrow="Newest first" note={`${campaigns.length}`}>
        {campaigns.length === 0 ? (
          <Empty title="No campaigns yet" />
        ) : (
          <Table minWidth={860}>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Organisation</th>
                <th>Platform</th>
                <th>Mode</th>
                <th>Status</th>
                <th className="num">Daily budget</th>
                <th>Last synced</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="cell-primary">
                      <strong>{c.name}</strong>
                      <small>
                        {c.objective ?? "—"} · {c.accountName ?? c.externalId}
                      </small>
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/orgs/${c.orgId}?tab=campaigns`} className="link-quiet">
                      {c.orgName}
                    </Link>
                  </td>
                  <td>{c.platform}</td>
                  <td>{c.sandbox ? <Chip plain>Sandbox</Chip> : <Chip tone="ink" plain>Live</Chip>}</td>
                  <td>
                    <Chip tone={statusTone(c.status)}>{c.status}</Chip>
                  </td>
                  <td className="num">{c.dailyBudgetMinor != null ? money(c.dailyBudgetMinor / 100) : "—"}</td>
                  <td className="muted">{c.lastSyncedAt ? ago(c.lastSyncedAt) : "never"}</td>
                  <td className="muted">{fmtDate(c.createdAt, false)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
