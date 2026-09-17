import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, organizations } from "@adcraft/db";
import { signOut } from "@/auth";
import { requireAdmin, supportOrgId } from "@/server/admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import "../../(app)/workspace.css";
import "./admin.css";

export const metadata: Metadata = { title: "Admin · Adcraft" };
export const dynamic = "force-dynamic";

/**
 * The admin shell (PLAN.md section 14): same tokens and primitives as the app, but an
 * ink-dark rail and an ADMIN tag so it can never be mistaken for a customer workspace.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const orgId = await supportOrgId();
  const supportOrg = orgId
    ? ((await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { id: true, name: true } })) ?? null)
    : null;
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

  return (
    <div className="app-shell admin-shell">
      <a href="#admin-main" className="workspace-skip">
        Skip to content
      </a>
      <AdminSidebar
        viewer={{ name: admin.name, email: admin.email }}
        env={env}
        onSignOut={async () => {
          "use server";
          await signOut({ redirectTo: "/sign-in" });
        }}
      />
      <div className="workspace-body">
        <AdminTopbar supportOrg={supportOrg} />
        <main id="admin-main" className="workspace-main admin-main">
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Adcraft Admin</span>
          <span>Every action here is written to the audit log</span>
        </footer>
      </div>
    </div>
  );
}
