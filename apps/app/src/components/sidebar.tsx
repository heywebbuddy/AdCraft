"use client";
import Link from "next/link";
import { Spark } from "./spark";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BriefIcon,
  CampaignIcon,
  ChevronsIcon,
  CreativesIcon,
  HomeIcon,
  LibraryIcon,
  PerformanceIcon,
  SettingsIcon,
  BrandIcon,
  BoltIcon,
  LogoutIcon,
  GridIcon,
  PlayIcon,
} from "./icons";
export type SidebarProps = {
  org: { id: string; name: string };
  brand: { id: string; name: string } | null;
  brands: Array<{ id: string; name: string }>;
  plan: string;
  credits: { balance: number; grant: number; renews?: string };
  viewer: { name: string; email: string };
  /** Shows the Admin link in the user area (platform staff only). */
  isPlatformAdmin?: boolean;
  counts?: { needsReview?: number };
  onSwitchBrand: (brandId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
};
type NavItem = { href: string; label: string; Icon: React.ComponentType; children?: Array<{ href: string; label: string }> };
const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Overview", Icon: HomeIcon },
      { href: "/briefs", label: "Creative briefs", Icon: BriefIcon },
      {
        href: "/characters",
        label: "Character studio",
        Icon: PlayIcon,
        children: [
          { href: "/characters?view=presenters", label: "Presenter library" },
          { href: "/characters?view=voices", label: "Voice library" },
        ],
      },
      { href: "/creatives", label: "All creatives", Icon: CreativesIcon },
      { href: "/library", label: "Product library", Icon: LibraryIcon },
      { href: "/brands", label: "Brand kits", Icon: BrandIcon },
    ],
  },
  {
    label: "DISTRIBUTION",
    items: [
      { href: "/campaigns", label: "Campaigns", Icon: CampaignIcon },
      { href: "/performance", label: "Performance", Icon: PerformanceIcon },
    ],
  },
];
export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname + (params.size ? `?${params.toString()}` : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);
  const pct =
    props.credits.grant > 0
      ? Math.max(
          0,
          Math.min(100, (props.credits.balance / props.credits.grant) * 100),
        )
      : 0;
  const content = () => (
    <>
      <div className="sidebar-logo-row">
        <Link href="/dashboard" className="workspace-logo">
          <Spark size={26} className="wordmark-spark" />adcraft<b>.</b>
        </Link>
        <span className="workspace-beta">STUDIO</span>
      </div>
      <details className="workspace-picker">
        <summary>
          <span className="workspace-brand-avatar">
            {(props.brand?.name ?? props.org.name).slice(0, 1).toUpperCase()}
          </span>
          <span className="workspace-picker-text">
            <strong>{props.brand?.name ?? props.org.name}</strong>
            <small>{props.org.name}</small>
          </span>
          <ChevronsIcon />
        </summary>
        <div className="workspace-picker-menu">
          <span className="workspace-nav-label">SWITCH BRAND</span>
          {props.brands.map((b) => (
            <button
              type="button"
              key={b.id}
              disabled={pending}
              onClick={(e) => {
                const parent = e.currentTarget.closest("details");
                start(async () => {
                  try {
                    await props.onSwitchBrand(b.id);
                    parent?.removeAttribute("open");
                    setError("");
                  } catch {
                    setError("Couldn’t switch brand. Please try again.");
                  }
                });
              }}
            >
              {b.name}
              {b.id === props.brand?.id && <span>✓</span>}
            </button>
          ))}
          <Link href="/brands/new">
            <span>＋</span> Add a brand
          </Link>
          {error && <p role="alert">{error}</p>}
        </div>
      </details>
      <Link className="sidebar-create btn btn-orange" href="/briefs/new">
        <span>＋</span> Create a brief
      </Link>
      <div className="sidebar-navigation">
        {groups.map((group) => (
          <nav key={group.label} aria-label={group.label.toLowerCase()}>
            <span className="workspace-nav-label">{group.label}</span>
            {group.items.map(({ href, label, Icon, children }) => {
              const childActive = children?.find((c) => c.href === current);
              const active =
                !childActive &&
                (pathname === href ||
                  (href !== "/dashboard" && pathname.startsWith(href)));
              return (
                <div key={href} className={children ? "workspace-nav-group" : undefined}>
                  <Link
                    href={href}
                    className={`workspace-nav-item ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon />
                    {label}
                    {href === "/creatives" && !!props.counts?.needsReview && (
                      <span className="nav-count">
                        {props.counts.needsReview}
                      </span>
                    )}
                  </Link>
                  {children && (
                    <div className="workspace-nav-children">
                      {children.map((c) => (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`workspace-nav-child ${childActive?.href === c.href ? "active" : ""}`}
                          aria-current={childActive?.href === c.href ? "page" : undefined}
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        ))}
      </div>
      <div className="sidebar-bottom">
        <nav aria-label="Workspace administration">
          <Link
            href="/settings"
            className={`workspace-nav-item ${pathname.startsWith("/settings") ? "active" : ""}`}
          >
            <SettingsIcon />
            Settings
          </Link>
        </nav>
        <Link href="/settings/billing" className="sidebar-credits" title={`${props.plan} plan · manage credits`}>
          <span className="sidebar-credits-row">
            <span className="sidebar-credits-label">
              <BoltIcon width={13} height={13} /> Credits
            </span>
            <strong className="tabular">
              {props.credits.balance.toLocaleString()}
              <small> / {Math.max(props.credits.grant, props.credits.balance).toLocaleString()}</small>
            </strong>
          </span>
          <span
            className="sidebar-credit-track"
            role="progressbar"
            aria-label="Remaining generation credits"
            aria-valuenow={props.credits.balance}
            aria-valuemin={0}
            aria-valuemax={Math.max(props.credits.grant, props.credits.balance)}
          >
            <span style={{ width: `${pct}%` }} />
          </span>
        </Link>
        <div className="sidebar-user">
          <span className="viewer-avatar">
            {props.viewer.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{props.viewer.name}</strong>
            <small>{props.viewer.email}</small>
          </div>
          {props.isPlatformAdmin ? (
            <Link href="/admin" className="sidebar-admin-link" aria-label="Admin panel" title="Admin panel">
              <GridIcon width={17} height={17} />
            </Link>
          ) : null}
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
      <div className="workspace-mobile-bar">
        <Link href="/dashboard" className="workspace-logo">
          <Spark size={26} className="wordmark-spark" />adcraft<b>.</b>
        </Link>
        <button
          aria-label="Open navigation"
          type="button"
          onClick={() => dialog.current?.showModal()}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      <aside className="workspace-sidebar">{content()}</aside>
      <dialog
        ref={dialog}
        className="sidebar-drawer"
        aria-label="Workspace navigation"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button
          className="drawer-close"
          type="button"
          aria-label="Close navigation"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        {content()}
      </dialog>
    </>
  );
}
