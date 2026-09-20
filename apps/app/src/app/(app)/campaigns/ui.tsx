import { PlatformLogo } from "@/components/platform-logo";
import type { Platform } from "@adcraft/ads";

export const PLATFORM_NAMES: Record<Platform, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

const STATUS_STYLES: Record<string, string> = {
  draft: "status-chip tone-ink",
  publishing: "status-chip tone-orange",
  paused: "status-chip tone-warn",
  active: "status-chip tone-ok",
  archived: "status-chip tone-neutral",
  error: "status-chip tone-bad",
  connected: "status-chip tone-ok",
  expired: "status-chip tone-warn",
  revoked: "status-chip tone-neutral",
  approved: "status-chip tone-ok",
  pending: "status-chip tone-warn",
  disapproved: "status-chip tone-bad",
  unknown: "status-chip tone-neutral",
  sandbox: "status-chip tone-info",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.unknown}`}>
      {label ?? status[0]!.toUpperCase() + status.slice(1)}
    </span>
  );
}

export function PlatformMark({ platform, sandbox, size = 15 }: { platform: Platform; sandbox?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[12px] font-semibold">
      <PlatformLogo name={platform} size={size} />
      {PLATFORM_NAMES[platform]}
      {sandbox ? <StatusChip status="sandbox" label="Sandbox" /> : null}
    </span>
  );
}

export function money(minor: number | null | undefined, currency = "USD", opts: { compact?: boolean } = {}) {
  if (minor === null || minor === undefined) return "—";
  const v = minor / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: opts.compact && Math.abs(v) >= 1000 ? 0 : 2,
      notation: opts.compact && Math.abs(v) >= 100_000 ? "compact" : "standard",
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function integer(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function percent(p: number | null | undefined, digits = 2) {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

export function multiple(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${x.toFixed(2)}×`;
}

export function relative(d: Date | null | undefined) {
  if (!d) return "never";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const fieldClass = "w-full rounded-[7px] border border-line bg-surface px-3.5 text-[14px] text-ink outline-none placeholder:text-muted focus:border-ink";
export const chipClass =
  "inline-flex h-10 cursor-pointer select-none items-center rounded-[7px] border border-line bg-surface px-3.5 text-[13px] font-medium text-ink transition-colors hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-disabled:cursor-not-allowed has-disabled:opacity-40";

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-[#f0c9c2] bg-[#fdf1ee] text-[#b4382a]"
      : tone === "ok"
        ? "border-[#cfe3d6] bg-[#e9f3ec] text-[#3f7a55]"
        : "border-line bg-surface text-ink";
  return <div className={`rounded-[7px] border px-4 py-3 text-[13px] ${cls}`}>{children}</div>;
}
