import Link from "next/link";

export type SettingsTab =
  "workspace" | "team" | "templates" | "billing" | "api" | "audit" | "brands" | "guardrails" | "privacy";

const tabs: Array<{
  id: SettingsTab;
  href: string;
  label: string;
  ownerOnly?: boolean;
}> = [
  { id: "workspace", href: "/settings", label: "Workspace" },
  { id: "team", href: "/settings/team", label: "Team" },
  { id: "templates", href: "/settings/templates", label: "Templates" },
  { id: "billing", href: "/settings/billing", label: "Plan and credits" },
  { id: "guardrails", href: "/settings/guardrails", label: "Guardrails" },
  { id: "api", href: "/settings/api", label: "API access" },
  { id: "audit", href: "/settings/audit", label: "Audit log", ownerOnly: true },
  { id: "privacy", href: "/settings/privacy", label: "Privacy" },
  { id: "brands", href: "/brands", label: "Brands" },
];

/** The segmented tab strip shared by every /settings page. */
export function SettingsNav({
  active,
  role,
}: {
  active: SettingsTab;
  role: "owner" | "editor" | "viewer";
}) {
  return (
    <nav className="workspace-tabs" aria-label="Settings sections">
      {tabs
        .filter((t) => !t.ownerOnly || role === "owner")
        .map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={t.id === active ? "active" : ""}
            aria-current={t.id === active ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
    </nav>
  );
}
