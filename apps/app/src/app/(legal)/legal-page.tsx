import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DOCS, LEGAL_NAV, LEGAL_UPDATED, type LegalDoc } from "@/lib/legal";

export function legalMetadata(slug: LegalDoc["slug"]): Metadata {
  const doc = LEGAL_DOCS[slug];
  return { title: `${doc.title} · Adcraft`, description: doc.lede };
}

export function LegalArticle({ slug }: { slug: LegalDoc["slug"] }) {
  const doc = LEGAL_DOCS[slug];
  return (
    <main className="legal-main">
      <div className="legal-kicker">{doc.kicker}</div>
      <h1>{doc.title}</h1>
      <p className="legal-lede">{doc.lede}</p>
      <p className="legal-updated">Last updated {LEGAL_UPDATED}.</p>
      <p className="legal-notice">
        This is the working policy for the product as it ships. Have a lawyer review it before you take paid
        customers, and replace the contact addresses if they are not yours yet.
      </p>
      {doc.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.bullets ? (
            <ul>
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <nav aria-label="Other legal pages">
        <p>
          Also:{" "}
          {LEGAL_NAV.filter((l) => l.slug !== slug).map((l, i) => (
            <span key={l.href}>
              {i ? " · " : null}
              <Link href={l.href}>{l.label}</Link>
            </span>
          ))}
          .
        </p>
      </nav>
    </main>
  );
}
