export type ThemeName = "light" | "dark";

export const THEME_STORAGE_KEY = "adcraft-theme";
export const THEME_LIGHT_META = "#f8f7f3";
export const THEME_DARK_META = "#14130f";

/** Runs in <head> before paint so the first frame matches the saved choice. Light is the default. */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export function readTheme(): ThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemeName) {
  const next: ThemeName = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? THEME_DARK_META : THEME_LIGHT_META);
  document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
    el.setAttribute("aria-label", next === "dark" ? "Switch to light mode" : "Switch to dark mode");
    el.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
  });
  window.dispatchEvent(new Event("adcraft-theme"));
}

export function toggleTheme() {
  applyTheme(readTheme() === "dark" ? "light" : "dark");
}
