import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fonts for satori. Fetched from Google Fonts (TTF) at render time and cached in
 * memory for the life of the process; falls back to the TTFs bundled under
 * `packages/render/fonts/` when the network is unavailable.
 */
export type SatoriFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" | "italic" };

type FontFace = { family: string; weight: 400 | 500 | 600 | 700; style: "normal" | "italic"; bundled?: string };

const BUNDLED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fonts");

/** Faces every template needs. */
const CORE_FACES: FontFace[] = [
  { family: "DM Sans", weight: 400, style: "normal", bundled: "dm-sans-400.ttf" },
  { family: "DM Sans", weight: 600, style: "normal", bundled: "dm-sans-600.ttf" },
  { family: "DM Sans", weight: 700, style: "normal", bundled: "dm-sans-700.ttf" },
  { family: "Instrument Serif", weight: 400, style: "italic", bundled: "instrument-serif-italic.ttf" },
];

const cache = new Map<string, Promise<ArrayBuffer | null>>();
const faceKey = (f: FontFace) => `${f.family}|${f.weight}|${f.style}`;

// A non-browser UA makes Google return plain TTF urls (satori cannot read woff2).
const UA = "Mozilla/5.0 (compatible; AdcraftRender/1.0)";

async function fetchFromGoogle(face: FontFace): Promise<ArrayBuffer | null> {
  const family = face.family.trim().replace(/\s+/g, "+");
  const axis = face.style === "italic" ? `ital,wght@1,${face.weight}` : `wght@${face.weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:${axis}&display=swap`;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const css = await fetch(cssUrl, { headers: { "user-agent": UA }, signal: ctl.signal }).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src:\s*url\((https:[^)]+\.(?:ttf|otf))\)/)?.[1];
    if (!url) {
      clearTimeout(timer);
      return null;
    }
    const buf = await fetch(url, { signal: ctl.signal }).then((r) => (r.ok ? r.arrayBuffer() : null));
    clearTimeout(timer);
    return buf;
  } catch {
    return null;
  }
}

async function readBundled(file?: string): Promise<ArrayBuffer | null> {
  if (!file) return null;
  try {
    const b = await fs.readFile(path.join(BUNDLED_DIR, file));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

function loadFace(face: FontFace): Promise<ArrayBuffer | null> {
  const key = faceKey(face);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      // Bundled first for the core faces (deterministic, no network); Google for everything else.
      const bundled = await readBundled(face.bundled);
      if (bundled) return bundled;
      const remote = await fetchFromGoogle(face);
      if (remote) return remote;
      return null;
    })();
    cache.set(key, p);
    // Do not cache failures forever: drop the entry so a later render can retry.
    p.then((v) => {
      if (!v) cache.delete(key);
    });
  }
  return p;
}

/**
 * Loads the core faces plus the brand's heading/body families (when they differ
 * from DM Sans and are available on Google Fonts). Returns satori-ready fonts and
 * the family names that actually resolved so templates can fall back.
 */
export async function loadFonts(brand: { heading: string; body: string }): Promise<{ fonts: SatoriFont[]; resolved: Set<string> }> {
  const wanted: FontFace[] = [...CORE_FACES];
  for (const family of new Set([brand.heading, brand.body].map((f) => f.trim()).filter(Boolean))) {
    if (family === "DM Sans" || family === "Instrument Serif") continue;
    wanted.push({ family, weight: 700, style: "normal" }, { family, weight: 400, style: "normal" });
  }
  const loaded = await Promise.all(wanted.map(async (f) => ({ face: f, data: await loadFace(f) })));
  const fonts: SatoriFont[] = [];
  const resolved = new Set<string>();
  for (const { face, data } of loaded) {
    if (!data) continue;
    fonts.push({ name: face.family, data, weight: face.weight, style: face.style });
    resolved.add(face.family);
  }
  if (!resolved.has("DM Sans")) throw new Error("Core font DM Sans could not be loaded (bundled file missing and Google Fonts unreachable)");
  return { fonts, resolved };
}
