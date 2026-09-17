import Link from "next/link";
import { PageHeader, CollectionSearch } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { listOrgs } from "@/server/admin-data";
import { PLANS, type PlanId } from "@/server/billing";
import { Chip, Empty, Flash, Panel, Table, ago, fmtDate, int } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; error?: string }> }) {
  await requireAdmin();
  const { q = "", status = "all", error } = await searchParams;
  const st = status === "active" || status === "suspended" ? status : "all";
  const orgs = await listOrgs(q, st);
  const suspended = orgs.filter((o) => o.suspendedAt).length;

  return (
    <>
      <PageHeader title="Organisations" description="Every customer workspace: plan, people, credits and when they were last here. Open one to adjust credits, change plan, suspend or view as support." />

      <Flash error={error} messages={{ "error:missing": "That organisation no longer exists." }} />

      <div className="collection-toolbar">
        <CollectionSearch action="/admin/orgs" query={q} placeholder="Search by name or slug" hidden={{ status: st === "all" ? "" : st }} />
        <nav className="workspace-tabs" aria-label="Status filter" style={{ borderBottom: 0 }}>
          {(["all", "active", "suspended"] as const).map((s) => (
            <Link key={s} href={`/admin/orgs?${new URLSearchParams({ ...(q ? { q } : {}), ...(s === "all" ? {} : { status: s }) })}`} className={st === s ? "active" : ""} style={{ paddingBottom: 6 }}>
              {s === "all" ? "All" : s === "active" ? "Active" : "Suspended"}
            </Link>
          ))}
        </nav>
      </div>

      <Panel title={`${int(orgs.length)} organisation${orgs.length === 1 ? "" : "s"}`} eyebrow={q ? `Matching “${q}”` : "All workspaces"} note={suspended ? `${suspended} suspended` : undefined}>
        {orgs.length === 0 ? (
          <Empty title={q ? "No organisation matches that search" : "No organisations yet"}>{q ? "Try part of the name or the slug." : "Workspaces appear here as soon as someone finishes onboarding."}</Empty>
        ) : (
          <Table minWidth={860}>
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Plan</th>
                <th className="num">Members</th>
                <th className="num">Credits</th>
                <th className="num">Creatives</th>
                <th>Last activity</th>
                <th>Created</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orgs/${o.id}`} className="row-link cell-primary">
                      <strong>{o.name}</strong>
                      <small>{o.slug}</small>
                    </Link>
                  </td>
                  <td>
                    {o.plan && o.plan in PLANS ? (
                      <span>
                        {PLANS[o.plan as PlanId].name}
                        {o.planStatus && o.planStatus !== "active" ? <span className="muted"> · {o.planStatus}</span> : null}
                      </span>
                    ) : (
                      <span className="muted">Trial</span>
                    )}
                  </td>
                  <td className="num">{int(o.members)}</td>
                  <td className="num">{int(o.credits)}</td>
                  <td className="num">{int(o.creatives)}</td>
                  <td className="muted" title={o.lastActivity ? fmtDate(o.lastActivity) : undefined}>
                    {o.lastActivity ? ago(o.lastActivity) : "—"}
                  </td>
                  <td className="muted">{fmtDate(o.createdAt, false)}</td>
                  <td>{o.suspendedAt ? <Chip tone="bad">Suspended</Chip> : <Chip tone="good">Active</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
