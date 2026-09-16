import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard#brands", label: "Brands" },
  { href: "/dashboard#projects", label: "Projects" },
  { href: "/dashboard#settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in?callbackUrl=/dashboard");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-paper px-4 py-6">
        <Link href="/dashboard" className="mb-8 px-2 font-serif text-2xl text-ink">
          Adcraft
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-sm text-ink hover:bg-line/60"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-line pt-4 text-xs text-muted">
          <p className="truncate px-2">{session.user.email}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="px-2 text-left hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
