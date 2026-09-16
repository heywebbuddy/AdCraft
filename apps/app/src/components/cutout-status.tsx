import type { CutoutStatus } from "@/server/library-data";
import { Spark } from "./spark";

export function CutoutStatusChip({ status }: { status: CutoutStatus }) {
  const cls = status === "ready" ? "text-[#3f7a55]" : status === "failed" ? "text-[#b4382a]" : "text-muted";
  const label = status === "ready" ? "Cutout ready" : status === "failed" ? "Cutout failed" : "Processing";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-[3px] text-[10px] font-semibold ${cls}`}>
      {status === "processing" ? <Spark size={11} animate="spin" className="text-orange" /> : null}
      {label}
    </span>
  );
}

/** Checkerboard used behind transparent cutouts. */
export const CHECKER_STYLE = {
  background:
    "linear-gradient(45deg,#efeee8 25%,transparent 25%,transparent 75%,#efeee8 75%) 0 0 / 18px 18px, linear-gradient(45deg,#efeee8 25%,transparent 25%,transparent 75%,#efeee8 75%) 9px 9px / 18px 18px, #fff",
} as const;
