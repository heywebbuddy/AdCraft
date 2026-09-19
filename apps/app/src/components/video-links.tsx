import Link from "next/link";
import { PlayIcon } from "@/components/icons";

/**
 * "Make a video ↗︎" link for concept cards. Drop it next to the static "Make the ad"
 * action: `<MakeVideoLink conceptId={c.id} kind={c.kind} />`. Video/UGC concepts get the
 * orange primary style; static concepts get the quiet outline so it reads as an extra.
 */
export function MakeVideoLink({ conceptId, kind, className }: { conceptId: string; kind?: "static" | "video" | "ugc"; className?: string }) {
  const primary = kind === "video" || kind === "ugc";
  const href = `/videos/new?conceptId=${conceptId}${kind === "ugc" ? "&kind=ugc" : ""}`;
  return (
    <Link href={href} className={className ?? `btn ${primary ? "btn-orange" : "btn-outline"} h-11`}>
      <PlayIcon width={12} height={12} />
      {kind === "ugc" ? "Make the UGC video" : "Make a video"} <span aria-hidden="true">↗︎</span>
    </Link>
  );
}

/** Inline text variant for tight spots (list rows, menus). */
export function MakeVideoTextLink({ conceptId, kind }: { conceptId: string; kind?: "static" | "video" | "ugc" }) {
  return (
    <Link href={`/videos/new?conceptId=${conceptId}${kind === "ugc" ? "&kind=ugc" : ""}`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-orange hover:underline">
      Make a video <span aria-hidden="true">↗︎</span>
    </Link>
  );
}
