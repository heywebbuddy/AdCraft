import { PageHeader } from "@/components/workspace-ui";
import { SettingsNav } from "@/components/settings-nav";
import { requireOrg } from "@/server/org";
import { requestWorkspaceDeletion } from "@/server/privacy-actions";
import { LEGAL_CONTACT, LEGAL_NAV } from "@/lib/legal";
import Link from "next/link";

export const dynamic = "force-dynamic";

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink disabled:opacity-60";

const errors: Record<string, string> = {
  owner: "Only the workspace owner can request deletion.",
  name: "Type the workspace name exactly to confirm.",
};

export default async function PrivacySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requireOrg();
  const { ok, error } = await searchParams;
  const requestedAt = ctx.org.settings?.deletionRequestedAt;
  const owner = ctx.role === "owner";

  return (
    <>
      <PageHeader
        title="Privacy"
        description="How this workspace handles data, and how to ask us to delete it."
      />
      <SettingsNav active="privacy" role={ctx.role} />

      <div className="grid max-w-[900px] gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-3 p-5">
          <span className="eyebrow">Policies</span>
          <p className="m-0 text-[13px] text-muted">
            The working product policy — have a lawyer review it before you take paid customers.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
            {LEGAL_NAV.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="font-medium text-ink underline-offset-2 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] text-muted">
            Questions:{" "}
            <a href={`mailto:${LEGAL_CONTACT.privacy}`} className="text-ink">
              {LEGAL_CONTACT.privacy}
            </a>
          </p>
        </section>

        <section className="panel flex flex-col gap-3 p-5">
          <span className="eyebrow">Your data</span>
          <p className="m-0 text-[13px] text-muted">
            You can ask to access, export or correct personal data by writing to{" "}
            {LEGAL_CONTACT.privacy}. We reply within 30 days. Workspace content stays until you
            delete it or an owner requests deletion below.
          </p>
        </section>

        <section className="panel flex flex-col gap-4 p-5 md:col-span-2">
          <span className="eyebrow">Delete this workspace</span>
          {ok ? (
            <p className="m-0 text-[13px] text-[#3f7a55]">
              Request received. We will confirm the owner, then delete the workspace and its files.
            </p>
          ) : null}
          {error && errors[error] ? <p className="m-0 text-[13px] text-orange">{errors[error]}</p> : null}
          {requestedAt ? (
            <p className="m-0 text-[13px] text-muted">
              Deletion was requested on{" "}
              {new Date(requestedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {ctx.org.settings?.deletionReason ? ` — “${ctx.org.settings.deletionReason}”` : ""}. We will
              write to {ctx.viewer.email} when it is done.
            </p>
          ) : owner ? (
            <form action={requestWorkspaceDeletion} className="flex max-w-[480px] flex-col gap-3">
              <p className="m-0 text-[13px] text-muted">
                This asks us to delete the workspace, members, creatives and stored files. It is not
                instant — we confirm the owner first. Type <strong>{ctx.org.name}</strong> to confirm.
              </p>
              <label className="flex flex-col gap-2">
                <span className="field-label">Workspace name</span>
                <input name="confirm" autoComplete="off" className={inputClass} required />
              </label>
              <label className="flex flex-col gap-2">
                <span className="field-label">Note (optional)</span>
                <input name="reason" maxLength={500} placeholder="Anything we should know" className={inputClass} />
              </label>
              <button className="btn btn-outline h-11 self-start">Request deletion</button>
            </form>
          ) : (
            <p className="m-0 text-[13px] text-muted">
              Only the workspace owner can request deletion. Ask them, or write to {LEGAL_CONTACT.privacy}.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
