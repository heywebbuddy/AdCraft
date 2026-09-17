import Link from "next/link";
import { PlayIcon } from "./icons";
import { Spark } from "./spark";
import { getModel } from "@adcraft/ai";

const friendlyModel = (id: string | null | undefined) =>
  id ? (id === "sample" ? "Sample" : getModel(id)?.label ?? (id === "claude-opus-5" ? "Claude Opus 5" : id)) : "";

/**
 * The creative "wall" tile: a creative shown at its real aspect ratio, with status,
 * ratio, and, when it is running in a campaign, its live numbers. Shared by the
 * dashboard and the creatives page. Styles live in workspace.css (.wall-*).
 */

export const wallPlaceholders = [
  "linear-gradient(160deg, #eef0e6 0%, #dfe3d3 100%)",
  "linear-gradient(160deg, #f1ebe1 0%, #e3d9c9 100%)",
  "linear-gradient(160deg, #e6ece6 0%, #d3ddd4 100%)",
  "linear-gradient(160deg, #ece9e3 0%, #dad5cc 100%)",
];

const ratioValue: Record<string, string> = { "1:1": "1 / 1", "4:5": "4 / 5", "9:16": "9 / 16", "16:9": "16 / 9", "1.91:1": "1.91 / 1" };
const platformLabel: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };

export type WallTileStatus = "rendered" | "ready" | "rendering" | "failed" | "draft";

export type WallTileProps = {
  id: string;
  name: string;
  kind: "static" | "video" | "ugc";
  ratio: string;
  status: WallTileStatus;
  previewUrl: string | null;
  headline?: string | null;
  model?: string | null;
  updatedAt: Date;
  sizes?: { done: number; total: number };
  live?: { platform: string; ctr: number; roas: number | null } | null;
  index?: number;
};

export function relativeTime(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function WallTile({ id, name, kind, ratio, status, previewUrl, headline, model, updatedAt, sizes, live, index = 0 }: WallTileProps) {
  const done = status === "rendered" || status === "ready";
  const badgeClass = done ? "rendered" : status === "failed" ? "failed" : status === "rendering" ? "rendering" : "";
  const badge = done ? (live ? "Live" : "Ready") : status === "failed" ? "Failed" : status === "rendering" ? "Rendering" : "Draft";
  const kindLabel = kind === "static" ? "Static ad" : kind === "ugc" ? "UGC video" : "Video";
  return (
    <Link href={kind === "static" ? `/creatives/${id}` : `/videos/${id}`} className="wall-tile">
      <div className="wall-art" style={previewUrl ? undefined : { background: wallPlaceholders[index % wallPlaceholders.length] }}>
        {previewUrl ? (
          <>
            {/* Soft blur of the same image fills the frame behind the letterboxed creative. */}
            <span className="wall-backdrop" style={{ backgroundImage: `url(${previewUrl})` }} aria-hidden="true" />
            <span
              className="wall-frame"
              data-orient={ratio === "9:16" || ratio === "4:5" ? "tall" : "wide"}
              style={{ aspectRatio: ratioValue[ratio] ?? "4 / 5", backgroundImage: `url(${previewUrl})` }}
            />
          </>
        ) : headline ? (
          <span className="wall-headline">{headline}</span>
        ) : null}
        {kind !== "static" && done ? (
          <span className="wall-play">
            <PlayIcon width={13} height={13} />
          </span>
        ) : null}
        <span className={`wall-badge ${badgeClass}`}>
          {status === "rendering" ? <Spark size={11} animate="spin" /> : <i />}
          {badge}
        </span>
        <span className="wall-ratio">{ratio}</span>
      </div>
      <div className="wall-meta">
        <div className="wall-row">
          <strong>{name}</strong>
          <span className="tabular">{relativeTime(updatedAt)}</span>
        </div>
        <div className="wall-row wall-sub">
          <span>{live ? (platformLabel[live.platform] ?? live.platform) : kindLabel}</span>
          {live ? (
            <span className="tabular">
              <b>{(live.ctr * 100).toFixed(1)}%</b> CTR{live.roas != null ? <> · <b>{live.roas.toFixed(1)}×</b></> : null}
            </span>
          ) : sizes ? (
            <span className="tabular">
              {sizes.done}/{sizes.total} sizes
            </span>
          ) : (
            <span>{friendlyModel(model)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
