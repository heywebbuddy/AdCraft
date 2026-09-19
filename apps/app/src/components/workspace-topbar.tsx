"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, ArrowIcon, BoltIcon } from "./icons";
import { useBreadcrumbTitle } from "./breadcrumb-title";
import { ActivityTray } from "./activity-tray";
import { ThemeToggle } from "./theme-toggle";
import { FullscreenToggle } from "./fullscreen-toggle";
const destinations: Array<{ name: string; href: string; match?: string; group: string }> = [
  { name: "Overview", href: "/dashboard", group: "Workspace" },
  { name: "Briefs", href: "/briefs", group: "Create" },
  { name: "New static ad", href: "/briefs/new?format=static", group: "Create" },
  { name: "New product video", href: "/briefs/new?format=video", group: "Create" },
  { name: "Character studio", href: "/characters", group: "Create" },
  { name: "My characters", href: "/characters?view=characters", group: "Create" },
  { name: "Cast library", href: "/characters?view=presenters", group: "Create" },
  { name: "Voice library", href: "/characters?view=voices", group: "Create" },
  { name: "Design a look", href: "/characters?view=looks", group: "Create" },
  { name: "Ads", href: "/creatives", group: "Create" },
  { name: "Videos", href: "/creatives?kind=video", match: "/videos", group: "Create" },
  { name: "Product library", href: "/library", group: "Assets" },
  { name: "Brand kits", href: "/brands", group: "Assets" },
  { name: "Campaigns", href: "/campaigns", group: "Distribution" },
  { name: "Performance", href: "/performance", group: "Distribution" },
  { name: "Team members", href: "/settings/team", group: "Settings" },
  { name: "Templates", href: "/settings/templates", group: "Settings" },
  { name: "Plan and credits", href: "/settings/billing", group: "Settings" },
  { name: "API access", href: "/settings/api", group: "Settings" },
  { name: "Settings", href: "/settings", group: "Workspace" },
];
export function WorkspaceTopbar({
  orgName,
  credits,
  role,
  running = 0,
}: {
  orgName: string;
  credits: number;
  role: string;
  /** Jobs running at render time; the tray polls from there. */
  running?: number;
}) {
  const path = usePathname();
  const detailTitle = useBreadcrumbTitle();
  const current =
    destinations.find((d) => d.href === path) ??
    destinations.find((d) => path.startsWith((d.match ?? d.href) + "/"));
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const open = () => {
    setQuery("");
    dialog.current?.showModal();
    input.current?.focus();
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => dialog.current?.close(), [path]);
  const results = destinations.filter((d) =>
    (d.name + " " + d.group).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <header className="workspace-topbar">
        <nav aria-label="Breadcrumb" className="workspace-breadcrumb">
          <span>{orgName}</span>
          <span aria-hidden="true">/</span>
          <Link href={current?.href ?? "/dashboard"}>
            {current?.name ?? "Workspace"}
          </Link>
          {current && path !== current.href && (
            <>
              <span aria-hidden="true">/</span>
              <span>{detailTitle ?? (path.endsWith("/new") ? "Create new" : "Details")}</span>
            </>
          )}
        </nav>
        <div className="topbar-tools">
          <button
            onClick={open}
            className="workspace-search-trigger"
            aria-label="Search workspace"
          >
            <SearchIcon width={16} height={16} />
            <span>Search workspace</span>
            <kbd>⌘ K</kbd>
          </button>
          <ActivityTray initialRunning={running} />
          <FullscreenToggle />
          <ThemeToggle />
          <Link
            href="/settings/billing"
            className="topbar-credits"
            title="Manage generation credits"
          >
            <BoltIcon width={15} height={15} />
            {credits.toLocaleString()}
            <span>credits</span>
          </Link>
          <span className="role-badge">{role}</span>
        </div>
      </header>
      <dialog
        ref={dialog}
        className="workspace-command"
        aria-label="Search workspace"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <form action="/creatives">
          <div className="command-input">
            <SearchIcon />
            <input
              ref={input}
              type="search"
              name="q"
              placeholder="Find a page or search creatives…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find a page or search creatives"
            />
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close search"
            >
              Esc
            </button>
          </div>
          <div className="command-results">
            <span className="workspace-nav-label">
              {query ? "MATCHING PAGES" : "QUICK NAVIGATION"}
            </span>
            {results.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                onClick={() => dialog.current?.close()}
              >
                <span>
                  {d.name}
                  <small>{d.group}</small>
                </span>
                <ArrowIcon width={16} height={16} />
              </Link>
            ))}
            {query && (
              <button type="submit" className="command-search-creatives">
                <SearchIcon width={16} height={16} /> Search creatives for “
                {query}” <ArrowIcon width={16} height={16} />
              </button>
            )}
            {!results.length && !query && <p>No matching pages.</p>}
          </div>
        </form>
        <div className="command-footer">
          <span>Jump to a page or press Enter to search creatives.</span>
          <span>ESC to close</span>
        </div>
      </dialog>
    </>
  );
}
