import Link from "next/link";
import { CreativesIcon, PlayIcon } from "./icons";

export function CreativeCard({
  id,
  name,
  kind,
  ratio,
  status,
  previewUrl,
  updatedAt,
  sizes,
}: {
  id: string;
  name: string;
  kind: string;
  ratio: string;
  status: string;
  previewUrl: string | null;
  updatedAt: Date;
  sizes?: { done: number; total: number };
}) {
  const ready = status === "rendered" || status === "ready";
  const label = ready
    ? "Ready"
    : status === "failed"
      ? "Failed"
      : status === "rendering"
        ? "Rendering"
        : "Draft";
  return (
    <Link href={`/creatives/${id}`} className="tile creative-card">
      <div
        className="creative-card-preview"
        style={
          previewUrl
            ? { backgroundImage: `url(${JSON.stringify(previewUrl)})` }
            : undefined
        }
      >
        {!previewUrl &&
          (kind === "static" ? (
            <CreativesIcon width={38} height={38} />
          ) : (
            <PlayIcon width={38} height={38} />
          ))}
        <span
          className={`creative-card-badge ${status === "failed" ? "failed" : ""}`}
        >
          <i />
          {label}
        </span>
        <span className="creative-card-ratio">{ratio}</span>
      </div>
      <div className="creative-card-meta">
        <strong>{name}</strong>
        <div>
          <span className="creative-type">
            {kind === "ugc"
              ? "UGC video"
              : kind === "static"
                ? "Static ad"
                : "Video"}
          </span>
          <span>
            {sizes ? `${sizes.done}/${sizes.total} sizes` : relative(updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
function relative(date: Date) {
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : `${Math.floor(mins / 1440)}d ago`;
}
