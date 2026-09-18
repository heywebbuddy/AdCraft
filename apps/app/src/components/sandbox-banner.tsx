import Link from "next/link";

/**
 * Shown on Campaigns and Performance while every connected ad account is a sandbox, so
 * simulated numbers are never mistaken for real ones.
 */
export function SandboxBanner({ where }: { where: "campaigns" | "performance" }) {
  return (
    <div className="sandbox-banner" role="status">
      <span className="sandbox-banner-chip">Sandbox</span>
      <span>
        {where === "performance"
          ? "Every connected account is a sandbox: these numbers are simulated. Connect a real Meta, TikTok or Google account to see live results."
          : "Every connected account is a sandbox: campaigns run inside Adcraft only and nothing reaches a platform. Connect a real account to publish for real."}
      </span>
      <Link href="/campaigns" className="sandbox-banner-link">Connect an account →</Link>
    </div>
  );
}
