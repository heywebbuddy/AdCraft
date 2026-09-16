/**
 * Video smoke test: renders a 3-second AdVideo (one still scene with a hook + caption,
 * a 1 s end card) at 9:16 and writes scripts/out/smoke-video.mp4. Run with:
 *   pnpm --filter @adcraft/render exec tsx scripts/smoke-video.ts
 *
 * First run downloads Chrome Headless Shell (~150 MB) via @remotion/renderer's
 * ensureBrowser() and bundles the composition (~10–20 s). Subsequent runs reuse both.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderVideo, type VideoDocument } from "../src/video/index";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "out");
await fs.mkdir(outDir, { recursive: true });

const still = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#d9744a" } })
  .composite([
    {
      input: Buffer.from(
        `<svg width="1080" height="1920"><defs><radialGradient id="g" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#fbe7cf"/><stop offset=".5" stop-color="#f0b489"/><stop offset="1" stop-color="#7a3a22"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><rect x="380" y="700" width="320" height="720" rx="90" fill="#f8f7f3" stroke="#242521" stroke-width="8"/><rect x="440" y="900" width="200" height="300" rx="10" fill="#e65c32"/></svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .png()
  .toBuffer();

const doc: VideoDocument = {
  kind: "video",
  model: "kling-3.0",
  ratio: "9:16",
  script: "Morning skin, without the morning.",
  scenes: [
    {
      id: "s1",
      line: "Morning skin, without the morning.",
      caption: "Morning skin, without the morning.",
      prompt: "serum on marble",
      durationSec: 2,
      hookText: "Two weeks. That’s it.",
      still: { url: `data:image/png;base64,${still.toString("base64")}` },
    },
  ],
  product: { name: "Everyday Serum" },
  brand: {
    name: "Aurelle",
    colors: { primary: "#242521", accent: "#e65c32", background: "#f8f7f3", text: "#242521" },
    fonts: { heading: "DM Sans", body: "DM Sans" },
  },
  captions: { style: "bold", position: "bottom" },
  endCard: { headline: "Shop the serum", cta: "Shop now", durationSec: 1 },
  aiLabel: true,
};

const t0 = Date.now();
let last = -1;
const mp4 = await renderVideo(doc, {
  ratio: "9:16",
  logLevel: "warn",
  onProgress: (f) => {
    const pct = Math.round(f * 10) * 10;
    if (pct !== last) {
      last = pct;
      process.stdout.write(`\r  render ${pct}%   `);
    }
  },
});
const file = path.join(outDir, "smoke-video.mp4");
await fs.writeFile(file, mp4);
console.log(`\nwrote ${file} (${(mp4.byteLength / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(0);
