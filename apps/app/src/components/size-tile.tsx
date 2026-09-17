import type { ReactNode } from "react";
import { Spark } from "./spark";

/**
 * A rendered size (one placement of a creative) in the same uniform 4:5 frame as
 * the wall tiles: the render sits inside at its true ratio on a blurred backdrop.
 * Used by the review page, the video page and share pages so mixed ratios line up.
 */
const ratioValue: Record<string, string> = { "1:1": "1 / 1", "4:5": "4 / 5", "9:16": "9 / 16", "16:9": "16 / 9", "1.91:1": "1.91 / 1" };

export type SizeTileStatus = "ready" | "rendering" | "failed" | "waiting";

export function SizeTile({
  label,
  ratio,
  width,
  height,
  status,
  imageUrl,
  posterUrl,
  videoUrl,
  placeholder,
  children,
  footer,
}: {
  label: string;
  ratio: string;
  width?: number;
  height?: number;
  status: SizeTileStatus;
  /** Rendered still (PNG) for image sizes. */
  imageUrl?: string | null;
  /** Poster frame for video sizes. */
  posterUrl?: string | null;
  /** When set, the frame plays the video inline. */
  videoUrl?: string | null;
  /** Background for missing renders. */
  placeholder?: string;
  /** Overlaid inside the art (e.g. a headline when no render exists). */
  children?: ReactNode;
  /** Extra footer row (download links, etc). */
  footer?: ReactNode;
}) {
  const still = imageUrl ?? posterUrl ?? null;
  const orient = ratio === "9:16" || ratio === "4:5" ? "tall" : "wide";
  const badge = status === "ready" ? "Ready" : status === "failed" ? "Failed" : status === "rendering" ? "Rendering" : "Waiting";
  const badgeClass = status === "ready" ? "rendered" : status === "failed" ? "failed" : status === "rendering" ? "rendering" : "";
  return (
    <div className="wall-tile size-tile">
      <div className="wall-art" style={still ? undefined : { background: placeholder ?? "linear-gradient(160deg, #eef0e6 0%, #dfe3d3 100%)" }}>
        {still ? <span className="wall-backdrop" style={{ backgroundImage: `url(${still})` }} aria-hidden="true" /> : null}
        {videoUrl ? (
          <video
            controls
            playsInline
            preload="metadata"
            src={videoUrl}
            poster={posterUrl ?? undefined}
            className="wall-frame size-tile-video"
            data-orient={orient}
            style={{ aspectRatio: ratioValue[ratio] ?? "4 / 5" }}
          />
        ) : still ? (
          <span className="wall-frame" data-orient={orient} style={{ aspectRatio: ratioValue[ratio] ?? "4 / 5", backgroundImage: `url(${still})` }} />
        ) : (
          children
        )}
        <span className={`wall-badge ${badgeClass}`}>
          {status === "rendering" ? <Spark size={11} animate="spin" /> : <i />}
          {badge}
        </span>
        <span className="wall-ratio">{ratio}</span>
      </div>
      <div className="wall-meta">
        <div className="size-tile-label">
          <strong>{label}</strong>
          {width && height ? (
            <span className="tabular">
              {width}×{height}
            </span>
          ) : null}
        </div>
        {footer ? <div className="size-tile-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
