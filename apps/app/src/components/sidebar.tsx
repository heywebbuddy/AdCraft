"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { BriefIcon, CampaignIcon, ChevronsIcon, CreativesIcon, HomeIcon, LibraryIcon, PerformanceIcon, SettingsIcon } from "./icons";

export type SidebarProps = {
  org: { id: string; name: string };
  brand: { id: string; name: string } | null;
  brands: Array<{ id: string; name: string }>;
  plan: string;
  credits: { balance: number; grant: number; renews?: string };
  viewer: { name: string; email: string };
  counts?: { needsReview?: number };
  onSwitchBrand: (brandId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
};

const nav = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/briefs", label: "Briefs", Icon: BriefIcon },
  { href: "/creatives", label: "Creatives", Icon: CreativesIcon, badge: "needsReview" as const },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  { href: "/campaigns", label: "Campaigns", Icon: CampaignIcon },
  { href: "/performance", label: "Performance", Icon: PerformanceIcon },
];

export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const pct = props.credits.grant > 0 ? Math.min(100, Math.round((props.credits.balance / props.credits.grant) * 100)) : 0;
  const initial = (props.brand?.name ?? props.org.name).slice(0, 1).toLowerCase();

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-[22px] border-r border-line bg-paper px-4 py-[22px]">
      <Link href="/dashboard" className="flex items-center gap-1.5 px-2 text-[24px] font-semibold leading-none tracking-[-1.2px]">
        <span className="text-[30px] font-normal leading-[.8] text-orange">✳</span>adcraft<span className="-ml-[3px] text-orange">.</span>
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-[9px] border border-line bg-white p-2.5 text-left hover:border-ink/30"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#f5d6b4] to-[#ed9a70] font-serif text-[17px] italic text-[#98694b]">
            {initial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
            <span className="truncate text-[13px] font-semibold">{props.brand?.name ?? props.org.name}</span>
            <span className="truncate text-[11px] text-muted">
              {props.plan} · {props.brands.length} brand{props.brands.length === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronsIcon className="text-muted" />
        </button>
        {open ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-[9px] border border-line bg-white p-1.5 shadow-[0_10px_24px_#2c25151a]">
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">{props.org.name}</div>
            {props.brands.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await props.onSwitchBrand(b.id);
                    setOpen(false);
                  })
                }
                className={`flex h-10 w-full items-center rounded-[7px] px-2 text-left text-[13px] hover:bg-paper ${b.id === props.brand?.id ? "font-semibold" : ""}`}
              >
                {b.name}
                {b.id === props.brand?.id ? <span className="ml-auto text-orange">✓</span> : null}
              </button>
            ))}
            <Link href="/brands/new" className="mt-1 flex h-10 items-center rounded-[7px] border-t border-line px-2 text-[13px] text-muted hover:text-ink">
              + New brand
            </Link>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-col gap-0.5">
        {nav.map(({ href, label, Icon, badge }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          const count = badge ? props.counts?.[badge] : undefined;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] ${
                active ? "bg-white font-semibold shadow-[0_1px_2px_#2c251512]" : "font-medium text-[#4a4b44] hover:bg-[#efeee8]"
              }`}
            >
              <Icon className={active ? "text-orange" : undefined} />
              {label}
              {count ? (
                <span className="ml-auto rounded-full bg-[#fbe3d9] px-[7px] py-px text-[11px] font-semibold text-orange">{count}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3.5">
        <div className="panel flex flex-col gap-2 p-3.5">
          <div className="flex justify-between text-[12px]">
            <span className="font-semibold">Credits</span>
            <span className="tabular text-muted">
              {props.credits.balance} <span className="text-[#a9a9a1]">/ {props.credits.grant}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#efeee8]">
            <div className="h-full rounded-full bg-orange" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted">
            <span>{props.credits.renews ?? "Trial credits"}</span>
            <Link href="/settings/billing" className="font-semibold text-orange">
              Top up
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-2.5">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
            {props.viewer.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#4a4b44]">{props.viewer.name}</span>
          <Link href="/settings" aria-label="Settings" className="text-muted hover:text-ink">
            <SettingsIcon width={16} height={16} />
          </Link>
          <form action={props.onSignOut}>
            <button type="submit" className="text-[11px] text-muted hover:text-ink">
              Out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
