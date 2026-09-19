"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, type ThemeName } from "@/lib/theme";

const options: Array<{ id: ThemeName; label: string; note: string }> = [
  { id: "light", label: "Light", note: "The default. Paper, ink, and a little orange." },
  { id: "dark", label: "Dark", note: "A quieter studio, same orange." },
];

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    setTheme(readTheme());
    const sync = () => setTheme(readTheme());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "adcraft-theme") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("adcraft-theme", sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("adcraft-theme", sync);
    };
  }, []);

  return (
    <div className="theme-picker" role="radiogroup" aria-label="Color theme">
      {options.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`theme-pick ${option.id}${selected ? " is-selected" : ""}`}
            onClick={() => {
              applyTheme(option.id);
              setTheme(option.id);
            }}
          >
            <span className="theme-pick-swatch" aria-hidden="true" />
            <strong>{option.label}</strong>
            <span>{option.note}</span>
          </button>
        );
      })}
    </div>
  );
}
