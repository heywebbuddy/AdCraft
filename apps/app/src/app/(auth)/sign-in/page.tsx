import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button, Card } from "@adcraft/ui";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl = "/dashboard", error } = await searchParams;
  if (session?.user) redirect(callbackUrl);

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="font-serif text-3xl text-ink">Sign in to Adcraft</h1>
          <p className="text-sm text-muted">We&apos;ll email you a magic link. No password needed.</p>
        </div>

        {error ? (
          <p className="rounded-md border border-orange/40 bg-orange/10 px-3 py-2 text-sm text-ink">
            Sign-in failed ({error}). Please try again.
          </p>
        ) : null}

        <form
          className="space-y-3"
          action={async (formData) => {
            "use server";
            await signIn("resend", {
              email: String(formData.get("email") ?? ""),
              redirectTo: callbackUrl,
            });
          }}
        >
          <label className="block text-sm font-medium text-ink" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-orange"
          />
          <Button type="submit" className="w-full">
            Email me a link
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
      </Card>
    </main>
  );
}
