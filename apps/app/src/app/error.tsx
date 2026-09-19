"use client";

import { useEffect, useState } from "react";
import { unstable_isUnrecognizedActionError as isUnrecognizedActionError } from "next/navigation";

/**
 * Route error boundary. Two cases matter:
 * - Deployment skew: the tab was opened before a deploy, so a form's Server Action id no longer
 *   exists on the server. Nothing is wrong with the user's data — reload once to pick up the new
 *   build (guarded so a genuinely broken build cannot loop).
 * - Anything else: a plain message with the digest for support, and a way back.
 */
export default function RouteError({ error: raw, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const error = raw as Error & { digest?: string };
  const message = String((error as { message?: string }).message ?? "");
  const skew = isUnrecognizedActionError(raw) || /Server Action .* (was not found|older or newer deployment)/i.test(message);
  const [reloading, setReloading] = useState(skew);

  useEffect(() => {
    if (!skew) {
      console.error("[adcraft] route error", error.digest ?? "", error);
      return;
    }
    // Reload once. The marker is a timestamp so a build that keeps failing shows the manual
    // message instead of looping, and no cleanup is needed for it to expire.
    const KEY = "adcraft-skew-reload";
    let recent = false;
    try {
      recent = Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 30_000;
    } catch {}
    if (recent) {
      setReloading(false);
      return;
    }
    const t = setTimeout(() => {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
      window.location.reload();
    }, 600);
    return () => clearTimeout(t);
  }, [skew, error]);

  return (
    <div className="route-error" role="alert">
      <div className="route-error-card">
        <span className="route-error-mark" aria-hidden="true">✳</span>
        {reloading ? (
          <>
            <h1>Adcraft was just updated.</h1>
            <p>Reloading this page so it matches the new version…</p>
          </>
        ) : (
          <>
            <h1>Something went wrong on this page.</h1>
            <p>
              {skew
                ? "This page was opened before an update. Reload it to continue — nothing you did was lost."
                : "Your work is saved on the server. Try the page again; if it keeps failing, send us the code below."}
            </p>
            <div className="route-error-actions">
              <button type="button" className="btn btn-dark" onClick={() => (skew ? window.location.reload() : reset())}>
                {skew ? "Reload" : "Try again"}
              </button>
              <a className="btn btn-outline" href="/dashboard">Go to overview</a>
            </div>
            {error.digest ? <code className="route-error-digest">ref {error.digest}</code> : null}
          </>
        )}
      </div>
    </div>
  );
}
