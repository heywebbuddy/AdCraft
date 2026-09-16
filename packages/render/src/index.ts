// Static ads: layered document + satori/resvg renderer (Release 1).
export * from "./static/document";
export { renderStatic, renderStaticSet, type RenderOptions, type AssetRef } from "./static/render";
export { loadFonts, type SatoriFont } from "./static/fonts";
export { frameFor, type Frame } from "./static/layout";

// Remotion compositions (Release 2, video) are kept under src/compositions and
// src/remotion.ts but are not exported from the package entry, so the app bundle
// never pulls in remotion. Run them with `pnpm --filter @adcraft/render studio`.
