"use client";

import { useEffect } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { applyTheme, readTheme, toggleTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  useEffect(() => {
    applyTheme(readTheme());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "adcraft-theme") applyTheme(e.newValue === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      data-theme-toggle
      aria-label="Switch to dark mode"
      aria-pressed="false"
      onClick={toggleTheme}
    >
      <MoonIcon width={16} height={16} />
      <SunIcon width={16} height={16} />
    </button>
  );
}
