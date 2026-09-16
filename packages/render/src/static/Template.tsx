import type { CSSProperties } from "react";
import type { PlacementSpec } from "@adcraft/specs";

/**
 * Layered static ad document (PLAN.md §4 "Static ad rendering").
 * Rendered React -> PNG via Satori or Playwright. TODO: wire the renderer.
 */
export interface StaticAdDocument {
  placementId: string;
  layers: {
    scene: { src: string };
    product?: { src: string; x: number; y: number; w: number; h: number };
    logo?: { src: string; x: number; y: number; w: number };
    headline: { text: string; color: string; font: string; size: number; x: number; y: number; w: number };
    cta: { text: string; bg: string; color: string; x: number; y: number };
  };
}

export interface TemplateProps {
  spec: PlacementSpec;
  doc: StaticAdDocument;
}

const abs = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: w,
  height: h,
});

export function Template({ spec, doc }: TemplateProps) {
  const { scene, product, logo, headline, cta } = doc.layers;
  return (
    <div
      style={{
        position: "relative",
        width: spec.width,
        height: spec.height,
        overflow: "hidden",
        backgroundColor: "#000",
        display: "flex",
      }}
    >
      <img src={scene.src} alt="" style={{ ...abs(0, 0, spec.width, spec.height), objectFit: "cover" }} />
      {product ? <img src={product.src} alt="" style={{ ...abs(product.x, product.y, product.w, product.h), objectFit: "contain" }} /> : null}
      {logo ? <img src={logo.src} alt="" style={abs(logo.x, logo.y, logo.w)} /> : null}
      <div
        style={{
          ...abs(headline.x, headline.y, headline.w),
          color: headline.color,
          fontFamily: headline.font,
          fontSize: headline.size,
          fontWeight: 700,
          lineHeight: 1.1,
          display: "flex",
        }}
      >
        {headline.text}
      </div>
      <div
        style={{
          ...abs(cta.x, cta.y),
          backgroundColor: cta.bg,
          color: cta.color,
          padding: "20px 40px",
          borderRadius: 999,
          fontSize: 36,
          fontWeight: 600,
          display: "flex",
        }}
      >
        {cta.text}
      </div>
    </div>
  );
}
