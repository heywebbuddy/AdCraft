"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Spark, Wordmark } from "./spark";
import "./brand-discovery.css";

const chapters = [
  { label: "Website", title: "Your brand,", accent: "at first glance.", detail: "Exploring your website and the details that make it yours." },
  { label: "Colors", title: "Finding your", accent: "signature colors.", detail: "Looking for your palette, from the quiet neutrals to the bold accents." },
  { label: "Typography", title: "Setting the", accent: "right tone.", detail: "Exploring the letterforms and type styles behind your voice." },
  { label: "Identity", title: "A mark that’s", accent: "all yours.", detail: "Looking for the logo and visual details people recognize." },
  { label: "Your studio", title: "A home for", accent: "your next idea.", detail: "Bringing it all together. Your studio will open as soon as the import finishes." },
];

const palette = [
  { name: "Terracotta", hex: "#D86A46" },
  { name: "Apricot", hex: "#E8B691" },
  { name: "Linen", hex: "#EDE5D7" },
  { name: "Sage", hex: "#89947F" },
  { name: "Forest", hex: "#303E35" },
];

function DiscoveryVisual({ chapter, hostname, brandName }: { chapter: number; hostname: string; brandName: string }) {
  if (chapter === 0) return (
    <div className="discovery-site">
      <div className="discovery-browser-bar"><span className="discovery-window-dots"><i /><i /><i /></span><span>{hostname}</span><svg viewBox="0 0 16 16" fill="none"><rect x="4" y="7" width="8" height="6" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg></div>
      <div className="discovery-site-body">
        <div className="discovery-site-nav"><b>{brandName}</b><span /><span /><span /></div>
        <div className="discovery-site-hero">
          <div className="discovery-site-copy"><span className="discovery-mini-label">YOUR WORLD, REIMAGINED</span><strong>Something<br /><em>like no other.</em></strong><span className="discovery-text-line" /><span className="discovery-text-line short" /><i /></div>
          <div className="discovery-site-image"><div className="discovery-arch" /><span className="discovery-sun" /></div>
        </div>
        <div className="discovery-site-bottom"><span /><span /><span /></div>
        <div className="discovery-scan"><span>EXPLORING</span></div>
      </div>
    </div>
  );
  if (chapter === 1) return (
    <div className="discovery-color-study">
      <div className="discovery-study-heading"><span>THE COLOR STUDY</span><span>01 — 05</span></div>
      <div className="discovery-color-strips">{palette.map((color, index) => <div key={color.hex} className="discovery-color" style={{ "--swatch": color.hex, "--delay": `${index * 120}ms` } as CSSProperties}><div className="discovery-color-block"><span>0{index + 1}</span></div><span className="discovery-color-name">{color.name}</span><code>{color.hex}</code></div>)}</div>
      <div className="discovery-study-caption"><span>Quiet foundations. A distinctive accent.</span><span>● ● ●</span></div>
    </div>
  );
  if (chapter === 2) return (
    <div className="discovery-type-study">
      <div className="discovery-study-heading"><span>A STUDY IN LETTERFORMS</span><span>Aa — Zz</span></div>
      <div className="discovery-type-pair"><div><span className="discovery-serif-sample">Aa</span><small>Character</small></div><span className="discovery-type-divider" /><div><span className="discovery-sans-sample">Aa</span><small>Clarity</small></div></div>
      <div className="discovery-alphabet">ABCDEFGHIJKLMNOPQRSTUVWXYZ<span>abcdefghijklmnopqrstuvwxyz · 0123456789</span></div>
    </div>
  );
  if (chapter === 3) return (
    <div className="discovery-mark-study">
      <div className="discovery-mark-grid"><span className="discovery-mark-corner tl" /><span className="discovery-mark-corner tr" /><span className="discovery-mark-corner bl" /><span className="discovery-mark-corner br" /><div className="discovery-mark-circle"><Spark size={103} /></div></div>
      <div className="discovery-mark-name">{brandName}</div>
      <span className="discovery-mini-label">THE DETAILS THAT MAKE YOU, YOU.</span>
    </div>
  );
  return (
    <div className="discovery-studio-card">
      <div className="discovery-studio-top"><span>YOUR CREATIVE SPACE</span><Spark size={19} /></div>
      <div className="discovery-studio-name">{brandName}<span>A new chapter<br /><em>starts here.</em></span></div>
      <div className="discovery-studio-bottom"><span>Made for what’s next.</span><span className="discovery-studio-dots"><i /><i /><i /></span></div>
    </div>
  );
}

