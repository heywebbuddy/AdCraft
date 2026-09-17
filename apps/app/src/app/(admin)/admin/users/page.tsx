import Link from "next/link";
import { PageHeader, CollectionSearch } from "@/components/workspace-ui";
import { PendingButton } from "@/components/pending-button";
import { requireAdmin } from "@/server/admin";
import { listUsers } from "@/server/admin-data";
import { togglePlatformAdmin } from "@/server/admin-actions";
import { Chip, Empty, Flash, Panel, Table, ago, fmtDate, int } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  const admin = await requireAdmin();
  const { q = "", ok, error } = await searchParams;
  const users = await listUsers(q);
  const admins = users.filter((u) => u.isPlatformAdmin).length;
  const back = `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader title="Users" description="Everyone who has signed in, with their workspaces and roles. Platform admins can open this panel; grant it sparingly." />

      <Flash
        ok={ok}
        error={error}
        messages={{
          "ok:granted": "Platform admin granted. It takes effect on their next request.",
          "ok:revoked": "Platform admin revoked.",
          "error:self": "You can’t change your own admin flag. Ask another admin.",
        }}
      />

      <div className="collection-toolbar">
        <CollectionSearch action="/admin/users" query={q} placeholder="Search by email or name" />
        <span className="collection-count">
          {int(users.length)} shown · {int(admins)} platform admin{admins === 1 ? "" : "s"}
        </span>
      </div>

      <Panel title={q ? `Matching “${q}”` : "All users"} eyebrow="People" note="Last sign-in is not tracked with JWT sessions">
        {users.length === 0 ? (
          <Empty title={q ? "Nobody matches that search" : "No users yet"}>{q ? "Try a shorter fragment of the email." : "Users appear as soon as someone signs in."}</Empty>
        ) : (
          <Table minWidth={760}>
            <thead>
              <tr>
                <th>User</th>
                <th>Workspaces</th>
                <th>Signed up</th>
                <th>Platform admin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="cell-primary">
                      <strong>
                        {u.name ?? u.email ?? u.id} {u.id === admin.userId ? <span className="muted">(you)</span> : null}
                      </strong>
                      <small>{u.email}</small>
                    </span>
                  </td>
                  <td>
                    {u.orgs.length === 0 ? (
                      <span className="muted">No workspace yet</span>
                    ) : (
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {u.orgs.map((o) => (
                          <Link key={o.id} href={`/admin/orgs/${o.id}`} className="chip plain" title={o.role}>
                            {o.name} · {o.role}
                          </Link>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="muted" title={fmtDate(u.createdAt)}>
                    {ago(u.createdAt)}
                  </td>
                  <td>{u.isPlatformAdmin ? <Chip tone="ink" plain>Admin</Chip> : <span className="muted">—</span>}</td>
                  <td>
                    <div className="row-actions">
                      {u.id === admin.userId ? null : (
                        <form action={togglePlatformAdmin}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="back" value={back} />
                          <PendingButton className={`btn btn-outline btn-sm ${u.isPlatformAdmin ? "btn-danger" : ""}`} pendingLabel="…">
                            {u.isPlatformAdmin ? "Revoke admin" : "Make admin"}
                          </PendingButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
