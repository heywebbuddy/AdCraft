import { PageHeader } from "@/components/workspace-ui";
import { redirect } from "next/navigation";
import { requireOrg } from "@/server/org";
import { listAudit } from "@/server/audit";
import { SettingsNav } from "@/components/settings-nav";

export const dynamic = "force-dynamic";

function describe(action: string, meta: Record<string, unknown>) {
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  switch (action) {
    case "member.invited":
      return `Invited ${s("email")} as ${s("role")}`;
    case "member.invite_revoked":
      return `Revoked the invite for ${s("email")}`;
    case "member.joined":
      return `${s("email") ?? "Someone"} joined as ${s("role")}`;
    case "member.role_changed":
      return `Changed a member from ${s("from")} to ${s("to")}`;
    case "member.removed":
      return `Removed a ${s("role")}`;
    case "comment.added":
      return meta.via === "share_link" ? `${s("author")} (client) commented via a share link` : "Added a comment";
    case "comment.resolved":
      return "Resolved a comment";
    case "approval.requested":
      return "Requested approval";
    case "approval.approved":
      return meta.via === "share_link" ? `${s("decidedBy")} (client) approved via a share link` : "Approved";
    case "approval.changes_requested":
      return meta.via === "share_link" ? `${s("decidedBy")} (client) requested changes via a share link` : "Requested changes";
    case "share_link.created":
      return `Created a ${s("kind")} share link${meta.allowApprove ? " (can approve)" : ""}`;
    case "share_link.revoked":
      return "Revoked a share link";
    case "template.created":
      return `Saved template “${s("name")}”${meta.isShared ? " (shared)" : ""}`;
    case "template.deleted":
      return `Deleted template “${s("name")}”`;
    case "bulk.generated":
      return `Queued ${String(meta.count ?? "")} creatives in bulk`;
    case "api_key.created":
      return `Created API key “${s("name")}” (${s("prefix")}…)`;
    case "api_key.revoked":
      return `Revoked API key “${s("name")}”`;
    case "webhook.created":
      return `Added webhook ${s("url")}`;
    case "webhook.deleted":
      return `Removed webhook ${s("url")}`;
    case "privacy.deletion_requested":
      return `Requested deletion of the workspace${s("reason") ? ` — ${s("reason")}` : ""}`;
    default:
      return action;
  }
}

export default async function AuditPage() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") redirect("/settings");
  const entries = await listAudit(ctx.org.id, 50);

  return (
    <>
      <PageHeader title="Audit log" description="Track workspace activity and review changes made by your team."/>

      <SettingsNav active="audit" role={ctx.role} />

      <section className="panel max-w-[900px] overflow-hidden">
        {entries.length === 0 ? (
          <p className="m-0 px-5 py-6 text-[13px] text-muted">Nothing yet. Invites, approvals, share links, templates, API keys and deletion requests all land here.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3 text-[13px]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">
                  {(e.actor?.name ?? e.actor?.email ?? "·").slice(0, 1).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span>
                    <span className="font-semibold">{e.actor?.name ?? e.actor?.email ?? "External reviewer"}</span> {describe(e.action, e.meta)}
                  </span>
                  <span className="truncate text-[11px] text-muted">
                    {e.action} · {e.targetType}
                    {e.targetId ? ` ${e.targetId.slice(0, 8)}` : ""}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[11px] text-muted">
                  {e.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
