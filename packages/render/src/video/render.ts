import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getPlacement } from "@adcraft/specs";
import {
  VIDEO_FPS,
  VIDEO_RATIO_SIZES,
  documentDurationSec,
  normalizeVideoDocument,
  type AdVideoCaption,
  type AdVideoOverlayClip,
  type AdVideoProps,
  type AdVideoSceneProps,
  type SafeZone,
  type VideoAsset,
  type VideoDocument,
  type VideoRatio,
} from "./document";

/**
 * `renderVideo(doc, { ratio })` → mp4 bytes.
 *
 * Local engine: @remotion/bundler builds the composition once per process (cached under
 * the OS temp dir), @remotion/renderer drives a headless Chromium (downloaded on first use
 * by `ensureBrowser()` into the renderer package's `.remotion` folder), and the Remotion
 * compositor stitches frames with its bundled ffmpeg.
 *
 * TODO(lambda): implement `LambdaVideoRenderer` with @remotion/lambda (`deploySite` once per
 * deploy, `renderMediaOnLambda` per render, poll `getRenderProgress`, download to R2) and
 * select it when REMOTION_AWS_REGION + REMOTION_FUNCTION_NAME are set.
 */

export type AssetLoader = (asset: VideoAsset) => Promise<Buffer | null>;

export interface RenderVideoOptions {
  ratio: VideoRatio;
  /** Reads private assets (storage keys) into bytes for the render server. */
  loadAsset?: AssetLoader;
  /** Override the placement safe zone derived from the ratio. */
  safeZone?: SafeZone;
  onProgress?: (fraction: number) => void;
  /** 0–51, lower is better. */
  crf?: number;
  /** Chromium/compositor concurrency. */
  concurrency?: number;
  logLevel?: "verbose" | "info" | "warn" | "error";
}

