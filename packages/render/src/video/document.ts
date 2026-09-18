/**
 * Video documents (Release 2). Stored as `creatives.document` for kind = video | ugc.
 *
 * A document is the storyboard: the script split into scenes, where each scene gets a
 * generated still and then an image-to-video clip. The renderer (`renderVideo`) turns a
 * document plus a ratio into the `AdVideo` composition props.
 */

export type VideoRatio = "9:16" | "1:1" | "16:9" | "4:5";
export type VideoKind = "video" | "ugc";

export interface VideoAsset {
  /** Storage key under our bucket (preferred: the renderer loads bytes through `loadAsset`). */
  key?: string;
  /** URL when the asset is public or a data URL. */
  url?: string;
  durationSec?: number;
}

export interface VideoScene {
  id: string;
  /** Voice-over / script line for this scene. */
  line: string;
  /** On-screen caption (defaults to `line`). */
  caption: string;
  /** Image prompt used to generate the still. */
  prompt: string;
  durationSec: number;
  /** Large text overlay (usually the hook on scene 1). */
  hookText?: string;
  /** Generated still (scene image). */
  still?: VideoAsset;
  /** Image-to-video clip made from the still. */
  clip?: VideoAsset;
  /** UGC: B-roll scenes cut in over the presenter; `atSec` positions them on the presenter timeline. */
  role?: "scene" | "broll";
  atSec?: number;
  /** Last error for this scene (surfaced on the storyboard). */
  error?: string;
}

export interface VideoBrand {
  name: string;
  logo?: VideoAsset;
  colors: { primary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string };
}

export interface CaptionStyle {
  /** bold = large white on dark pill, clean = plain text with shadow, pill = brand accent pill. */
  style: "bold" | "clean" | "pill";
  position: "bottom" | "center";
  /** Highlight colour for emphasised words; defaults to the brand accent. */
  accent?: string;
}

export interface VideoDocument {
  kind: VideoKind;
  /** Video model id from @adcraft/ai models.ts (e.g. "kling-3.0"). */
  model: string;
  /** Image model for scene stills; independent from the video animation model. */
  imageModel?: string;
  /** Primary ratio the scenes are generated in. */
  ratio: VideoRatio;
  /** Full script as proposed by the concept. */
  script: string;
  scenes: VideoScene[];
  product: { id?: string; name: string; cutout?: VideoAsset } | null;
  brand: VideoBrand;
  captions: CaptionStyle;
  endCard: { headline: string; cta: string; durationSec: number };
  music?: VideoAsset & { volume?: number };
  /** UGC voice-over. */
  /** UGC voice-over. `provider` "heygen" means HeyGen speaks the script itself (no synthesised track). */
  voice?: { voiceId: string; provider?: "elevenlabs" | "heygen"; audio?: VideoAsset };
  /** UGC presenter clip (licensed avatar). */
  presenter?: {
    avatarId: string;
    image?: VideoAsset;
    characterId?: string;
    /** Photo avatars: how much the presenter moves, and free-text gesture direction. */
    motion?: { expressiveness?: "low" | "medium" | "high"; prompt?: string };
    clip?: VideoAsset;
  };
  /** Show the "AI-generated" label required by platform rules for synthetic presenters. */
  aiLabel: boolean;
  meta?: Record<string, unknown>;
}

// ---------- composition props ----------

export interface SafeZone {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AdVideoSceneProps {
  src: string;
  kind: "video" | "image";
  durationSec: number;
  muted?: boolean;
  /** Still frame drawn beneath a clip so decode gaps at scene boundaries never show black. */
  posterSrc?: string;
}

export interface AdVideoCaption {
  text: string;
  fromSec: number;
  toSec: number;
}

export interface AdVideoOverlayClip {
  src: string;
  kind: "video" | "image";
  atSec: number;
  durationSec: number;
}

/**
 * Serialisable props of the `AdVideo` Remotion composition. Built by `renderVideo` from a
 * `VideoDocument`; asset URLs are relative to the render server's root.
 */
export interface AdVideoProps extends Record<string, unknown> {
  width: number;
  height: number;
  fps: number;
  /** Sequential scene track. UGC: one entry — the presenter clip. */
  scenes: AdVideoSceneProps[];
  /** Cut-ins over the scene track (UGC B-roll). Visual only; audio keeps playing from the scene track. */
  overlays: AdVideoOverlayClip[];
  captions: AdVideoCaption[];
  captionStyle: CaptionStyle;
  hook?: AdVideoCaption;
  /** Where the hook sits: "top" for product scenes, "lower" for talking-head clips so it never covers the face. */
  hookPlacement?: "top" | "lower";
  voiceover?: { src: string; startSec?: number };
  music?: { src: string; volume: number };
  brand: { name: string; logoSrc?: string; colors: VideoBrand["colors"]; fonts: VideoBrand["fonts"] };
  endCard: { headline: string; cta: string; durationSec: number };
  safeZone: SafeZone;
  aiLabel: boolean;
  /** Font files served from the bundle's public dir. */
  fonts: { heading: string; body: string; headingFile: string; bodyFile: string; serifFile: string };
}

export const VIDEO_RATIO_SIZES: Record<VideoRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const VIDEO_FPS = 30;

/** Total length of a document's main track (scenes + end card). */
export function documentDurationSec(doc: Pick<VideoDocument, "scenes" | "endCard" | "kind" | "presenter" | "voice">): number {
  if (doc.kind === "ugc") {
    const presenter = doc.presenter?.clip?.durationSec ?? doc.voice?.audio?.durationSec;
    if (presenter) return presenter + doc.endCard.durationSec;
  }
  return doc.scenes.filter((s) => s.role !== "broll").reduce((s, sc) => s + sc.durationSec, 0) + doc.endCard.durationSec;
}

/** Fill in defaults so older/partial documents render. */
export function normalizeVideoDocument(doc: Partial<VideoDocument> & Pick<VideoDocument, "kind">): VideoDocument {
  return {
    imageModel: doc.imageModel,
    kind: doc.kind,
    model: doc.model ?? "kling-3.0",
    ratio: doc.ratio ?? "9:16",
    script: doc.script ?? "",
    scenes: (doc.scenes ?? []).map((s, i) => ({
      id: s.id ?? `scene-${i + 1}`,
      line: s.line ?? "",
      caption: s.caption ?? s.line ?? "",
      prompt: s.prompt ?? s.line ?? "",
      durationSec: s.durationSec ?? 3,
      hookText: s.hookText,
      still: s.still,
      clip: s.clip,
      role: s.role ?? "scene",
      atSec: s.atSec,
      error: s.error,
    })),
    product: doc.product ?? null,
    brand: {
      name: doc.brand?.name ?? "",
      logo: doc.brand?.logo,
      colors: { primary: "#242521", accent: "#e65c32", background: "#f8f7f3", text: "#242521", ...(doc.brand?.colors ?? {}) },
      fonts: { heading: "DM Sans", body: "DM Sans", ...(doc.brand?.fonts ?? {}) },
    },
    captions: { style: "bold", position: "bottom", ...(doc.captions ?? {}) },
    endCard: { headline: "", cta: "Shop now", durationSec: 2.5, ...(doc.endCard ?? {}) },
    music: doc.music,
    voice: doc.voice,
    presenter: doc.presenter,
    aiLabel: doc.aiLabel ?? doc.kind === "ugc",
    meta: doc.meta,
  };
}
