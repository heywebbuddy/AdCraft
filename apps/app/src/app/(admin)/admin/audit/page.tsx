import Link from "next/link";
import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { listPlatformAudit, orgNameMap } from "@/server/admin-data";
import { Chip, Empty, Panel, Table, ago, fmtDate, int, shortId } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type Search = { action?: string; org?: string; actor?: string; scope?: string };

function summarise(action: string, meta: Record<string, unknown>) {
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  switch (action) {
    case "admin.view_as":
      return `Opened ${s("orgName") ?? "the workspace"} as support`;
    case "admin.view_as_exit":
      return "Left support mode";
    case "admin.credits_adjusted":
      return `${Number(meta.delta) > 0 ? "+" : ""}${String(meta.delta)} credits · ${s("reason") ?? ""}`;
    case "admin.plan_changed":
      return `Plan ${s("from") ?? "trial"} → ${s("to")}${meta.credited ? ` · +${String(meta.credited)} credits` : ""}`;
    case "admin.org_suspended":
      return `Suspended${s("reason") ? ` · ${s("reason")}` : ""}`;
    case "admin.org_reinstated":
      return "Reinstated";
    case "admin.note_added":
      return "Added a support note";
    case "admin.member_removed":
      return `Removed a ${s("role") ?? "member"}`;
    case "admin.admin_granted":
      return `Granted platform admin to ${s("email")}`;
    case "admin.admin_revoked":
      return `Revoked platform admin from ${s("email")}`;
    case "admin.generation_retried":
      return `Retried via ${s("job")}`;
    case "admin.generation_marked":
      return `Marked ${s("from")} → ${s("to")}`;
    case "admin.models_updated":
      return `Updated model overrides (${Object.keys((meta.overrides as object) ?? {}).length})`;
    case "admin.settings_updated":
      return `Signups ${meta.signupsEnabled ? "on" : "off"} · trial ${String(meta.trialCredits)} credits`;
    default: {
      const bits = Object.entries(meta)
        .filter(([, v]) => typeof v === "string" || typeof v === "number")
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${String(v)}`);
      return bits.join(" · ");
    }
  }
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const scope = sp.scope === "admin" || sp.scope === "workspace" ? sp.scope : "all";
  const [data, orgs] = await Promise.all([listPlatformAudit({ action: sp.action, org: sp.org, actor: sp.actor, scope }), orgNameMap()]);
  const active = [sp.action, sp.org, sp.actor, scope !== "all" ? scope : ""].filter(Boolean).length;

  return (
    <>
      <PageHeader title="Audit log" description="Every audited action across every workspace, plus platform-level admin actions (no organisation). Read-only." />

      <form method="get" action="/admin/audit" className="admin-filters">
        <label>
          Scope
          <select name="scope" defaultValue={scope}>
            <option value="all">Everything</option>
            <option value="admin">Admin actions</option>
            <option value="workspace">Workspace activity</option>
          </select>
        </label>
        <label>
          Action
          <select name="action" defaultValue={sp.action ?? ""}>
            <option value="">All</option>
            {data.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Organisation
          <select name="org" defaultValue={sp.org ?? ""}>
            <option value="">All</option>
            {[...orgs.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actor
          <select name="actor" defaultValue={sp.actor ?? ""}>
            <option value="">Anyone</option>
            {data.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.email}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-filter-actions">
          <button className="btn btn-dark">Apply</button>
          {active ? (
            <Link href="/admin/audit" className="link-quiet">
              Clear {active}
            </Link>
          ) : null}
        </div>
      </form>

      <Panel title="Entries" eyebrow="Newest first" note={`showing ${int(data.rows.length)}`}>
        {data.rows.length === 0 ? (
          <Empty title="Nothing audited matches">{active ? "Loosen a filter." : "Invites, approvals, share links, API keys and every admin action land here."}</Empty>
        ) : (
          <Table minWidth={900}>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Organisation</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const isAdmin = r.action.startsWith("admin.");
                return (
                  <tr key={r.id}>
                    <td className="muted" title={fmtDate(r.createdAt)}>
                      {ago(r.createdAt)}
                    </td>
                    <td>
                      <span className="cell-primary">
                        <strong>{r.actorName ?? r.actorEmail ?? "External"}</strong>
                        {r.actorName && r.actorEmail ? <small>{r.actorEmail}</small> : null}
                      </span>
                    </td>
                    <td>
                      <Chip tone={isAdmin ? "ink" : "neutral"} plain code>
                        {r.action}
                      </Chip>
                    </td>
                    <td>{summarise(r.action, r.meta ?? {})}</td>
                    <td>
                      {r.orgId ? (
                        <Link href={`/admin/orgs/${r.orgId}`} className="link-quiet">
                          {r.orgName ?? shortId(r.orgId)}
                        </Link>
                      ) : (
                        <span className="muted">platform</span>
                      )}
                    </td>
                    <td className="muted">
                      {r.targetType}
                      {r.targetId ? (
                        <>
                          {" "}
                          <code>{shortId(r.targetId)}</code>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
