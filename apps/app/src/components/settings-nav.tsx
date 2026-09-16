import Link from "next/link";

export type SettingsTab = "workspace" | "team" | "templates" | "billing" | "api" | "audit" | "brands";

const tabs: Array<{ id: SettingsTab; href: string; label: string; ownerOnly?: boolean }> = [
  { id: "workspace", href: "/settings", label: "Workspace" },
  { id: "team", href: "/settings/team", label: "Team" },
  { id: "templates", href: "/settings/templates", label: "Templates" },
  { id: "billing", href: "/settings/billing", label: "Plan and credits" },
  { id: "api", href: "/settings/api", label: "API" },
  { id: "audit", href: "/settings/audit", label: "Audit log", ownerOnly: true },
  { id: "brands", href: "/brands", label: "Brands" },
];

/** The segmented tab strip shared by every /settings page. */
export function SettingsNav({ active, role }: { active: SettingsTab; role: "owner" | "editor" | "viewer" }) {
  return (
    <nav className="flex flex-wrap gap-1 self-start rounded-[7px] border border-line bg-white p-[3px] text-[12px] font-medium">
      {tabs
        .filter((t) => !t.ownerOnly || role === "owner")
        .map((t) =>
          t.id === active ? (
            <span key={t.id} className="inline-flex min-h-9 items-center rounded-[5px] bg-ink px-3 text-white">
              {t.label}
            </span>
          ) : (
            <Link key={t.id} href={t.href} className="inline-flex min-h-9 items-center rounded-[5px] px-3 text-[#4a4b44] hover:bg-paper">
              {t.label}
            </Link>
          ),
        )}
    </nav>
  );
}
