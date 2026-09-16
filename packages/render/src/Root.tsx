import { Composition } from "remotion";
import { ProductVideo, type ProductVideoProps } from "./compositions/ProductVideo";

const defaultProps: ProductVideoProps = {
  brand: { name: "Adcraft", primaryColor: "#e65c32" },
  headline: "Ads that look like your brand",
  cta: "Shop now",
  scenes: [{ src: "https://placehold.co/1080x1920/242521/f8f7f3.png", kind: "image", durationSec: 3 }],
};

export const Root = () => (
  <>
    <Composition
      id="ProductVideo-9x16"
      component={ProductVideo}
      durationInFrames={30 * 5}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
    <Composition
      id="ProductVideo-1x1"
      component={ProductVideo}
      durationInFrames={30 * 5}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={defaultProps}
    />
  </>
);
