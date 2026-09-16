import type { RenderSize } from "./document";

/**
 * Geometry shared by all templates: pixel scale, safe-zone-aware padding and
 * the orientation flags that drive per-ratio layout decisions.
 */
export interface Frame {
  W: number;
  H: number;
  /** Typography scale: 1 at 1080px on the short edge. */
  s: number;
  pad: { top: number; right: number; bottom: number; left: number };
  landscape: boolean;
  /** 9:16 and other very tall formats. */
  tall: boolean;
  /** Width / height. */
  aspect: number;
}

export function frameFor(size: RenderSize): Frame {
  const { width: W, height: H } = size;
  const short = Math.min(W, H);
  const s = short / 1080;
  const base = Math.round(short * 0.065);
  const sz = size.safeZone ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    W,
    H,
    s,
    pad: {
      top: Math.max(base, sz.top),
      right: Math.max(base, sz.right),
      bottom: Math.max(base, sz.bottom),
      left: Math.max(base, sz.left),
    },
    landscape: W / H > 1.2,
    tall: H / W > 1.5,
    aspect: W / H,
  };
}

/** Headline size in px for this frame, honouring the document's 1080-wide base size. */
export function headlinePx(f: Frame, base: number, mult = 1): number {
  const ratioAdj = f.landscape ? 0.8 : f.tall ? 0.95 : 1;
  return Math.round(base * f.s * ratioAdj * mult);
}

/** Relative luminance of a hex colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.padEnd(6, "0");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink or paper, whichever reads better on the given background. */
export function contrastOn(bg: string, dark = "#242521", light = "#ffffff"): string {
  return luminance(bg) > 0.45 ? dark : light;
}

export function rgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.padEnd(6, "0");
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