export interface VideoRenderer {
  readonly engine: "remotion-local" | "remotion-lambda";
  render(props: AdVideoProps, opts: { onProgress?: (f: number) => void; crf?: number; concurrency?: number; logLevel?: RenderVideoOptions["logLevel"] }): Promise<Buffer>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(here, "entry.ts");
const FONTS_DIR = path.resolve(here, "../../fonts");
export const BUNDLE_DIR = process.env.ADCRAFT_REMOTION_BUNDLE_DIR ?? path.join(os.tmpdir(), "adcraft-remotion-bundle");

export const FONT_FILES = {
  heading: "dm-sans-700.ttf",
  body: "dm-sans-600.ttf",
  serif: "instrument-serif-italic.ttf",
} as const;

// ---------- bundle (once per process; survives Next.js HMR via globalThis) ----------

const g = globalThis as unknown as { __adcraftRemotionBundle?: Promise<string> };

export async function getBundle(): Promise<string> {
  if (!g.__adcraftRemotionBundle) {
    g.__adcraftRemotionBundle = (async () => {
      const { bundle } = await import("@remotion/bundler");
      const outDir = path.join(BUNDLE_DIR, `p${process.pid}`);
      await fs.rm(outDir, { recursive: true, force: true });
      const serveUrl = await bundle({
        entryPoint: ENTRY,
        publicDir: FONTS_DIR,
        outDir,
        ignoreRegisterRootWarning: true,
        // Keep the bundle self-contained: no source maps, quiet logs.
        onProgress: () => {},
      });
      return serveUrl;
    })().catch((err) => {
      g.__adcraftRemotionBundle = undefined;
      throw err;
    });
  }
  return g.__adcraftRemotionBundle;
}

// ---------- assets ----------

/** Write an asset into the served bundle dir and return its URL relative to the server root. */
async function materialize(
  asset: VideoAsset | undefined,
  dir: string,
  name: string,
  loadAsset: AssetLoader | undefined,
  ext: string,
): Promise<string | null> {
  if (!asset) return null;
  if (asset.url && /^https?:\/\//.test(asset.url) && !asset.key) return asset.url;
  let bytes: Buffer | null = null;
  if (asset.url?.startsWith("data:")) bytes = Buffer.from(asset.url.slice(asset.url.indexOf(",") + 1), "base64");
  else if (loadAsset) bytes = await loadAsset(asset);
  if (!bytes) return null;
  const file = `${name}.${ext}`;
  await fs.writeFile(path.join(dir, file), bytes);
  return `/${path.basename(path.dirname(dir))}/${path.basename(dir)}/${file}`;
}

// ---------- safe zones ----------

function union(a: SafeZone, b: SafeZone): SafeZone {
  return { top: Math.max(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom), left: Math.max(a.left, b.left) };
}

/** Safe zone for a ratio: the tightest union of the placements that ratio is published to. */
export function safeZoneFor(ratio: VideoRatio): SafeZone {
  const size = VIDEO_RATIO_SIZES[ratio];
  const ids: Record<VideoRatio, string[]> = {
    "9:16": ["meta.stories.9x16", "tiktok.infeed.9x16"],
    "1:1": ["meta.feed.1x1"],
    "16:9": ["youtube.instream.16x9"],
    "4:5": ["meta.feed.4x5"],
  };
  let zone: SafeZone = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const id of ids[ratio]) {
    try {
      const p = getPlacement(id);
      const k = size.width / p.width;
      zone = union(zone, { top: p.safeZone.top * k, right: p.safeZone.right * k, bottom: p.safeZone.bottom * k, left: p.safeZone.left * k });
    } catch {
      /* unknown placement: ignore */
    }
  }
  // Never let text touch the edges even on placements with no declared overlay.
  const pad = Math.round(Math.min(size.width, size.height) * 0.06);
  return union(zone, { top: pad, right: pad, bottom: pad, left: pad });
}

// ---------- document → props ----------

/** Words-per-second weight used to time captions along a voice track. */
function weight(text: string) {
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}

/**
 * Build the composition props for a document. Exposed so the pipeline can preview timing
 * (and so tests can assert on it) without rendering.
 */
export async function buildAdVideoProps(
  input: VideoDocument,
  opts: { ratio: VideoRatio; assetsDir: string; loadAsset?: AssetLoader; safeZone?: SafeZone },
): Promise<AdVideoProps> {
  const doc = normalizeVideoDocument(input);
  const size = VIDEO_RATIO_SIZES[opts.ratio];
  const fps = VIDEO_FPS;
  const scenes: AdVideoSceneProps[] = [];
  const overlays: AdVideoOverlayClip[] = [];
  const captions: AdVideoCaption[] = [];
  let hook: AdVideoCaption | undefined;
  let voiceover: AdVideoProps["voiceover"];

  const mainScenes = doc.scenes.filter((s) => s.role !== "broll");
  const brollScenes = doc.scenes.filter((s) => s.role === "broll");

  const sceneSrc = async (scene: VideoDocument["scenes"][number], i: number) => {
    const clip = await materialize(scene.clip, opts.assetsDir, `scene-${i}`, opts.loadAsset, "mp4");
    if (clip) return { src: clip, kind: "video" as const };
    const still = await materialize(scene.still, opts.assetsDir, `still-${i}`, opts.loadAsset, "png");
    if (still) return { src: still, kind: "image" as const };
    return null;
  };

  if (doc.kind === "ugc" && doc.presenter?.clip) {
    // Presenter is the base track (audio baked in); B-roll cuts in over it.
    const presenterSrc = await materialize(doc.presenter.clip, opts.assetsDir, "presenter", opts.loadAsset, "mp4");
    if (!presenterSrc) throw new Error("Presenter clip could not be loaded");
    const total = doc.presenter.clip.durationSec ?? doc.voice?.audio?.durationSec ?? mainScenes.reduce((s, x) => s + x.durationSec, 0);
    scenes.push({ src: presenterSrc, kind: "video", durationSec: total, muted: false });

    // Captions follow the script lines, proportionally to their length.
    const lines = mainScenes.length ? mainScenes : doc.scenes;
    const sum = lines.reduce((s, l) => s + weight(l.caption || l.line), 0) || 1;
    let t = 0;
    for (const l of lines) {
      const d = (weight(l.caption || l.line) / sum) * total;
      captions.push({ text: l.caption || l.line, fromSec: t, toSec: t + d });
      if (!hook && l.hookText) hook = { text: l.hookText, fromSec: t, toSec: Math.min(total, t + Math.max(2, d)) };
      t += d;
    }

    // B-roll cut-ins: explicit `atSec`, else spaced through the middle of the take.
    const slots = brollScenes.length ? brollScenes : [];
    for (const [i, b] of slots.entries()) {
      const src = await sceneSrc(b, 100 + i);
      if (!src) continue;
      const d = Math.min(b.durationSec, Math.max(1.5, total * 0.2));
      const at = b.atSec ?? total * (0.3 + (0.45 * i) / Math.max(1, slots.length - 1 || 1));
      overlays.push({ ...src, atSec: Math.max(0, Math.min(at, total - d)), durationSec: d });
    }
  } else {
    // Product video (or UGC without a presenter clip yet): sequential scenes with a voice-over.
    let t = 0;
    const list = mainScenes.length ? mainScenes : doc.scenes;
    for (const [i, s] of list.entries()) {
      const src = await sceneSrc(s, i);
      if (!src) continue;
      scenes.push({ ...src, durationSec: s.durationSec });
      if (s.caption) captions.push({ text: s.caption, fromSec: t, toSec: t + s.durationSec });
      if (!hook && s.hookText) hook = { text: s.hookText, fromSec: t, toSec: t + Math.min(s.durationSec, 3) };
      t += s.durationSec;
    }
    if (doc.voice?.audio) {
      const src = await materialize(doc.voice.audio, opts.assetsDir, "voice", opts.loadAsset, "mp3");
      if (src) voiceover = { src, startSec: 0 };
    }
  }

  if (scenes.length === 0) throw new Error("No scene has a clip or still yet — generate the storyboard first");

  const musicSrc = await materialize(doc.music, opts.assetsDir, "music", opts.loadAsset, "mp3");
  const logoSrc = await materialize(doc.brand.logo, opts.assetsDir, "logo", opts.loadAsset, "png");

  return {
    width: size.width,
    height: size.height,
    fps,
    scenes,
    overlays,
    captions,
    captionStyle: doc.captions,
    hook,
    voiceover,
    music: musicSrc ? { src: musicSrc, volume: doc.music?.volume ?? 0.18 } : undefined,
    brand: { name: doc.brand.name, logoSrc: logoSrc ?? undefined, colors: doc.brand.colors, fonts: doc.brand.fonts },
    endCard: doc.endCard,
    safeZone: opts.safeZone ?? safeZoneFor(opts.ratio),
    aiLabel: doc.aiLabel,
    fonts: { heading: doc.brand.fonts.heading, body: doc.brand.fonts.body, headingFile: FONT_FILES.heading, bodyFile: FONT_FILES.body, serifFile: FONT_FILES.serif },
  };
}

// ---------- local renderer ----------

export class LocalRemotionRenderer implements VideoRenderer {
  readonly engine = "remotion-local" as const;

