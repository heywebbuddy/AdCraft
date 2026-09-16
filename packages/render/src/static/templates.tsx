import type { CSSProperties, ReactNode } from "react";
import type { StaticAdDocument } from "./document";
import { clamp, contrastOn, headlinePx, rgba, type Frame } from "./layout";

/**
 * The four static templates. Everything here must stay inside satori's CSS subset:
 * flex only (no grid), explicit `display: flex` on any element with several
 * children, absolute positioning, linear gradients, object-fit on <img>.
 */
export interface TemplateContext {
  doc: StaticAdDocument;
  f: Frame;
  /** Font family names that actually loaded; templates fall back to DM Sans. */
  fonts: Set<string>;
  /** Scene image as a data: URL (or undefined for gradient scenes). */
  sceneSrc?: string;
  /** Product cutout as a data: URL. */
  productSrc?: string;
  /** Logo as a data: URL. */
  logoSrc?: string;
}

const SERIF = "Instrument Serif";

function headingFamily(ctx: TemplateContext) {
  const want = ctx.doc.brand.fonts.heading?.trim();
  return want && ctx.fonts.has(want) ? want : "DM Sans";
}
function bodyFamily(ctx: TemplateContext) {
  const want = ctx.doc.brand.fonts.body?.trim();
  return want && ctx.fonts.has(want) ? want : "DM Sans";
}

// ---------- shared layers ----------

function Scene({ ctx, style }: { ctx: TemplateContext; style?: CSSProperties }) {
  const { doc, f } = ctx;
  const box: CSSProperties = { position: "absolute", left: 0, top: 0, width: f.W, height: f.H, ...style };
  if (doc.scene.kind === "image" && ctx.sceneSrc) {
    return <img src={ctx.sceneSrc} style={{ ...box, objectFit: "cover" }} />;
  }
  const g = doc.scene.kind === "gradient" ? doc.scene : { from: doc.brand.colors.primary, to: doc.brand.colors.accent, angle: 160 };
  return <div style={{ ...box, display: "flex", backgroundImage: `linear-gradient(${g.angle}deg, ${g.from} 0%, ${g.to} 100%)` }} />;
}

/** Dark gradient from the given edge for text legibility. */
function Overlay({ f, strength, from = "bottom", style }: { f: Frame; strength: number; from?: "bottom" | "top" | "left"; style?: CSSProperties }) {
  const a = clamp(strength, 0, 1);
  if (a === 0) return null;
  const dir = from === "bottom" ? "0deg" : from === "top" ? "180deg" : "90deg";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: f.W,
        height: f.H,
        display: "flex",
        backgroundImage: `linear-gradient(${dir}, rgba(0,0,0,${(a * 0.92).toFixed(3)}) 0%, rgba(0,0,0,${(a * 0.55).toFixed(3)}) 38%, rgba(0,0,0,0) 72%)`,
        ...style,
      }}
    />
  );
}

function Logo({ ctx, color, size = 1 }: { ctx: TemplateContext; color: string; size?: number }) {
  const { f, doc } = ctx;
  const h = Math.round(44 * f.s * size);
  if (ctx.logoSrc) {
    return <img src={ctx.logoSrc} style={{ height: h, width: Math.round(h * 4), objectFit: "contain", objectPosition: "left center" }} />;
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(8 * f.s),
        fontFamily: headingFamily(ctx),
        fontWeight: 700,
        fontSize: Math.round(26 * f.s * size),
        letterSpacing: Math.round(2 * f.s),
        textTransform: "uppercase",
        color,
        lineHeight: 1,
      }}
    >
      <div style={{ width: Math.round(10 * f.s), height: Math.round(10 * f.s), borderRadius: 999, backgroundColor: doc.brand.colors.accent, display: "flex" }} />
      {doc.brand.name}
    </div>
  );
}

function Cta({ ctx, size = 1, style }: { ctx: TemplateContext; size?: number; style?: CSSProperties }) {
  const { f, doc } = ctx;
  const bg = doc.brand.colors.accent;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        color: contrastOn(bg),
        fontFamily: bodyFamily(ctx),
        fontWeight: 600,
        fontSize: Math.round(30 * f.s * size),
        lineHeight: 1,
        padding: `${Math.round(22 * f.s * size)}px ${Math.round(40 * f.s * size)}px`,
        borderRadius: 999,
        ...style,
      }}
    >
      {doc.cta}
    </div>
  );
}

