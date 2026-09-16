import { signOut } from "@/auth";
import { requireOrg } from "@/server/org";
import { switchBrand } from "@/server/onboarding";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { currentSubscription, PLANS, type PlanId } from "@/server/billing";
import "./workspace.css";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrg();
  const subscription = await currentSubscription(ctx.org.id);
  const planName =
    subscription?.plan && subscription.plan in PLANS
      ? PLANS[subscription.plan as PlanId].name
      : "Trial";

  return (
    <div className="app-shell">
      <a href="#workspace-main" className="workspace-skip">
        Skip to content
      </a>
      <Sidebar
        org={{ id: ctx.org.id, name: ctx.org.name }}
        brand={ctx.brand ? { id: ctx.brand.id, name: ctx.brand.name } : null}
        brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))}
        plan={planName}
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
      <div className="workspace-body">
        <WorkspaceTopbar
          orgName={ctx.org.name}
          credits={ctx.credits.balance}
          role={ctx.role}
        />
        <main id="workspace-main" className="workspace-main">
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Adcraft Studio</span>
          <span>{ctx.brand?.name ?? ctx.org.name} workspace</span>
        </footer>
      </div>
    </div>
  );
}