  async render(props: AdVideoProps, opts: { onProgress?: (f: number) => void; crf?: number; concurrency?: number; logLevel?: RenderVideoOptions["logLevel"] } = {}): Promise<Buffer> {
    const [{ ensureBrowser, renderMedia, selectComposition }, serveUrl] = await Promise.all([import("@remotion/renderer"), getBundle()]);
    const logLevel = opts.logLevel ?? "error";
    await ensureBrowser({ logLevel });
    const composition = await selectComposition({ serveUrl, id: "AdVideo", inputProps: props, logLevel });
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "adcraft-video-"));
    const outputLocation = path.join(outDir, "out.mp4");
    try {
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation,
        inputProps: props,
        crf: opts.crf ?? 20,
        concurrency: opts.concurrency ?? Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))),
        logLevel,
        onProgress: ({ progress }) => opts.onProgress?.(progress),
        // Cover-cropped stills and clips already match the frame; no need for expensive scaling.
        scale: 1,
      });
      return await fs.readFile(outputLocation);
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }
}

let renderer: VideoRenderer | null = null;
export function getVideoRenderer(): VideoRenderer {
  // TODO(lambda): return new LambdaVideoRenderer() when REMOTION_FUNCTION_NAME is configured.
  return (renderer ??= new LocalRemotionRenderer());
}

/** Render a document at one ratio to mp4 bytes. */
export async function renderVideo(doc: VideoDocument, opts: RenderVideoOptions): Promise<Buffer> {
  const serveUrl = await getBundle();
  const assetsDir = path.join(serveUrl, "assets", randomUUID());
  await fs.mkdir(assetsDir, { recursive: true });
  try {
    const props = await buildAdVideoProps(doc, { ratio: opts.ratio, assetsDir, loadAsset: opts.loadAsset, safeZone: opts.safeZone });
    return await getVideoRenderer().render(props, { onProgress: opts.onProgress, crf: opts.crf, concurrency: opts.concurrency, logLevel: opts.logLevel });
  } finally {
    await fs.rm(assetsDir, { recursive: true, force: true });
  }
}

export { documentDurationSec };