function Headline({ ctx, color, mult = 1, family, weight = 700, italic = false, style }: {
  ctx: TemplateContext;
  color: string;
  mult?: number;
  family?: string;
  weight?: 400 | 600 | 700;
  italic?: boolean;
  style?: CSSProperties;
}) {
  const { f, doc } = ctx;
  const px = headlinePx(f, doc.layout.headlineSize, mult);
  return (
    <div
      style={{
        display: "flex",
        fontFamily: family ?? headingFamily(ctx),
        fontWeight: weight,
        fontStyle: italic ? "italic" : "normal",
        fontSize: px,
        lineHeight: 1.02,
        letterSpacing: Math.round(-px * 0.03),
        color,
        textAlign: doc.layout.align,
        ...style,
      }}
    >
      {doc.headline}
    </div>
  );
}

function Subhead({ ctx, color, style }: { ctx: TemplateContext; color: string; style?: CSSProperties }) {
  const { f, doc } = ctx;
  if (!doc.subhead) return null;
  return (
    <div
      style={{
        display: "flex",
        fontFamily: bodyFamily(ctx),
        fontWeight: 400,
        fontSize: Math.round(30 * f.s),
        lineHeight: 1.3,
        color,
        opacity: 0.88,
        textAlign: doc.layout.align,
        ...style,
      }}
    >
      {doc.subhead}
    </div>
  );
}

/**
 * Product cutout inside a box. `box` is the template's default; the document's
 * scale/x/y nudge it. Anchored bottom-right by default.
 */
function Product({ ctx, box, anchor = "bottom-right" }: {
  ctx: TemplateContext;
  box: { w: number; h: number; right?: number; left?: number; bottom?: number; top?: number };
  anchor?: "bottom-right" | "center" | "bottom-center";
}) {
  const { f, doc } = ctx;
  if (!ctx.productSrc || !doc.product) return null;
  const scale = clamp(doc.product.scale, 0.2, 1.6);
  const w = Math.round(box.w * scale);
  const h = Math.round(box.h * scale);
  const dx = Math.round(doc.product.x * f.W * 0.25);
  const dy = Math.round(doc.product.y * f.H * 0.25);
  const pos: CSSProperties = { position: "absolute", width: w, height: h };
  if (anchor === "center") {
    pos.left = Math.round((box.left ?? (f.W - w) / 2) + dx);
    pos.top = Math.round((box.top ?? (f.H - h) / 2) + dy);
  } else if (anchor === "bottom-center") {
    pos.left = Math.round((f.W - w) / 2 + dx);
    pos.top = Math.round(f.H - (box.bottom ?? 0) - h + dy);
  } else {
    pos.left = Math.round(f.W - (box.right ?? 0) - w + dx);
    pos.top = Math.round(f.H - (box.bottom ?? 0) - h + dy);
  }
  return <img src={ctx.productSrc} style={{ ...pos, objectFit: "contain", objectPosition: anchor === "bottom-right" ? "right bottom" : "center" }} />;
}

function Root({ f, bg, children }: { f: Frame; bg: string; children: ReactNode }) {
  return (
    <div style={{ position: "relative", display: "flex", width: f.W, height: f.H, overflow: "hidden", backgroundColor: bg }}>
      {children}
    </div>
  );
}

// ---------- templates ----------

/** Full-bleed scene, copy low-left, product bottom-right. */
export function HeroTemplate(ctx: TemplateContext) {
  const { f, doc } = ctx;
  const { pad } = f;
  const white = "#ffffff";
  const center = doc.layout.align === "center";
  const hasProduct = Boolean(ctx.productSrc && doc.product);
  // Copy column: in landscape the product takes the right ~40%; in portrait it sits under the copy.
  const copyWidth = f.landscape && hasProduct ? Math.round((f.W - pad.left - pad.right) * 0.56) : f.W - pad.left - pad.right;
  const productBox = f.landscape
    ? { w: Math.round(f.W * 0.36), h: Math.round(f.H * 0.72), right: pad.right, bottom: pad.bottom }
    : { w: Math.round(f.W * 0.6), h: Math.round(f.H * (f.tall ? 0.42 : 0.44)), right: Math.round(pad.right * 0.6), bottom: f.tall ? Math.round(f.H * 0.42) : pad.bottom + Math.round(f.H * 0.3) };
  // In portrait the copy stacks under the product: reserve space for it.
  const copyBottom = pad.bottom;

  return (
    <Root f={f} bg={doc.brand.colors.primary}>
      <Scene ctx={ctx} />
      <Overlay f={f} strength={doc.layout.overlay} />
      {!f.landscape || !hasProduct ? <Product ctx={ctx} box={productBox} /> : null}
      <div style={{ position: "absolute", left: pad.left, top: pad.top, display: "flex" }}>
        <Logo ctx={ctx} color={white} />
      </div>
      <div
        style={{
          position: "absolute",
          left: center ? pad.left : pad.left,
          bottom: copyBottom,
          width: copyWidth,
          display: "flex",
          flexDirection: "column",
          alignItems: center ? "center" : "flex-start",
          gap: Math.round(22 * f.s),
        }}
      >
        <Headline ctx={ctx} color={white} />
        <Subhead ctx={ctx} color={white} style={{ maxWidth: Math.round(copyWidth * 0.9) }} />
        <Cta ctx={ctx} style={{ marginTop: Math.round(6 * f.s) }} />
      </div>
      {f.landscape && hasProduct ? <Product ctx={ctx} box={productBox} /> : null}
    </Root>
  );
}

