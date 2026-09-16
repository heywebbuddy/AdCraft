/**
 * Smoke test: renders one document through all four templates at all five ratios
 * and writes PNGs to scripts/out/. Run with:
 *   pnpm --filter @adcraft/render exec tsx scripts/smoke.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { placements } from "@adcraft/specs";
import { renderStatic, STATIC_TEMPLATES, type StaticAdDocument } from "../src/index";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "out");
await fs.mkdir(outDir, { recursive: true });

// Synthetic assets so the script needs no network and no DB.
const scene = await sharp({
  create: { width: 1080, height: 1350, channels: 3, background: "#d9744a" },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="1080" height="1350"><defs><radialGradient id="g" cx="25%" cy="15%" r="90%"><stop offset="0" stop-color="#fbe7cf"/><stop offset=".5" stop-color="#f0b489"/><stop offset="1" stop-color="#7a3a22"/></radialGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><circle cx="800" cy="1100" r="260" fill="#c95f3a" opacity=".6"/></svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .png()
  .toBuffer();

const cutout = await sharp(
  Buffer.from(
    `<svg width="600" height="900"><rect x="180" y="40" width="240" height="120" rx="24" fill="#2b2a26"/><rect x="120" y="150" width="360" height="700" rx="90" fill="#f8f7f3" stroke="#242521" stroke-width="6"/><rect x="170" y="330" width="260" height="300" rx="10" fill="#e65c32"/><text x="300" y="500" font-family="Helvetica" font-size="48" font-weight="700" text-anchor="middle" fill="#fff">SERUM</text></svg>`,
  ),
)
  .png()
  .toBuffer();

const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

const base: StaticAdDocument = {
  template: "hero",
  scene: { kind: "image", url: dataUrl(scene) },
  product: { cutoutUrl: dataUrl(cutout), scale: 1, x: 0, y: 0 },
  headline: "Morning skin, without the morning.",
  subhead: "One pump of the Everyday Serum. Nothing else before coffee.",
  cta: "Shop the serum",
  brand: {
    name: "Aurelle",
    colors: { primary: "#242521", accent: "#e65c32", background: "#f8f7f3", text: "#242521" },
    fonts: { heading: "DM Sans", body: "DM Sans" },
  },
  layout: { align: "left", headlineSize: 84, overlay: 0.55 },
};

const sizes = [
  ...placements.filter((p) => ["meta.feed.1x1", "meta.feed.4x5", "meta.stories.9x16", "youtube.instream.16x9", "google.demandgen.1.91x1"].includes(p.id)),
];

let total = 0;
const t0 = Date.now();
for (const tpl of STATIC_TEMPLATES) {
  for (const p of sizes) {
    const started = Date.now();
    const png = await renderStatic({ ...base, template: tpl.id }, { width: p.width, height: p.height, ratio: p.ratio, safeZone: p.safeZone });
    const meta = await sharp(png).metadata();
    if (meta.width !== p.width || meta.height !== p.height || meta.format !== "png") {
      throw new Error(`Bad output for ${tpl.id} ${p.ratio}: ${meta.format} ${meta.width}x${meta.height}`);
    }
    const file = path.join(outDir, `${tpl.id}-${p.ratio.replace(":", "x")}.png`);
    await fs.writeFile(file, png);
    total++;
    console.log(`${tpl.id.padEnd(8)} ${p.ratio.padEnd(7)} ${String(p.width).padStart(4)}x${String(p.height).padEnd(4)} ${(png.byteLength / 1024).toFixed(0).padStart(5)} KB  ${Date.now() - started} ms`);
  }
}
// Gradient scene, no product, centred copy.
const png = await renderStatic(
  { ...base, scene: { kind: "gradient", from: "#1d2a4a", to: "#e97b5a", angle: 135 }, product: null, layout: { ...base.layout, align: "center" } },
  { width: 1080, height: 1080, ratio: "1:1" },
);
await fs.writeFile(path.join(outDir, "hero-gradient-noproduct.png"), png);
total++;
console.log(`\n${total} renders in ${Date.now() - t0} ms -> ${outDir}`);
