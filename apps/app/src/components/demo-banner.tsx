import { START_OWN_WORKSPACE_HREF } from "@/lib/demo";
import "./demo-banner.css";

/**
 * Slim strip across the studio and the admin panel while a visitor is in the shared read-only
 * demo (DEMO_MODE). Presentation only: the server refuses demo writes either way.
 */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <span>
        You’re exploring a <strong>read-only demo</strong>
      </span>
      <span aria-hidden="true">·</span>
      <a href={START_OWN_WORKSPACE_HREF}>Start your own workspace ↗︎</a>
    </div>
  );
}
