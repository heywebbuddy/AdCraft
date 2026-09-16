import { Composition } from "remotion";
import { AdVideo } from "./AdVideo";
import { VIDEO_FPS, type AdVideoProps } from "./document";

/** Placeholder props for the studio; real renders pass full props through `renderVideo`. */
export const defaultAdVideoProps: AdVideoProps = {
  width: 1080,
  height: 1920,
  fps: VIDEO_FPS,
  scenes: [{ src: "https://placehold.co/1080x1920/242521/f8f7f3.png", kind: "image", durationSec: 3 }],
  overlays: [],
  captions: [{ text: "Morning skin, without the morning.", fromSec: 0, toSec: 3 }],
  captionStyle: { style: "bold", position: "bottom" },
  hook: { text: "Two weeks. That’s it.", fromSec: 0, toSec: 2.5 },
  brand: { name: "Aurelle", colors: { primary: "#242521", accent: "#e65c32", background: "#f8f7f3", text: "#242521" }, fonts: { heading: "DM Sans", body: "DM Sans" } },
  endCard: { headline: "Shop the serum", cta: "Shop now", durationSec: 2 },
  safeZone: { top: 250, right: 60, bottom: 340, left: 60 },
  aiLabel: false,
  fonts: { heading: "DM Sans", body: "DM Sans", headingFile: "dm-sans-700.ttf", bodyFile: "dm-sans-600.ttf", serifFile: "instrument-serif-italic.ttf" },
};

function totalFrames(p: AdVideoProps) {
  const scenes = p.scenes.reduce((s, sc) => s + Math.max(1, Math.round(sc.durationSec * p.fps)), 0);
  return scenes + Math.max(1, Math.round(p.endCard.durationSec * p.fps));
}

export const Root = () => (
  <Composition
    id="AdVideo"
    component={AdVideo}
    width={defaultAdVideoProps.width}
    height={defaultAdVideoProps.height}
    fps={VIDEO_FPS}
    durationInFrames={totalFrames(defaultAdVideoProps)}
    defaultProps={defaultAdVideoProps}
    calculateMetadata={({ props }) => ({ width: props.width, height: props.height, fps: props.fps, durationInFrames: totalFrames(props) })}
  />
);
