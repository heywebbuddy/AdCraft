/**
 * Server-rendered SVG charts following the dataviz rules: one axis, thin 1px marks,
 * 2px series line, area fill only under a single series, tabular numbers, text in
 * ink/muted (never the series colour). Orange is the single series accent.
 */
const ORANGE = "#e65c32";
const LINE = "#e4e3dc";
const MUTED = "#75756d";

export type Point = { date: string; value: number };

function niceMax(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function SeriesChart({
  points,
  format,
  area = false,
  height = 180,
  ariaLabel,
}: {
  points: Point[];
  format: (v: number) => string;
  area?: boolean;
  height?: number;
  ariaLabel: string;
}) {
  const width = 560;
  const pad = { top: 12, right: 12, bottom: 24, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const n = points.length;
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${path} L${x(n - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const last = points[n - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block h-auto w-full" style={{ fontVariantNumeric: "tabular-nums" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={LINE} strokeWidth={1} />
          <text x={pad.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={MUTED} fontFamily="inherit">
            {format(t)}
          </text>
        </g>
      ))}
      {n > 0 ? (
        <>
          <text x={x(0)} y={height - 8} textAnchor="start" fontSize={10} fill={MUTED} fontFamily="inherit">
            {shortDate(points[0]!.date)}
          </text>
          <text x={x(n - 1)} y={height - 8} textAnchor="end" fontSize={10} fill={MUTED} fontFamily="inherit">
            {shortDate(last!.date)}
          </text>
          {area ? <path d={areaPath} fill={ORANGE} fillOpacity={0.12} /> : null}
          <path d={path} fill="none" stroke={ORANGE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(n - 1)} cy={y(last!.value)} r={3} fill="#fff" stroke={ORANGE} strokeWidth={2} />
        </>
      ) : null}
    </svg>
  );
}

export function Sparkline({ values, width = 96, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const n = values.length;
  const max = Math.max(...values, 0) || 1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * (width - 2) + 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <path d={d} fill="none" stroke={ORANGE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Delta({ now, prev, invert = false, format }: { now: number | null; prev: number | null; invert?: boolean; format?: (v: number) => string }) {
  if (now === null || prev === null || !prev) return <span className="text-[11px] text-muted">vs previous period: —</span>;
  const change = (now - prev) / Math.abs(prev);
  const good = invert ? change < 0 : change > 0;
  const flat = Math.abs(change) < 0.005;
  return (
    <span className={`tabular text-[11px] ${flat ? "text-muted" : good ? "text-[#3f7a55]" : "text-[#b4382a]"}`}>
      {flat ? "→" : change > 0 ? "↑" : "↓"} {Math.abs(change * 100).toFixed(0)}%{" "}
      <span className="text-muted">
        vs prev{format ? ` (${format(prev)})` : ""}
      </span>
    </span>
  );
}
