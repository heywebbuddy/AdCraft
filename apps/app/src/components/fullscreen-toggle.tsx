"use client";

import { useEffect, useState } from "react";

/**
 * Puts the whole app into the browser's full-screen mode (and back). Hidden where the
 * Fullscreen API is unavailable (iPhone Safari). Also bound to ⌘⇧F / Ctrl+Shift+F.
 */
export function FullscreenToggle({ className = "" }: { className?: string }) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenEnabled?: boolean };
    setSupported(Boolean(document.fullscreenEnabled || doc.webkitFullscreenEnabled));
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggle();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("keydown", key);
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`theme-toggle fullscreen-toggle ${className}`.trim()}
      aria-label={active ? "Exit full screen" : "Full screen"}
      aria-pressed={active}
      title={active ? "Exit full screen (⌘⇧F)" : "Full screen (⌘⇧F)"}
      onClick={() => void toggle()}
    >
      {active ? (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      ) : (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      )}
    </button>
  );
}

async function toggle() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {
    // Denied (no user gesture, or an embedded context) — nothing to recover.
  }
}
