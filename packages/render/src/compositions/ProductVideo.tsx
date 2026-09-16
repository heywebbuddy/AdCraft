import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface ProductVideoScene {
  /** AI-generated clip or still (URL). */
  src: string;
  kind: "video" | "image";
  durationSec: number;
  caption?: string;
}

export interface ProductVideoProps extends Record<string, unknown> {
  brand: { name: string; primaryColor: string; logoUrl?: string; font?: string };
  headline: string;
  cta: string;
  scenes: ProductVideoScene[];
  voiceoverUrl?: string;
  musicUrl?: string;
}

/**
 * Skeleton Remotion composition: scenes in sequence, headline overlay, end card with CTA.
 * TODO: use <OffthreadVideo> for video scenes, <Audio> for voiceover/music, brand fonts via @remotion/google-fonts,
 * and per-placement safe zones from @adcraft/specs.
 */
export const ProductVideo = ({ brand, headline, cta, scenes }: ProductVideoProps) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  let from = 0;
  const endCardFrames = fps * 2;
  const endCardStart = durationInFrames - endCardFrames;
  const endOpacity = interpolate(frame, [endCardStart, endCardStart + fps / 2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: brand.font ?? "DM Sans, sans-serif" }}>
      {scenes.map((scene, i) => {
        const frames = Math.round(scene.durationSec * fps);
        const start = from;
        from += frames;
        return (
          <Sequence key={i} from={start} durationInFrames={frames}>
            <AbsoluteFill>
              {scene.kind === "image" ? (
                <Img src={scene.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                // TODO: <OffthreadVideo src={scene.src} />
                <AbsoluteFill style={{ backgroundColor: "#222" }} />
              )}
              {scene.caption ? (
                <div style={{ position: "absolute", bottom: 240, left: 60, right: 60, color: "#fff", fontSize: 56, fontWeight: 600 }}>
                  {scene.caption}
                </div>
              ) : null}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      <div style={{ position: "absolute", top: 260, left: 60, right: 60, color: "#fff", fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
        {headline}
      </div>

      <AbsoluteFill
        style={{
          opacity: endOpacity,
          backgroundColor: brand.primaryColor,
          justifyContent: "center",
          alignItems: "center",
          gap: 32,
        }}
      >
        {brand.logoUrl ? <Img src={brand.logoUrl} style={{ width: 240 }} /> : null}
        <div style={{ color: "#fff", fontSize: 64, fontWeight: 700 }}>{cta}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
