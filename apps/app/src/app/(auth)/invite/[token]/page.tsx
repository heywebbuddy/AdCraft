import Link from "next/link";
import { Wordmark } from "@/components/spark";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, dbReady, organizations } from "@adcraft/db";
import { auth } from "@/auth";
import { findInviteByToken } from "@/server/team-data";
import { acceptInvite } from "@/server/team";

export const dynamic = "force-dynamic";

/**
 * /invite/[token]: signed out → sign-in with a callback here; signed in → join and go to the dashboard.
 * Public in middleware (auth.config.ts), so the invalid/expired states render for anyone.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await dbReady;
  const invite = await findInviteByToken(token);
  const session = await auth();

  if (!invite) return <Shell title="This invite doesn’t exist." body="Check the link, or ask the person who invited you to send a new one." />;
  if (invite.acceptedAt) {
    if (!session?.user) redirect(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
    return <Shell title="This invite was already used." body="If that was you, head to your dashboard." cta={{ href: "/dashboard", label: "Go to dashboard" }} />;
  }
  if (invite.expiresAt < new Date()) return <Shell title="This invite has expired." body="Invites last 7 days. Ask an owner to send a fresh one." />;

  if (!session?.user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);

  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, invite.orgId) });
  const orgName = org?.name ?? "the workspace";
  const viewerEmail = (session.user.email ?? "").toLowerCase();
  const matches = viewerEmail === invite.email.toLowerCase();

  if (!matches) {
    return (
      <Shell
        title={`This invite is for ${invite.email}.`}
        body={`You are signed in as ${session.user.email ?? "another account"}. Sign in with the invited address to join ${orgName}.`}
        cta={{ href: `/api/auth/reset?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`, label: "Switch account" }}
      />
    );
  }

  async function join() {
    "use server";
    const result = await acceptInvite(token);
    redirect(result.ok ? "/dashboard" : `/invite/${token}?error=${result.reason}`);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-8"><Wordmark size={26} /></div>
        <div className="eyebrow">You’re invited</div>
        <h1 className="mt-3 text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">
          Join {orgName} <span className="font-serif italic text-orange">as {invite.role}.</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">Signed in as {session.user.email}. Joining adds this workspace to your account; you can switch between workspaces from the sidebar.</p>
        <form action={join} className="mt-6">
          <button type="submit" className="btn btn-orange h-12 justify-between text-[15px]">
            Join {orgName} <span aria-hidden="true">↗︎</span>
          </button>
        </form>
      </div>
    </main>
  );
}

function Shell({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-8"><Wordmark size={26} /></div>
        <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">{title}</h1>
        <p className="mt-4 text-[15px] text-muted">{body}</p>
        {cta ? (
          <Link href={cta.href} className="btn btn-dark mt-6 h-11">
            {cta.label} <span aria-hidden="true">↗︎</span>
          </Link>
        ) : null}
      </div>
    </main>
  );
}
