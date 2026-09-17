import { redirect } from "next/navigation";
import { PendingButton } from "@/components/pending-button";
import { Wordmark } from "@/components/spark";
import { auth, signIn, devLoginEnabled } from "@/auth";

const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID);
const hasEmail = Boolean(process.env.RESEND_API_KEY);

const inputClass =
  "h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; stale?: string }>;
}) {
  const session = await auth();
  const { callbackUrl = "/dashboard", error, stale } = await searchParams;
  if (session?.user && stale) redirect("/api/auth/reset");
  if (session?.user) redirect(callbackUrl);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8">
          <Wordmark size={26} />
        </div>
        <h1 className="text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">
          Welcome back.
          <br />
          <em className="font-serif not-italic text-orange">
            <span className="italic">Let’s make something.</span>
          </em>
        </h1>

        {error ? (
          <p className="mt-6 rounded-[7px] border border-orange/40 bg-orange/10 px-3 py-2 text-sm">
            Sign-in didn’t go through ({error}). Try again.
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-4">
          {hasEmail ? (
            <form
              className="flex flex-col gap-3"
              action={async (formData) => {
                "use server";
                await signIn("resend", { email: String(formData.get("email") ?? ""), redirectTo: callbackUrl });
              }}
            >
              <label className="text-sm font-medium" htmlFor="email">
                Work email
              </label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@brand.com" className={inputClass} />
              <PendingButton className="btn btn-dark h-11 justify-between" pendingLabel="Sending…">
                Email me a sign-in link <span aria-hidden="true">↗</span>
              </PendingButton>
            </form>
          ) : null}

          {hasGoogle ? (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: callbackUrl });
              }}
            >
              <button type="submit" className="btn btn-outline h-11 w-full">
                Continue with Google
              </button>
            </form>
          ) : null}

          {devLoginEnabled ? (
            <form
              className="flex flex-col gap-3 rounded-[9px] border border-dashed border-line bg-white p-4"
              action={async (formData) => {
                "use server";
                await signIn("dev", { email: String(formData.get("email") ?? ""), redirectTo: callbackUrl });
              }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">Local development</div>
              <p className="text-sm text-muted">
                {hasEmail
                  ? "Any address signs you straight in, no email needed. Hidden in production."
                  : <>No email provider is configured, so any address signs you straight in. Add <code className="rounded bg-paper px-1">RESEND_API_KEY</code> to switch to magic links.</>}
              </p>
              <input name="email" type="email" required placeholder="you@brand.com" className={inputClass} />
              <PendingButton className="btn btn-orange h-11 justify-between" pendingLabel="Signing in…">
                Sign in <span aria-hidden="true">↗</span>
              </PendingButton>
            </form>
          ) : null}

          {!hasEmail && !hasGoogle && !devLoginEnabled ? (
            <p className="text-sm text-muted">No sign-in method is configured. Set RESEND_API_KEY or AUTH_GOOGLE_ID.</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
