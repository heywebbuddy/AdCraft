import { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AdVideoProps, AdVideoCaption, CaptionStyle, SafeZone } from "./document";

/**
 * `AdVideo` — product and UGC ad composition.
 *
 * Tracks: sequential scenes (clips or stills) → overlay cut-ins (B-roll) → captions +
 * hook text inside the placement's safe zone → voice-over + music → logo end card.
 * Everything is driven by serialisable props (see document.ts) so the same composition
 * renders locally (@remotion/renderer) and later on Lambda.
 */

const HEADING_FAMILY = "AdcraftHeading";
const BODY_FAMILY = "AdcraftBody";
const SERIF_FAMILY = "AdcraftSerif";

function useFonts(fonts: AdVideoProps["fonts"]) {
  const [handle] = useState(() => delayRender("Loading brand fonts"));
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const faces = [
        new FontFace(HEADING_FAMILY, `url(${staticFile(fonts.headingFile)})`, { weight: "700" }),
        new FontFace(BODY_FAMILY, `url(${staticFile(fonts.bodyFile)})`, { weight: "600" }),
        new FontFace(SERIF_FAMILY, `url(${staticFile(fonts.serifFile)})`, { style: "italic" }),
      ];
      await Promise.all(
        faces.map(async (f) => {
          try {
            const loaded = await f.load();
            document.fonts.add(loaded);
          } catch (err) {
            console.warn("font failed to load", f.family, err);
          }
        }),
      );
      if (!cancelled) continueRender(handle);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [handle, fonts.headingFile, fonts.bodyFile, fonts.serifFile]);
}

const secToFrames = (sec: number, fps: number) => Math.max(1, Math.round(sec * fps));

// ---------- scene track ----------

