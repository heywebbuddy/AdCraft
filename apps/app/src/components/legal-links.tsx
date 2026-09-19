import Link from "next/link";
import { LEGAL_NAV } from "@/lib/legal";

export function LegalLinks({ className }: { className?: string }) {
  return (
    <span className={className ?? "legal-inline"}>
      {LEGAL_NAV.map((l, i) => (
        <span key={l.href}>
          {i ? " · " : null}
          <Link href={l.href}>{l.label}</Link>
        </span>
      ))}
    </span>
  );
}
