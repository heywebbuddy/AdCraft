"use client";

import { useState } from "react";

/** Copies `text` to the clipboard; falls back to selecting nothing but showing the value. */
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("Copy this value", text);
        }
      }}
      className={`btn btn-outline h-9 px-3 text-[12px] ${className}`}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
