/**
 * Builders are usable on a phone but cramped; say so once, up top, and point at what works
 * well there (reviewing, approving, commenting, pausing). CSS shows it only under 760 px.
 */
export function DesktopHint({ what = "Creating" }: { what?: string }) {
  return (
    <p className="desktop-hint" role="note">
      {what} works best on a larger screen. On your phone you can still review, approve, comment and pause — and everything you start here finishes in the background.
    </p>
  );
}
