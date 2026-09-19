import { PageHeader } from "@/components/workspace-ui";
import { eq } from "drizzle-orm";
import { db, memberships, users } from "@adcraft/db";
import { requireOrg } from "@/server/org";
import { updateOrgName } from "@/server/billing-actions";
import Link from "next/link";
import { SettingsNav } from "@/components/settings-nav";
import { ThemePicker } from "@/components/theme-picker";

export const dynamic = "force-dynamic";

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await requireOrg();
  const { ok } = await searchParams;
  const members = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, ctx.org.id));

  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Manage your workspace details and preferences."
      />

      <SettingsNav active="workspace" role={ctx.role} />

      <div className="grid max-w-[900px] gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-4 p-5">
          <span className="eyebrow">Workspace</span>
          {ok ? <p className="m-0 text-[13px] text-[#3f7a55]">Saved.</p> : null}
          <form action={updateOrgName} className="flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className="field-label">Name</span>
              <input
                name="name"
                defaultValue={ctx.org.name}
                className={inputClass}
                disabled={ctx.role !== "owner"}
              />
            </label>
            {ctx.role === "owner" ? (
              <button className="btn btn-dark h-11 self-start">Save</button>
            ) : (
              <p className="m-0 text-[12px] text-muted">
                Only owners can rename the workspace.
              </p>
            )}
          </form>
        </section>

        <section className="panel flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Members</span>
            <span className="text-[11px] text-muted">
              {members.length} in workspace
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 text-[13px]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">
                  {(m.name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.name ?? m.email}
                </span>
                <span className="rounded-full border border-line px-2 py-px text-[10px] font-semibold uppercase tracking-[.8px] text-muted">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/settings/team"
            className="text-[12px] font-semibold text-orange"
          >
            Invite people and manage roles ↗︎
          </Link>
        </section>

        <section className="panel flex flex-col gap-4 p-5 md:col-span-2">
          <span className="eyebrow">Appearance</span>
          <p className="m-0 text-[13px] text-muted">
            Light is the default for the studio and the site. Dark is optional, and it stays on this browser.
          </p>
          <ThemePicker />
        </section>
      </div>
    </>
  );
}
