import { signOut } from "@/auth";
import { requireOrg } from "@/server/org";
import { switchBrand } from "@/server/onboarding";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        org={{ id: ctx.org.id, name: ctx.org.name }}
        brand={ctx.brand ? { id: ctx.brand.id, name: ctx.brand.name } : null}
        brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))}
        plan="Trial"
        credits={ctx.credits}
        viewer={{ name: ctx.viewer.name, email: ctx.viewer.email }}
        onSwitchBrand={async (id) => {
          "use server";
          await switchBrand(id);
        }}
        onSignOut={async () => {
          "use server";
          await signOut({ redirectTo: "/sign-in" });
        }}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-[26px] px-8 pb-10 pt-[26px]">{children}</main>
    </div>
  );
}
