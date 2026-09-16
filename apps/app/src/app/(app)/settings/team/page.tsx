import { PageHeader } from "@/components/workspace-ui";
import { requireOrg } from "@/server/org";
import { listMembers, listPendingInvites } from "@/server/team-data";
import { changeMemberRole, inviteMember, removeMember, revokeInvite } from "@/server/team";
import { baseUrl } from "@/server/url";
import { SettingsNav } from "@/components/settings-nav";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

const inputClass = "h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[15px] outline-none focus:border-ink";
const selectClass = "h-9 rounded-[7px] border border-line bg-white px-2 text-[12px] font-medium outline-none focus:border-ink";

const errors: Record<string, string> = {
  owner: "Only workspace owners can manage the team.",
  email: "That email address doesn’t look right.",
  role: "Pick a valid role.",
  member: "That member is no longer in the workspace.",
  last_owner: "A workspace needs at least one owner.",
  self: "You can’t remove yourself. Ask another owner.",
};

const roleBlurb: Record<string, string> = {
  owner: "Everything, including billing, team and API keys.",
  editor: "Create, edit, request and approve creative.",
  viewer: "Look and comment. Ideal for clients who review in-app.",
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; invite?: string; email?: string }>;
}) {
  const ctx = await requireOrg();
  const { ok, error, invite: newInviteId, email: sentTo } = await searchParams;
  const [members, invites, origin] = await Promise.all([listMembers(ctx.org.id), listPendingInvites(ctx.org.id), baseUrl()]);
  const isOwner = ctx.role === "owner";
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const fresh = newInviteId ? invites.find((i) => i.id === newInviteId) : null;

  return (
    <>
      <PageHeader title="Team members" description="Manage the people and permissions in your workspace."/>

      <SettingsNav active="team" role={ctx.role} />

      {error ? <p className="m-0 text-[13px] text-orange">{errors[error] ?? "Something went wrong."}</p> : null}
      {ok === "sent" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Invite emailed to {sentTo}. It expires in 7 days.</p> : null}
      {ok === "role" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Role updated.</p> : null}
      {ok === "removed" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Member removed.</p> : null}
      {fresh ? (
        <section className="panel flex flex-col gap-3 border-ink p-5">
          <span className="eyebrow">Invite link for {fresh.email}</span>
          <p className="m-0 text-[13px] text-muted">
            No email provider is configured, so send this link yourself. It signs them into this workspace as {fresh.role} and expires in 7 days.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[7px] border border-line bg-paper px-3 py-2 text-[12px]">
              {origin}/invite/{fresh.token}
            </code>
            <CopyButton text={`${origin}/invite/${fresh.token}`} label="Copy link" />
          </div>
        </section>
      ) : null}

      <div className="grid max-w-[1000px] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Members</span>
            <span className="text-[11px] text-muted">{isOwner ? "Owners can change roles" : "Only owners can change roles"}</span>
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {members.map((m) => {
              const isMe = m.userId === ctx.viewer.userId;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 text-[13px]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
                    {(m.name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-semibold">
                      {m.name ?? m.email} {isMe ? <span className="font-normal text-muted">(you)</span> : null}
                    </span>
                    <span className="truncate text-[12px] text-muted">{m.email}</span>
                  </span>
                  {isOwner ? (
                    <form action={changeMemberRole} className="flex items-center gap-2">
                      <input type="hidden" name="membershipId" value={m.id} />
                      <select name="role" defaultValue={m.role} className={selectClass} aria-label={`Role for ${m.name ?? m.email}`}>
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button className="btn btn-outline h-9 px-3 text-[12px]">Save</button>
                    </form>
                  ) : (
                    <span className="rounded-full border border-line px-2 py-px text-[10px] font-semibold uppercase tracking-[.8px] text-muted">{m.role}</span>
                  )}
                  {isOwner && !isMe ? (
                    <form action={removeMember}>
                      <input type="hidden" name="membershipId" value={m.id} />
                      <button className="text-[12px] text-muted hover:text-[#b4382a]">Remove</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {invites.length ? (
            <>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="eyebrow">Pending invites</span>
                <span className="text-[11px] text-muted">{invites.length}</span>
              </div>
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-[13px]">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-[#d4d3ca] text-[12px] text-muted">
                      {i.email.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-semibold">{i.email}</span>
                      <span className="text-[12px] text-muted">
                        {i.role} · expires {i.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                    {isOwner ? <CopyButton text={`${origin}/invite/${i.token}`} label="Copy link" /> : null}
                    {isOwner ? (
                      <form action={revokeInvite}>
                        <input type="hidden" name="inviteId" value={i.id} />
                        <button className="text-[12px] text-muted hover:text-[#b4382a]">Revoke</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="panel flex flex-col gap-4 p-5">
          <span className="eyebrow">Invite someone</span>
          {isOwner ? (
            <form action={inviteMember} className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Work email
                <input name="email" type="email" required placeholder="them@brand.com" className={inputClass} />
              </label>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-2 text-sm font-medium">Role</legend>
                {(["editor", "viewer", "owner"] as const).map((r) => (
                  <label key={r} className="flex cursor-pointer items-start gap-2.5 rounded-[7px] border border-line px-3 py-2.5 text-[13px] has-[:checked]:border-ink">
                    <input type="radio" name="role" value={r} defaultChecked={r === "editor"} className="mt-1 accent-[#e65c32]" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold capitalize">{r}</span>
                      <span className="text-[12px] text-muted">{roleBlurb[r]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button className="btn btn-orange h-11 justify-between">
                {emailConfigured ? "Send invite" : "Create invite link"} <span aria-hidden="true">↗</span>
              </button>
              {!emailConfigured ? (
                <p className="m-0 text-[12px] text-muted">
                  Set <code className="rounded bg-paper px-1">RESEND_API_KEY</code> to email invites automatically. Until then you get a link to share.
                </p>
              ) : null}
            </form>
          ) : (
            <p className="m-0 text-[13px] text-muted">Only owners can invite people. Ask {members.find((m) => m.role === "owner")?.name ?? "an owner"}.</p>
          )}
        </section>
      </div>
    </>
  );
}
