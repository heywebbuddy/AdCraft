import Link from "next/link";
import { PlayIcon, ArrowIcon, LibraryIcon } from "@/components/icons";
import { relativeTime, type WallTileProps } from "@/components/wall-tile";

/** A quiet preview for the overview. Full metadata stays in the creative library. */
export function RecentCreative({ id, name, kind, status, previewUrl, updatedAt, live }: WallTileProps) {
  const kindLabel = kind === "static" ? "Static ad" : kind === "ugc" ? "UGC video" : "Video";
  const ready = status === "rendered" || status === "ready";
  return <Link href={kind === "static" ? `/creatives/${id}` : `/videos/${id}`} className="recent-creative" aria-label={`Open ${name}, ${kindLabel}${live ? ", live" : !ready ? ", draft" : ""}`}>
    <div className="recent-creative-preview">
      {previewUrl ? <img src={previewUrl} alt="" loading="lazy" /> : <div className="recent-creative-placeholder"><LibraryIcon width={25} height={25} /><span>Preview not available</span></div>}
      {kind !== "static" && ready ? <span className="recent-creative-play" aria-hidden="true"><PlayIcon width={11} height={11} /></span> : null}
      <span className="recent-creative-open" aria-hidden="true"><ArrowIcon width={15} height={15} /></span>
    </div>
    <div className="recent-creative-info">
      <h3 title={name}>{name}</h3>
      <div className="recent-creative-meta"><span>{kindLabel}{live ? <span className="recent-creative-live"> · Live</span> : !ready ? " · Draft" : ""}</span><time dateTime={updatedAt.toISOString()}>{relativeTime(updatedAt)}</time></div>
    </div>
  </Link>;
}
