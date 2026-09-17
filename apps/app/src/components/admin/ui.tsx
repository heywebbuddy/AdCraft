import Link from "next/link";
import type { ReactNode } from "react";
import { Spark } from "../spark";

/* Small server-side building blocks shared by every /admin page. Styles live in admin.css. */

export function Kpis({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl className="admin-kpis" aria-label={label}>
      {children}
    </dl>
  );
}

export function Kpi({ label, value, sub, href, delta }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; delta?: { text: string; tone?: "good" | "bad" } }) {
  const body = (
    <>
      <dt>{label}</dt>
      <dd>
        {value}
        {sub ? <small>{sub}</small> : null}
      </dd>
      {delta ? <span className={`admin-kpi-delta ${delta.tone ?? ""}`}>{delta.text}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className="home-stat">
      {body}
    </Link>
  ) : (
    <div className="home-stat">{body}</div>
  );
}

export function Panel({ title, eyebrow, note, action, children, className = "" }: { title?: string; eyebrow?: string; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel admin-panel ${className}`.trim()}>
      {title || eyebrow ? (
        <div className="admin-panel-head">
          <div>
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {note ? <span className="admin-panel-note">{note}</span> : null}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Table({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

export function Chip({ tone = "neutral", children, plain, code }: { tone?: "good" | "bad" | "warn" | "neutral" | "ink"; children: ReactNode; plain?: boolean; code?: boolean }) {
  return <span className={`chip ${tone === "neutral" ? "" : tone} ${plain ? "plain" : ""} ${code ? "code" : ""}`.replace(/\s+/g, " ").trim()}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="admin-empty">
      <Spark size={22} animate="breathe" />
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
    </div>
  );
}

export function Flash({ ok, error, messages }: { ok?: string; error?: string; messages: Record<string, string> }) {
  if (ok && messages[`ok:${ok}`]) return <p className="admin-flash ok">{messages[`ok:${ok}`]}</p>;
  if (error) return <p className="admin-flash error">{messages[`error:${error}`] ?? "Something went wrong."}</p>;
  return null;
}

/* ---- Formatting -------------------------------------------------------------------- */

export const money = (n: number, digits = 2) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const int = (n: number) => n.toLocaleString("en-US");
export const pct = (n: number | null, digits = 1) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);

export function fmtDate(d: Date | string | null | undefined, withTime = true) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
}

export function ago(d: Date | string | null | undefined) {
  if (!d) return "never";
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 60) return `${days}d ago`;
  return fmtDate(date, false);
}

export function statusTone(status: string): "good" | "bad" | "warn" | "neutral" {
  switch (status) {
    case "succeeded":
    case "active":
    case "connected":
      return "good";
    case "failed":
    case "error":
    case "revoked":
    case "canceled":
    case "past_due":
      return "bad";
    case "started":
    case "trialing":
    case "expired":
    case "paused":
    case "incomplete":
      return "warn";
    default:
      return "neutral";
  }
}

export const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : "—");
