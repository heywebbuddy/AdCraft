"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_NAV } from "@/lib/legal";

export function LegalNav() {
  const path = usePathname();
  return (
    <nav className="legal-nav" aria-label="Legal">
      {LEGAL_NAV.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href || path.startsWith(`${l.href}/`) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
