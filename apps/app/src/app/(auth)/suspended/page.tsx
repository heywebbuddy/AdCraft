import { signOut } from "@/auth";
import { Wordmark } from "@/components/spark";
import { requireViewer } from "@/server/org";

export const dynamic = "force-dynamic";

/** Shown to members of a workspace a platform admin has suspended (see server/org.ts). */
export default async function SuspendedPage() {
  const viewer = await requireViewer();
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[440px]">
        <div className="mb-8">
          <Wordmark size={26} />
        </div>
        <h1 className="text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">
          This workspace is paused.
          <br />
          <span className="font-serif italic text-orange">We are on it.</span>
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          Hi {viewer.name}. Your workspace has been suspended by the Adcraft team. Nothing has been deleted. Write to{" "}
          <a href="mailto:support@adcraft.app" className="text-ink underline">
            support@adcraft.app
          </a>{" "}
          and we will sort it out.
        </p>
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}
        >
          <button className="btn btn-outline h-11">Sign out</button>
        </form>
      </div>
    </main>
  );
}
