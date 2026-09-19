import type { SVGProps } from "react";

/**
 * The Adcraft spark: the ✳︎ brand mark drawn as an SVG so it can sit in buttons,
 * badges and loaders at any size, and animate.
 *
 * - `animate="spin"`   — the working state (generating, rendering, submitting)
 * - `animate="breathe"` — a quiet idle pulse (queue empty, waiting for the first sync)
 * - default            — static mark
 *
 * Motion respects prefers-reduced-motion (see workspace.css .spark-*).
 */
export function Spark({
  size = 16,
  animate,
  className = "",
  title,
  ...rest
}: { size?: number; animate?: "spin" | "breathe"; className?: string; title?: string } & Omit<SVGProps<SVGSVGElement>, "width" | "height">) {
  // Eight tapered spokes, slightly wider at the tip, like the wordmark glyph.
  const spokes = [0, 45, 90, 135].map((deg) => (
    <path key={deg} d="M-1.5 0 L-3.2 -44 L3.2 -44 L1.5 0 L3.2 44 L-3.2 44 Z" transform={`rotate(${deg})`} />
  ));
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      fill="currentColor"
      className={`spark ${animate ? `spark-${animate}` : ""} ${className}`.trim()}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {spokes}
    </svg>
  );
}

/** Brand wordmark with the spark: `✳︎ adcraft.` */
export function Wordmark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`wordmark ${className}`.trim()} style={{ fontSize: size }}>
      <Spark size={Math.round(size * 1.15)} className="wordmark-spark" />
      adcraft<b>.</b>
    </span>
  );
}
