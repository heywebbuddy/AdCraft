import Link from "next/link";
import { Wordmark } from "@/components/spark";
import { ThemeToggle } from "@/components/theme-toggle";
import { LEGAL_NAV } from "@/lib/legal";
import { LegalNav } from "./legal-nav";
import "./legal.css";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-shell">
      <header className="legal-top">
        <Link href="/" className="legal-wordmark" aria-label="Adcraft home">
          <Wordmark size={22} />
        </Link>
        <LegalNav />
        <div className="legal-tools">
          <ThemeToggle />
          <Link href="/sign-in" className="btn btn-dark legal-cta">
            Open the studio
          </Link>
        </div>
      </header>
      {children}
      <footer className="legal-foot">
        <span>© {new Date().getFullYear()} Adcraft</span>
        <span>
          {LEGAL_NAV.map((l, i) => (
            <span key={l.href}>
              {i ? " · " : null}
              <Link href={l.href}>{l.label}</Link>
            </span>
          ))}
        </span>
      </footer>
    </div>
  );
}
