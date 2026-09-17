import type { Ratio } from "@adcraft/specs";

/**
 * Layered static ad document (PLAN.md §4 "Static ad rendering").
 *
 * The AI only paints the scene layer. Headline, subhead, CTA, logo and product cutout
 * are composed by our template engine, so text and brand colours are exact and
 * resizing to any placement is free.
 */
export type StaticTemplate = "hero" | "split" | "minimal" | "bold";

export type SceneLayer =
  | { kind: "image"; key?: string; url?: string }
  | { kind: "gradient"; from: string; to: string; angle: number };

export type ProductLayer = {
  cutoutKey?: string;
  cutoutUrl?: string;
  /** 0.2–1.5, relative to the template's default product box. */
  scale: number;
  /** -1..1 nudge in each axis, relative to the template's default position. */
  x: number;
  y: number;
};

export type BrandLayer = {
  name: string;
  logoUrl?: string;
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string };
};

export type LayoutOptions = {
  align: "left" | "center";
  /** Headline size in px at 1080 wide; templates scale it per ratio. */
  headlineSize: number;
  /** 0–1 strength of the legibility gradient over the scene. */
  overlay: number;
};

export type StaticGenerationMode = "editable" | "ai";
export interface StaticAdDocument {
  /** Older documents are editable. AI artwork already includes all copy and branding. */
  mode?: StaticGenerationMode;
  artwork?: Partial<Record<Ratio, { key: string }>>;
  template: StaticTemplate;
  scene: SceneLayer;
  product: ProductLayer | null;
  headline: string;
  subhead?: string;
  cta: string;
  brand: BrandLayer;
  layout: LayoutOptions;
  /** Free-form generation metadata (image model, prompt) — not rendered. */
  meta?: Record<string, unknown>;
}

export interface RenderSize {
  width: number;
  height: number;
  ratio: Ratio;
  /** Pixel insets that must stay free of text/logo (from the placement spec). */
  safeZone?: { top: number; right: number; bottom: number; left: number };
}

export const STATIC_TEMPLATES: Array<{ id: StaticTemplate; label: string; blurb: string }> = [
  { id: "hero", label: "Hero", blurb: "Full-bleed scene, headline low-left, product bottom-right." },
  { id: "split", label: "Split", blurb: "Brand colour block with copy, scene and product on the other half." },
  { id: "minimal", label: "Minimal", blurb: "Quiet scene, small serif headline, product centred." },
  { id: "bold", label: "Bold", blurb: "Oversized headline across the top, product large and centred." },
];

export const DEFAULT_LAYOUT: LayoutOptions = { align: "left", headlineSize: 84, overlay: 0.55 };

export const DEFAULT_PRODUCT: Omit<ProductLayer, "cutoutKey" | "cutoutUrl"> = { scale: 1, x: 0, y: 0 };

/** Build a document with every field present, filling gaps with sensible defaults. */
export function normalizeDocument(doc: Partial<StaticAdDocument> & Pick<StaticAdDocument, "headline" | "cta" | "brand">): StaticAdDocument {
  return {
    mode: doc.mode === "ai" ? "ai" : "editable",
    artwork: doc.artwork,
    template: doc.template ?? "hero",
    scene: doc.scene ?? { kind: "gradient", from: doc.brand.colors.primary, to: doc.brand.colors.accent, angle: 160 },
    product: doc.product ? { ...DEFAULT_PRODUCT, ...doc.product } : null,
    headline: doc.headline,
    subhead: doc.subhead,
    cta: doc.cta,
    brand: doc.brand,
    layout: { ...DEFAULT_LAYOUT, ...(doc.layout ?? {}) },
    meta: doc.meta,
  };
}

/** Stable hash input for idempotent rendering: everything that affects pixels. */
export function documentRenderKey(doc: StaticAdDocument): string {
  const { meta: _meta, ...rest } = doc;
  return JSON.stringify(rest);
}