const SceneLayer = ({ src, kind, muted, durationFrames, posterSrc }: { src: string; kind: "video" | "image"; muted?: boolean; durationFrames: number; posterSrc?: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade from black: scenes cut directly, and the poster under the clip covers the
  // one or two frames a video decoder can miss at a sequence boundary.
  const fadeIn = frame === 0 && !posterSrc ? 0.999 : 1;
  // Stills get a slow push-in so they never read as a frozen frame.
  const scale = kind === "image" ? interpolate(frame, [0, durationFrames], [1, 1.12], { extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ opacity: fadeIn, backgroundColor: "#000" }}>
      {kind === "video" && posterSrc ? (
        <Img src={posterSrc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      {kind === "video" ? (
        <OffthreadVideo src={src} muted={muted} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
      )}
    </AbsoluteFill>
  );
};

// ---------- captions ----------

function captionMetrics(width: number, height: number, safe: SafeZone) {
  const short = Math.min(width, height);
  return {
    fontSize: Math.round(short / 15),
    hookSize: Math.round(short / 10),
    sideInset: Math.max(safe.left, safe.right, Math.round(width * 0.06)),
    bottomInset: Math.max(safe.bottom, Math.round(height * 0.08)),
    topInset: Math.max(safe.top, Math.round(height * 0.07)),
  };
}

const Caption = ({
  caption,
  style,
  fonts,
  accent,
  metrics,
}: {
  caption: AdVideoCaption;
  style: CaptionStyle;
  fonts: AdVideoProps["fonts"];
  accent: string;
  metrics: ReturnType<typeof captionMetrics>;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, stiffness: 180 } });
  const y = interpolate(enter, [0, 1], [24, 0]);
  const base: React.CSSProperties = {
    fontFamily: `${BODY_FAMILY}, ${fonts.body}, "DM Sans", sans-serif`,
    fontWeight: 600,
    fontSize: metrics.fontSize,
    lineHeight: 1.2,
    textAlign: "center",
    letterSpacing: -0.5,
    opacity: enter,
    transform: `translateY(${y}px)`,
    maxWidth: "100%",
  };
  const skin: React.CSSProperties =
    style.style === "pill"
      ? { background: accent, color: "#fff", padding: `${metrics.fontSize * 0.35}px ${metrics.fontSize * 0.7}px`, borderRadius: metrics.fontSize * 0.35 }
      : style.style === "bold"
        ? { background: "rgba(20,20,18,0.82)", color: "#fff", padding: `${metrics.fontSize * 0.35}px ${metrics.fontSize * 0.7}px`, borderRadius: metrics.fontSize * 0.3 }
        : { color: "#fff", textShadow: "0 2px 18px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.9)" };
  return (
    <AbsoluteFill
      style={{
        justifyContent: style.position === "center" ? "center" : "flex-end",
        alignItems: "center",
        paddingLeft: metrics.sideInset,
        paddingRight: metrics.sideInset,
        paddingBottom: metrics.bottomInset,
      }}
    >
      <div style={{ ...base, ...skin, display: "inline-block" }}>{caption.text}</div>
    </AbsoluteFill>
  );
};

const Hook = ({ text, fonts, metrics, offset = 0, boxed = false, placement = "top" }: { text: string; fonts: AdVideoProps["fonts"]; metrics: ReturnType<typeof captionMetrics>; offset?: number; boxed?: boolean; placement?: "top" | "lower" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const exit = interpolate(frame, [durationInFrames - Math.round(fps * 0.25), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Talking-head clips: a smaller lower-third so the presenter's face stays clear.
  const lower = placement === "lower";
  const size = lower ? Math.round(metrics.hookSize * 0.72) : metrics.hookSize;
  return (
    <AbsoluteFill
      style={
        lower
          ? { alignItems: "center", justifyContent: "flex-end", paddingLeft: metrics.sideInset, paddingRight: metrics.sideInset, paddingBottom: metrics.bottomInset }
          : { alignItems: "center", paddingLeft: metrics.sideInset, paddingRight: metrics.sideInset, paddingTop: metrics.topInset + offset }
      }
    >
      <div
        style={{
          fontFamily: `${HEADING_FAMILY}, ${fonts.heading}, "DM Sans", sans-serif`,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.05,
          letterSpacing: -size * 0.03,
          textAlign: "center",
          color: "#fff",
          textShadow: boxed ? "none" : "0 4px 30px rgba(0,0,0,0.55), 0 0 3px rgba(0,0,0,0.9)",
          ...(boxed
            ? { background: "rgba(20,20,18,0.78)", padding: `${size * 0.3}px ${size * 0.5}px`, borderRadius: size * 0.25, display: "inline-block", maxWidth: "100%" }
            : {}),
          opacity: enter * exit,
          transform: `translateY(${interpolate(enter, [0, 1], [lower ? 30 : -30, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ---------- end card ----------

const EndCard = ({ brand, endCard, fonts, width, height }: Pick<AdVideoProps, "brand" | "endCard" | "fonts" | "width" | "height">) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const pop = spring({ frame: frame - Math.round(fps * 0.25), fps, config: { damping: 14, stiffness: 140 } });
  const short = Math.min(width, height);
  const headlineSize = Math.round(short / 11);
  return (
    <AbsoluteFill style={{ backgroundColor: brand.colors.background }}>
    <AbsoluteFill style={{ opacity: enter, justifyContent: "center", alignItems: "center", gap: short * 0.05, padding: short * 0.1 }}>
      {brand.logoSrc ? (
        <Img src={brand.logoSrc} style={{ maxWidth: short * 0.4, maxHeight: short * 0.18, objectFit: "contain" }} />
      ) : (
        <div style={{ fontFamily: `${SERIF_FAMILY}, "Instrument Serif", Georgia, serif`, fontStyle: "italic", fontSize: Math.round(short / 9), color: brand.colors.primary, letterSpacing: -1 }}>
          {brand.name}
        </div>
      )}
      {endCard.headline ? (
        <div
          style={{
            fontFamily: `${HEADING_FAMILY}, ${fonts.heading}, "DM Sans", sans-serif`,
            fontWeight: 700,
            fontSize: headlineSize,
            lineHeight: 1.05,
            letterSpacing: -headlineSize * 0.03,
            textAlign: "center",
            color: brand.colors.text,
            maxWidth: "88%",
          }}
        >
          {endCard.headline}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: `${BODY_FAMILY}, ${fonts.body}, "DM Sans", sans-serif`,
          fontWeight: 600,
          fontSize: Math.round(short / 20),
          color: "#fff",
          background: brand.colors.accent,
          padding: `${Math.round(short / 42)}px ${Math.round(short / 16)}px`,
          borderRadius: 999,
          transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
          opacity: pop,
          boxShadow: "0 6px 0 rgba(0,0,0,0.12)",
        }}
      >
        {endCard.cta}
      </div>
    </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- composition ----------

export const AdVideo = (props: AdVideoProps) => {
  const { fps, width, height, durationInFrames } = useVideoConfig();
  useFonts(props.fonts);
  const metrics = useMemo(() => captionMetrics(width, height, props.safeZone), [width, height, props.safeZone]);

  const hasExternalAudio = Boolean(props.voiceover || props.music);
  const endFrames = secToFrames(props.endCard.durationSec, fps);
  const endStart = Math.max(0, durationInFrames - endFrames);

  let cursor = 0;
  const sceneSequences = props.scenes.map((scene, i) => {
    const frames = secToFrames(scene.durationSec, fps);
    const from = cursor;
    cursor += frames;
    return (
      <Sequence key={`scene-${i}`} from={from} durationInFrames={frames} premountFor={fps}>
        <SceneLayer src={scene.src} kind={scene.kind} muted={scene.muted ?? hasExternalAudio} durationFrames={frames} posterSrc={scene.posterSrc} />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {sceneSequences}

      {props.overlays.map((o, i) => (
        <Sequence key={`overlay-${i}`} from={secToFrames(o.atSec, fps)} durationInFrames={secToFrames(o.durationSec, fps)} premountFor={fps}>
          <SceneLayer src={o.src} kind={o.kind} muted durationFrames={secToFrames(o.durationSec, fps)} />
        </Sequence>
      ))}

      {props.captions.map((c, i) => (
        <Sequence key={`caption-${i}`} from={secToFrames(c.fromSec, fps)} durationInFrames={secToFrames(c.toSec - c.fromSec, fps)}>
          <Caption caption={c} style={props.captionStyle} fonts={props.fonts} accent={props.captionStyle.accent ?? props.brand.colors.accent} metrics={metrics} />
        </Sequence>
      ))}

      {props.hook ? (
        <Sequence from={secToFrames(props.hook.fromSec, fps)} durationInFrames={secToFrames(props.hook.toSec - props.hook.fromSec, fps)}>
          <Hook text={props.hook.text} fonts={props.fonts} metrics={metrics} offset={props.aiLabel ? Math.round(metrics.hookSize * 0.9) : 0} boxed={props.captionStyle.style !== "clean"} placement={props.hookPlacement ?? "top"} />
        </Sequence>
      ) : null}

      {props.voiceover ? (
        <Sequence from={secToFrames(props.voiceover.startSec ?? 0, fps)}>
          <Audio src={props.voiceover.src} />
        </Sequence>
      ) : null}
      {props.music ? <Audio src={props.music.src} volume={props.music.volume} loop /> : null}

      {props.aiLabel ? (
        <AbsoluteFill style={{ alignItems: "flex-end", paddingTop: metrics.topInset, paddingRight: metrics.sideInset }}>
          <div
            style={{
              fontFamily: `${BODY_FAMILY}, ${props.fonts.body}, "DM Sans", sans-serif`,
              fontWeight: 600,
              fontSize: Math.round(Math.min(width, height) / 38),
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#fff",
              background: "rgba(20,20,18,0.6)",
              padding: `${Math.round(width * 0.008)}px ${Math.round(width * 0.016)}px`,
              borderRadius: 999,
            }}
          >
            AI-generated
          </div>
        </AbsoluteFill>
      ) : null}

      <Sequence from={endStart} durationInFrames={endFrames}>
        <EndCard brand={props.brand} endCard={props.endCard} fonts={props.fonts} width={width} height={height} />
      </Sequence>
    </AbsoluteFill>
  );
};