/** Brand colour block with copy; scene + product on the other half. */
export function SplitTemplate(ctx: TemplateContext) {
  const { f, doc } = ctx;
  const { pad } = f;
  const block = doc.brand.colors.primary;
  const ink = contrastOn(block, doc.brand.colors.text, "#ffffff");
  const center = doc.layout.align === "center";
  const hasProduct = Boolean(ctx.productSrc && doc.product);

  if (f.landscape) {
    const half = Math.round(f.W * 0.46);
    return (
      <Root f={f} bg={block}>
        <div style={{ position: "absolute", left: half, top: 0, width: f.W - half, height: f.H, display: "flex", overflow: "hidden" }}>
          <Scene ctx={ctx} style={{ width: f.W - half, height: f.H }} />
          <Overlay f={f} strength={doc.layout.overlay * 0.5} style={{ width: f.W - half }} />
        </div>
        {hasProduct ? <Product ctx={ctx} box={{ w: Math.round((f.W - half) * 0.7), h: Math.round(f.H * 0.78), right: pad.right, bottom: Math.round(f.H * 0.11) }} /> : null}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: half,
            height: f.H,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: `${pad.top}px ${Math.round(pad.right * 0.5)}px ${pad.bottom}px ${pad.left}px`,
          }}
        >
          <Logo ctx={ctx} color={ink} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", gap: Math.round(22 * f.s) }}>
            <Headline ctx={ctx} color={ink} mult={0.95} />
            <Subhead ctx={ctx} color={ink} />
            <Cta ctx={ctx} style={{ marginTop: Math.round(6 * f.s) }} />
          </div>
        </div>
      </Root>
    );
  }

  // Portrait / square: scene on top, block below.
  const sceneH = Math.round(f.H * (f.tall ? 0.56 : 0.54));
  const blockTop = sceneH;
  return (
    <Root f={f} bg={block}>
      <div style={{ position: "absolute", left: 0, top: 0, width: f.W, height: sceneH, display: "flex", overflow: "hidden" }}>
        <Scene ctx={ctx} style={{ height: sceneH }} />
        <Overlay f={f} strength={doc.layout.overlay * 0.4} from="top" style={{ height: sceneH }} />
      </div>
      {hasProduct ? (
        <Product
          ctx={ctx}
          box={{ w: Math.round(f.W * 0.62), h: Math.round(sceneH * 0.78), bottom: f.H - sceneH - Math.round(f.H * 0.03) }}
          anchor="bottom-center"
        />
      ) : null}
      <div style={{ position: "absolute", left: pad.left, top: Math.max(pad.top, Math.round(f.H * 0.05)), display: "flex" }}>
        <Logo ctx={ctx} color="#ffffff" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: blockTop,
          width: f.W,
          height: f.H - blockTop,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: center ? "center" : "flex-start",
          gap: Math.round(22 * f.s),
          padding: `${Math.round(48 * f.s)}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
        }}
      >
        <Headline ctx={ctx} color={ink} mult={0.92} />
        <Subhead ctx={ctx} color={ink} />
        <Cta ctx={ctx} style={{ marginTop: Math.round(6 * f.s) }} />
      </div>
    </Root>
  );
}

/** Quiet scene, small serif headline, product centred, CTA below. */
export function MinimalTemplate(ctx: TemplateContext) {
  const { f, doc } = ctx;
  const { pad } = f;
  const white = "#ffffff";
  const hasProduct = Boolean(ctx.productSrc && doc.product);
  const serif = ctx.fonts.has(SERIF) ? SERIF : headingFamily(ctx);
  const usable = f.H - pad.top - pad.bottom;

  if (f.landscape) {
    return (
      <Root f={f} bg={doc.brand.colors.primary}>
        <Scene ctx={ctx} />
        <div style={{ position: "absolute", left: 0, top: 0, width: f.W, height: f.H, display: "flex", backgroundColor: rgba("#000000", doc.layout.overlay * 0.45) }} />
        <div style={{ position: "absolute", left: pad.left, top: pad.top, display: "flex" }}>
          <Logo ctx={ctx} color={white} size={0.9} />
        </div>
        {hasProduct ? <Product ctx={ctx} box={{ w: Math.round(f.W * 0.34), h: Math.round(usable * 0.9), right: pad.right, bottom: pad.bottom }} /> : null}
        <div
          style={{
            position: "absolute",
            left: pad.left,
            top: pad.top,
            width: hasProduct ? Math.round(f.W * 0.5) : f.W - pad.left - pad.right,
            height: usable,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: doc.layout.align === "center" ? "center" : "flex-start",
            gap: Math.round(24 * f.s),
          }}
        >
          <Headline ctx={ctx} color={white} family={serif} weight={400} italic mult={1.05} />
          <Subhead ctx={ctx} color={white} />
          <Cta ctx={ctx} size={0.92} />
        </div>
      </Root>
    );
  }

  return (
    <Root f={f} bg={doc.brand.colors.primary}>
      <Scene ctx={ctx} />
      <div style={{ position: "absolute", left: 0, top: 0, width: f.W, height: f.H, display: "flex", backgroundColor: rgba("#000000", doc.layout.overlay * 0.45) }} />
      <div
        style={{
          position: "absolute",
          left: pad.left,
          top: pad.top,
          width: f.W - pad.left - pad.right,
          height: usable,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(20 * f.s), width: "100%" }}>
          <Logo ctx={ctx} color={white} size={0.9} />
          <Headline ctx={ctx} color={white} family={serif} weight={400} italic mult={1.05} style={{ textAlign: "center", marginTop: Math.round(14 * f.s) }} />
          <Subhead ctx={ctx} color={white} style={{ textAlign: "center" }} />
        </div>
        <Cta ctx={ctx} size={0.92} />
      </div>
      {hasProduct ? (
        <Product
          ctx={ctx}
          box={{ w: Math.round(f.W * 0.62), h: Math.round(usable * (f.tall ? 0.5 : 0.42)), top: Math.round(pad.top + usable * (f.tall ? 0.3 : 0.33)) }}
          anchor="center"
        />
      ) : null}
    </Root>
  );
}

/** Oversized headline across the top, product large and centred, CTA at the bottom. */
export function BoldTemplate(ctx: TemplateContext) {
  const { f, doc } = ctx;
  const { pad } = f;
  const white = "#ffffff";
  const hasProduct = Boolean(ctx.productSrc && doc.product);
  const usable = f.H - pad.top - pad.bottom;

  if (f.landscape) {
    return (
      <Root f={f} bg={doc.brand.colors.primary}>
        <Scene ctx={ctx} />
        <Overlay f={f} strength={doc.layout.overlay} from="left" />
        <div style={{ position: "absolute", left: pad.left, top: pad.top, display: "flex" }}>
          <Logo ctx={ctx} color={white} />
        </div>
        {hasProduct ? <Product ctx={ctx} box={{ w: Math.round(f.W * 0.4), h: Math.round(usable * 0.95), right: pad.right, bottom: pad.bottom }} /> : null}
        <div
          style={{
            position: "absolute",
            left: pad.left,
            bottom: pad.bottom,
            width: Math.round(f.W * 0.55),
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: Math.round(20 * f.s),
          }}
        >
          <Headline ctx={ctx} color={white} mult={1.28} style={{ textTransform: "uppercase", lineHeight: 0.94, textAlign: "left" }} />
          <Subhead ctx={ctx} color={white} style={{ textAlign: "left" }} />
          <Cta ctx={ctx} size={1.05} />
        </div>
      </Root>
    );
  }

  return (
    <Root f={f} bg={doc.brand.colors.primary}>
      <Scene ctx={ctx} />
      <Overlay f={f} strength={doc.layout.overlay} from="top" />
      <Overlay f={f} strength={doc.layout.overlay * 0.7} />
      <div
        style={{
          position: "absolute",
          left: pad.left,
          top: pad.top,
          width: f.W - pad.left - pad.right,
          display: "flex",
          flexDirection: "column",
          alignItems: doc.layout.align === "center" ? "center" : "flex-start",
          gap: Math.round(18 * f.s),
        }}
      >
        <Logo ctx={ctx} color={white} />
        <Headline ctx={ctx} color={white} mult={1.32} style={{ textTransform: "uppercase", lineHeight: 0.94, marginTop: Math.round(10 * f.s) }} />
        <Subhead ctx={ctx} color={white} />
      </div>
      {hasProduct ? (
        <Product
          ctx={ctx}
          box={{ w: Math.round(f.W * 0.8), h: Math.round(usable * (f.tall ? 0.52 : 0.44)), bottom: pad.bottom + Math.round(90 * f.s) }}
          anchor="bottom-center"
        />
      ) : null}
      <div style={{ position: "absolute", left: 0, bottom: pad.bottom, width: f.W, display: "flex", justifyContent: "center" }}>
        <Cta ctx={ctx} size={1.05} />
      </div>
    </Root>
  );
}

export const templates = {
  hero: HeroTemplate,
  split: SplitTemplate,
  minimal: MinimalTemplate,
  bold: BoldTemplate,
} as const;
