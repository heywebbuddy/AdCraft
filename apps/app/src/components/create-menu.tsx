"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * One entrance for everything you can make. Each item lands in the matching flow with the
 * brief as its first step. Styles: workspace.css (.create-*).
 */
const ITEMS = [
  { href: "/briefs/new?format=static", title: "Static ad", detail: "Every size · 2 credits", tone: "peach", glyph: "▣" },
  { href: "/briefs/new?format=video", title: "Product video", detail: "15 s scenes · 20 credits", tone: "sage", glyph: "▶" },
  { href: "/characters", title: "Presenter video", detail: "A character speaks · 40 credits", tone: "lavender", glyph: "☺" },
  { href: "/briefs/bulk", title: "Many at once", detail: "CSV of products → briefs", tone: "sand", glyph: "≡" },
];

export function CreateMenu() {
  const details = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => { details.current?.removeAttribute("open"); }, [pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (details.current?.open && !details.current.contains(e.target as Node)) details.current.removeAttribute("open"); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <details ref={details} className="create-menu">
      <summary className="sidebar-create btn btn-orange" aria-label="Create">
        <span>＋</span> Create <span className="create-caret" aria-hidden="true">▾</span>
      </summary>
      <div className="create-pop">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={`create-item tone-${it.tone}`}>
            <span className="create-glyph" aria-hidden="true">{it.glyph}</span>
            <span className="create-text"><strong>{it.title}</strong><small>{it.detail}</small></span>
          </Link>
        ))}
      </div>
    </details>
  );
}
