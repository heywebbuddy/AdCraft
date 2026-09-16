// Video (Release 2): document types + local Remotion renderer.
// Imported by the app as `@adcraft/render/video` so the static entry never pulls in Remotion.
export * from "./document";
export {
  renderVideo,
  buildAdVideoProps,
  safeZoneFor,
  getBundle,
  getVideoRenderer,
  LocalRemotionRenderer,
  BUNDLE_DIR,
  FONT_FILES,
  type AssetLoader,
  type RenderVideoOptions,
  type VideoRenderer,
} from "./render";
