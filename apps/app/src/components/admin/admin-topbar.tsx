"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "../theme-toggle";

const names: Array<[string, string]> = [
  ["/admin/orgs", "Organisations"],
  ["/admin/users", "Users"],
  ["/admin/generations", "Generations & costs"],
  ["/admin/models", "Models & pricing"],
  ["/admin/providers", "Providers"],
  ["/admin/billing", "Billing"],
  ["/admin/campaigns", "Campaigns"],
  ["/admin/settings", "Settings & flags"],
  ["/admin/audit", "Audit log"],
];

export function AdminTopbar({ supportOrg }: { supportOrg: { id: string; name: string } | null }) {
  const path = usePathname();
  const section = names.find(([href]) => path === href || path.startsWith(href + "/"));
  return (
    <header className="workspace-topbar admin-topbar">
      <nav aria-label="Breadcrumb" className="workspace-breadcrumb">
        <Link href="/admin">Admin</Link>
        {section ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={section[0]}>{section[1]}</Link>
            {path !== section[0] ? (
              <>
                <span aria-hidden="true">/</span>
                <span>Details</span>
              </>
            ) : null}
          </>
        ) : (
          <>
            <span aria-hidden="true">/</span>
            <span>Overview</span>
          </>
        )}
      </nav>
      <div className="topbar-tools">
        {supportOrg ? (
          <Link href="/dashboard" className="admin-support-chip">
            Viewing <strong>{supportOrg.name}</strong> as support
          </Link>
        ) : null}
        <ThemeToggle />
        <span className="admin-topbar-note">Internal · platform operations</span>
      </div>
    </header>
  );
}
