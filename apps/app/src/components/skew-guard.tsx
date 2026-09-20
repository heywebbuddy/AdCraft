"use client";

import { useEffect } from "react";

/**
 * Recovers from deployment skew. When we deploy while a tab is open, that tab asks the new
 * server for chunks and route payloads from the old build; the router throws and Next shows its
 * raw "Application error" page. Reload once (a full navigation always lands on the new build),
 * guarded by a timestamp so a genuinely broken build cannot loop.
 */
const KEY = "adcraft-skew-reload";
const SKEW = /loading chunk|chunkloaderror|failed to fetch dynamically imported|importing a module script failed|failed to load script|server action .* (was not found|older or newer deployment)|failed to find server action/i;

export function SkewGuard() {
  useEffect(() => {
    const recover = (raw: unknown) => {
      const message = raw instanceof Error ? `${raw.name}: ${raw.message}` : String(raw ?? "");
      if (!SKEW.test(message)) return;
      try {
        if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 30_000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* private mode: reload anyway, the browser will not loop fast */
      }
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => recover(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => recover(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
