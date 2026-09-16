import sharp from "sharp";
import type satoriType from "satori";
import type { Resvg as ResvgType } from "@resvg/resvg-js";
import type { RenderSize, StaticAdDocument } from "./document";
import { normalizeDocument } from "./document";
import { loadFonts } from "./fonts";
import { frameFor } from "./layout";
import { templates } from "./templates";

/** Reference to a stored or remote image. */
export type AssetRef = { key?: string; url?: string };

export interface RenderOptions {
  /**
   * Resolves a stored key or remote URL to raw image bytes. The app passes a
   * storage-backed loader; the smoke script passes files. `data:` URLs never hit it.
   */
  loadAsset?: (ref: AssetRef) => Promise<Buffer | Uint8Array | null>;
  /** Long-edge cap for embedded images (keeps SVG size and render time bounded). */
  maxAssetEdge?: number;
}

/**
 * `@resvg/resvg-js` is a native addon and `satori` loads `harfbuzzjs/hb.wasm`
 * relative to its own directory. The app transpiles this package, so webpack would
 * try to bundle both; resolving them through Node's own loader keeps them external
 * (same approach as PGlite in @adcraft/db). `process.getBuiltinModule` is opaque to
 * webpack, so this stays a real Node require at runtime.
 */
let engines: { satori: typeof satoriType; Resvg: typeof ResvgType } | null = null;
function loadEngines() {
  if (!engines) {
    const nodeModule = process.getBuiltinModule("node:module") as typeof import("node:module");
    const nodeRequire = nodeModule.createRequire(import.meta.url);
    const satoriMod = nodeRequire("satori") as { default?: typeof satoriType } | typeof satoriType;
    const satori = (typeof satoriMod === "function" ? satoriMod : satoriMod.default) as typeof satoriType;
    const { Resvg } = nodeRequire("@resvg/resvg-js") as { Resvg: typeof ResvgType };
    engines = { satori, Resvg };
  }
  return engines;
}

/** Normalise any image to a PNG data URL (resvg reads png/jpeg/gif; not webp). */
async function toDataUrl(bytes: Buffer | Uint8Array, maxEdge: number): Promise<string> {
  const png = await sharp(bytes).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function resolveAsset(ref: AssetRef | undefined, opts: RenderOptions): Promise<string | undefined> {
  if (!ref) return undefined;
  const maxEdge = opts.maxAssetEdge ?? 2048;
  if (ref.url?.startsWith("data:")) {
    const m = ref.url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
    if (!m) return undefined;
    const raw = m[2] ? Buffer.from(m[3] ?? "", "base64") : Buffer.from(decodeURIComponent(m[3] ?? ""), "utf8");
    return toDataUrl(raw, maxEdge);
  }
  let bytes: Buffer | Uint8Array | null = null;
  if (opts.loadAsset) bytes = await opts.loadAsset(ref);
  if (!bytes && ref.url && /^https?:/.test(ref.url)) {
    try {
      const res = await fetch(ref.url);
      if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
    } catch {
      bytes = null;
    }
  }
  return bytes ? toDataUrl(bytes, maxEdge) : undefined;
}

/**
 * Render a layered static ad to PNG bytes for one size. Pure function of
 * (document, size, assets): the same inputs always produce the same pixels.
 */
export async function renderStatic(input: StaticAdDocument, size: RenderSize, opts: RenderOptions = {}): Promise<Buffer> {
  const doc = normalizeDocument(input);
  const [{ fonts, resolved }, sceneSrc, productSrc, logoSrc] = await Promise.all([
    loadFonts(doc.brand.fonts),
    doc.scene.kind === "image" ? resolveAsset({ key: doc.scene.key, url: doc.scene.url }, opts) : Promise.resolve(undefined),
    doc.product ? resolveAsset({ key: doc.product.cutoutKey, url: doc.product.cutoutUrl }, opts) : Promise.resolve(undefined),
    doc.brand.logoUrl ? resolveAsset({ url: doc.brand.logoUrl }, opts) : Promise.resolve(undefined),
  ]);

  // An image scene whose asset is missing falls back to the brand gradient rather than failing.
  const effective: StaticAdDocument =
    doc.scene.kind === "image" && !sceneSrc
      ? { ...doc, scene: { kind: "gradient", from: doc.brand.colors.primary, to: doc.brand.colors.accent, angle: 160 } }
      : doc;

  const Template = templates[effective.template] ?? templates.hero;
  const element = Template({ doc: effective, f: frameFor(size), fonts: resolved, sceneSrc, productSrc, logoSrc });

  const { satori, Resvg } = loadEngines();
  const svg = await satori(element, {
    width: size.width,
    height: size.height,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size.width },
    font: { loadSystemFonts: false },
    background: effective.brand.colors.primary,
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}

/** Render one document at several sizes, sequentially (satori is CPU-bound). */
export async function renderStaticSet(doc: StaticAdDocument, sizes: RenderSize[], opts: RenderOptions = {}) {
  const out: Array<{ size: RenderSize; png: Buffer }> = [];
  for (const size of sizes) out.push({ size, png: await renderStatic(doc, size, opts) });
  return out;
}
