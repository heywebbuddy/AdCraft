"use client";

/** Last-resort boundary for errors thrown by the root layout itself; keeps its own markup. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f8f7f3", color: "#242521", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: 32, maxWidth: 420 }}>
          <div style={{ color: "#e65c32", fontSize: 28 }} aria-hidden="true">✳</div>
          <h1 style={{ fontSize: 22, margin: "12px 0 8px", fontWeight: 500 }}>Adcraft hit a problem.</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#66685f", margin: "0 0 20px" }}>Your work is saved. Reload to continue; if it keeps happening, send us the reference below.</p>
          <button type="button" onClick={() => (typeof window !== "undefined" ? window.location.reload() : reset())} style={{ font: "inherit", fontSize: 14, fontWeight: 600, background: "#242521", color: "#fff", border: 0, borderRadius: 7, padding: "10px 18px", cursor: "pointer" }}>
            Reload
          </button>
          {error.digest ? <p style={{ fontSize: 11, color: "#8a8c82", marginTop: 16 }}>ref {error.digest}</p> : null}
        </div>
      </body>
    </html>
  );
}
