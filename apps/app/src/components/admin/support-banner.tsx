import { exitSupportMode } from "@/server/admin-actions";
import "./support-banner.css";

/** Thin orange strip shown across the customer app while a platform admin is viewing an org as support. */
export function SupportBanner({ orgName }: { orgName: string }) {
  return (
    <div className="support-banner" role="status">
      <span>
        Viewing <strong>{orgName}</strong> as support
      </span>
      <form action={exitSupportMode}>
        <button type="submit">Exit</button>
      </form>
    </div>
  );
}
