/**
 * Replace the graphic Ken-Burns spots with real image-to-video clips.
 * One continuous 5s film per still — no overlays, no slideshow.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ads = path.join(root, "dist/assets/ads");
const require = createRequire(path.join(root, "packages/ai/package.json"));
const [{ createFalClient }, sharp] = await Promise.all([
  import(pathToFileURL(require.resolve("@fal-ai/client")).href),
  import(pathToFileURL(require.resolve("sharp")).href).then((m) => m.default ?? m),
]);

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY is missing");
  process.exit(1);
}

const fal = createFalClient({ credentials: process.env.FAL_KEY });
const only = new Set(process.argv.slice(2));

const jobs = [
  {
    file: "eclat-ugc.mp4",
    image: "eclat-ugc-1.webp",
    prompt:
      "She talks naturally to camera, slight head and hand movement, holding the frosted peach serum bottle. Warm bathroom light, authentic smartphone UGC, photoreal, no text, no logos, no watermark.",
  },
  {
    file: "stride-go.mp4",
    image: "stride-street.webp",
    prompt:
      "He keeps running toward the camera on the empty dawn street, natural running motion, lime sneakers catching the light. Cinematic sports commercial, photoreal, no text, no logos, no watermark.",
  },
  {
    file: "eclat-drop.mp4",
    image: "eclat-hands.webp",
    prompt:
      "A single drop of peach-gold serum slowly falls from the glass pipette and hangs, then drops. Luxury beauty commercial, shallow depth of field, photoreal, no text, no logos, no watermark.",
  },
  {
    file: "stride-splash.mp4",
    image: "stride-detail.webp",
    prompt:
      "Water droplets splash and hang in the air around the lime running shoe on wet ground. Slow-motion product commercial, photoreal, no text, no logos, no watermark.",
  },
  {
    file: "form-on.mp4",
    image: "form-listen.webp",
    prompt:
      "She breathes softly, a little hair movement, golden-hour window light shifting on her face and the cobalt headphones. Quiet cinematic product film, photoreal, no text, no logos, no watermark.",
  },
  {
    file: "noir-mist.mp4",
    image: "noir-perfume.webp",
    prompt:
      "A thin ribbon of smoke drifts past the black faceted perfume bottle, light sliding across the glass. Cinematic fragrance film, photoreal, no text, no logos, no watermark.",
  },
].filter((j) => !only.size || only.has(j.file));

async function crop34(file) {
  const buf = await readFile(path.join(ads, file));
  return sharp(buf).resize(1080, 1440, { fit: "cover", position: "centre" }).png().toBuffer();
}

async function render(job) {
  console.log(`[${job.file}] uploading start frame`);
  const png = await crop34(job.image);
  const start = await fal.storage.upload(new Blob([png], { type: "image/png" }));
  console.log(`[${job.file}] generating`);
  const result = await fal.subscribe("fal-ai/kling-video/v3/standard/image-to-video", {
    input: {
      prompt: job.prompt,
      start_image_url: start,
      duration: "5",
      generate_audio: false,
    },
    logs: false,
  });
  const url = result?.data?.video?.url;
  if (!url) throw new Error(`${job.file}: no video url (${JSON.stringify(result).slice(0, 240)})`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${job.file}: download ${res.status}`);
  const out = path.join(ads, job.file);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log(`[${job.file}] saved`);
}

const results = await Promise.allSettled(jobs.map(render));
let failed = 0;
for (const [i, result] of results.entries()) {
  if (result.status === "rejected") {
    failed += 1;
    console.error(`[${jobs[i].file}] ${result.reason?.message ?? result.reason}`);
  }
}
if (failed) process.exit(1);
