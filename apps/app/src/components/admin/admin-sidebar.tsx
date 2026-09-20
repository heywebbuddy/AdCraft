"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Spark } from "../spark";
import {
  HomeIcon,
  TeamIcon,
  BoltIcon,
  GridIcon,
  PerformanceIcon,
  CampaignIcon,
  SettingsIcon,
  BriefIcon,
  LogoutIcon,
  ArrowIcon,
  StarIcon,
  BrandIcon,
  AlertIcon,
} from "../icons";

export type AdminSidebarProps = {
  viewer: { name: string; email: string };
  env: string;
  onSignOut: () => Promise<void>;
};

const groups = [
  {
    label: "OPERATE",
    items: [
      { href: "/admin", label: "Overview", Icon: HomeIcon },
      { href: "/admin/orgs", label: "Organisations", Icon: BrandIcon },
      { href: "/admin/users", label: "Users", Icon: TeamIcon },
    ],
  },
  {
    label: "GENERATION",
    items: [
      { href: "/admin/generations", label: "Generations & costs", Icon: BoltIcon },
      { href: "/admin/models", label: "Models & pricing", Icon: StarIcon },
      { href: "/admin/providers", label: "Providers", Icon: GridIcon },
    ],
  },
  {
    label: "COMMERCE",
    items: [
      { href: "/admin/billing", label: "Billing", Icon: PerformanceIcon },
      { href: "/admin/campaigns", label: "Campaigns", Icon: CampaignIcon },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { href: "/admin/errors", label: "Errors", Icon: AlertIcon },
      { href: "/admin/settings", label: "Settings & flags", Icon: SettingsIcon },
      { href: "/admin/audit", label: "Audit log", Icon: BriefIcon },
    ],
  },
];

/** Ink-dark rail for /admin. Same bones as the app sidebar, unmistakably not a workspace. */
export function AdminSidebar(props: AdminSidebarProps) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const content = () => (
    <>
      <div className="sidebar-logo-row admin-logo-row">
        <Link href="/admin" className="workspace-logo">
          <Spark size={26} className="wordmark-spark" />
          adcraft<b>.</b>
        </Link>
        <span className="admin-tag">ADMIN</span>
      </div>
      <div className="sidebar-navigation">
        {groups.map((group) => (
          <nav key={group.label} aria-label={group.label.toLowerCase()}>
            <span className="workspace-nav-label">{group.label}</span>
            {group.items.map(({ href, label, Icon }) => {
              const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
              return (
                <Link key={href} href={href} className={`workspace-nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
                  <Icon />
                  {label}
                </Link>
              );
            })}
          </nav>
        ))}
      </div>
      <div className="sidebar-bottom">
        <nav aria-label="Leave admin">
          <Link href="/dashboard" className="workspace-nav-item">
            <ArrowIcon />
            Back to the app
          </Link>
        </nav>
        <div className="admin-env">
          <span className="eyebrow">Environment</span>
          <strong>{props.env}</strong>
        </div>
        <div className="sidebar-user">
          <span className="viewer-avatar">{props.viewer.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{props.viewer.name}</strong>
            <small>{props.viewer.email}</small>
          </div>
          <form action={props.onSignOut}>
            <button type="submit" aria-label="Sign out" title="Sign out">
              <LogoutIcon width={17} height={17} />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="workspace-mobile-bar admin-mobile-bar">
        <Link href="/admin" className="workspace-logo">
          <Spark size={26} className="wordmark-spark" />
          adcraft<b>.</b>
          <span className="admin-tag">ADMIN</span>
        </Link>
        <button aria-label="Open navigation" type="button" onClick={() => dialog.current?.showModal()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      <aside className="workspace-sidebar admin-sidebar">{content()}</aside>
      <dialog
        ref={dialog}
        className="sidebar-drawer admin-drawer"
        aria-label="Admin navigation"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button className="drawer-close" type="button" aria-label="Close navigation" onClick={() => dialog.current?.close()}>
          ×
        </button>
        {content()}
      </dialog>
    </>
  );
}
