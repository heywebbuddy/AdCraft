import { eq } from "drizzle-orm";
import { db, memberships, users } from "@adcraft/db";
import { requireOrg } from "@/server/org";
import { updateOrgName } from "@/server/billing-actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const inputClass = "h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[15px] outline-none focus:border-ink";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const ctx = await requireOrg();
  const { ok } = await searchParams;
  const members = await db
    .select({ id: memberships.id, role: memberships.role, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, ctx.org.id));

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <div className="eyebrow">Settings</div>
        <h1 className="m-0 text-[36px] font-medium leading-[1.05] tracking-[-1.8px]">
          {ctx.org.name}. <span className="font-serif italic text-muted">The boring but important bits.</span>
        </h1>
      </header>

      <nav className="flex gap-1 self-start rounded-[7px] border border-line bg-white p-[3px] text-[12px] font-medium">
        <span className="inline-flex min-h-9 items-center rounded-[5px] bg-ink px-3 text-white">Workspace</span>
        <Link href="/settings/billing" className="inline-flex min-h-9 items-center rounded-[5px] px-3 text-[#4a4b44] hover:bg-paper">
          Plan and credits
        </Link>
        <Link href="/brands" className="inline-flex min-h-9 items-center rounded-[5px] px-3 text-[#4a4b44] hover:bg-paper">
          Brands
        </Link>
      </nav>

      <div className="grid max-w-[900px] gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-4 p-5">
          <span className="eyebrow">Workspace</span>
          {ok ? <p className="m-0 text-[13px] text-[#3f7a55]">Saved.</p> : null}
          <form action={updateOrgName} className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Name
              <input name="name" defaultValue={ctx.org.name} className={inputClass} disabled={ctx.role !== "owner"} />
            </label>
            {ctx.role === "owner" ? (
              <button className="btn btn-dark h-11 self-start">Save</button>
            ) : (
              <p className="m-0 text-[12px] text-muted">Only owners can rename the workspace.</p>
            )}
          </form>
        </section>

        <section className="panel flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Members</span>
            <span className="text-[11px] text-muted">{members.length} in workspace</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 text-[13px]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
                  {(m.name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}</span>
                <span className="rounded-full border border-line px-2 py-px text-[10px] font-semibold uppercase tracking-[.8px] text-muted">{m.role}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] text-muted">Invites and roles arrive with team review in Release 3.</p>
        </section>
      </div>
    </>
  );
}