/** This is an illustrative discovery sequence, not server-reported progress.
 * The server action owns completion; never delay its redirect to finish an animation.
 */
function DiscoveryScene({ website, brandName }: { website: string; brandName: string }) {
  const [chapter, setChapter] = useState(0);
  const [takingLonger, setTakingLonger] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasWebsite = Boolean(website);
  let hostname = "Your new creative home";
  try { hostname = new URL(website).hostname.replace(/^www\./, ""); } catch { /* Optional website. */ }

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const timers = hasWebsite
      ? [4500, 9500, 14500, 21000].map((delay, index) => window.setTimeout(() => setChapter(index + 1), delay))
      : [];
    const longWait = window.setTimeout(() => setTakingLonger(true), 40000);
    return () => { timers.forEach(window.clearTimeout); window.clearTimeout(longWait); };
  }, [hasWebsite]);

  const activeChapter = hasWebsite ? chapter : 4;
  const current = chapters[activeChapter];

  return (
    <section className="brand-discovery" data-chapter={activeChapter} aria-labelledby="discovery-title">
      <header className="discovery-header">
        <Wordmark size={25} />
        <span className="discovery-session"><i /> {hasWebsite ? "Brand discovery" : "Setting up your studio"}</span>
      </header>

      <div className="discovery-content">
        <div className="discovery-intro">
          <span className="discovery-eyebrow">{hasWebsite ? "GETTING TO KNOW YOUR BRAND" : "A SPACE FOR YOUR IDEAS"}</span>
          <h1 id="discovery-title" ref={heading} tabIndex={-1} aria-label={hasWebsite ? "Discovering your brand" : "Setting up your studio"}>
            <span key={activeChapter} className="discovery-heading-copy" aria-hidden="true">
              {current.title}<br />
              <em>{current.accent}</em>
            </span>
          </h1>
          <p className="discovery-description" role="status" aria-live="polite" aria-atomic="true">
            {hasWebsite ? current.detail : "Getting your workspace ready for fresh ideas and beautiful ads."}
          </p>
        </div>

        <div className="discovery-stage" aria-hidden="true">
          <div className="discovery-scene" key={activeChapter}>
            <DiscoveryVisual chapter={activeChapter} hostname={hostname} brandName={brandName || "Your brand"} />
          </div>
        </div>

        <div className="discovery-footer">
          {hasWebsite ? (
            <ol className="discovery-chapters" aria-label="Brand discovery animation">
              {chapters.map((item, index) => (
                <li key={item.label} className={index === chapter ? "is-current" : ""} aria-current={index === chapter ? "step" : undefined}>
                  <span className="discovery-chapter-number">{String(index + 1).padStart(2, "0")}</span><span>{item.label}</span>
                </li>
              ))}
            </ol>
          ) : <div className="discovery-studio-status"><Spark size={15} /> Preparing your creative space</div>}
          <p className="discovery-note" role="status">{takingLonger ? "Good things take a little longer. We’re still working — please keep this tab open." : "You’ll move on automatically when your studio is ready."}</p>
          <span className="discovery-preview-note">Illustrative preview · {hasWebsite ? "your brand kit is on its way" : "your studio is on its way"}</span>
        </div>
      </div>
    </section>
  );
}

/** Capture submission outside the action's transition so animation updates stay
 * responsive while React waits for the server action to resolve.
 */
export function BrandDiscovery({ children, action }: { children: ReactNode; action: (data: FormData) => Promise<void> }) {
  const [submission, setSubmission] = useState<{ website: string; brandName: string } | null>(null);
  const pending = submission !== null;
  const content = useRef<HTMLDivElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) content.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
    wasPending.current = pending;
  }, [pending]);

  return (
    <form
      className={`discovery-form${pending ? " is-discovering" : ""}`}
      onSubmit={(event) => {
        if (pending) { event.preventDefault(); return; }
        const data = new FormData(event.currentTarget);
        setSubmission({ website: String(data.get("website") ?? "").trim(), brandName: String(data.get("brandName") ?? "").trim() });
      }}
      action={async (data) => {
        try { await action(data); }
        finally { setSubmission(null); }
      }}
    >
      <div ref={content} hidden={pending} className="w-full max-w-[440px]">{children}</div>
      {submission ? <DiscoveryScene website={submission.website} brandName={submission.brandName} /> : null}
    </form>
  );
}
