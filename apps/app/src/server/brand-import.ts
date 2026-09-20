import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { and, eq, sql } from "drizzle-orm";
import { db, dbReady, brands, brandKits, type BrandKitData } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import { KIT_FONTS, KIT_TONES, DEFAULT_KIT, withDefaults, type KitFont, type KitTone } from "@/lib/brand-kit";
import { UA } from "./product-import";
import { assertPublicHost, BlockedUrlError, safeFetch } from "./net";

/**
 * Build a brand kit from a website. Four sources, combined:
 *  - the HTML: title, headline, description, logo candidates, theme colour, Google Fonts links
 *  - its stylesheets: every colour and font-family declared, counted, with custom-property
 *    names like --brand / --primary / --accent weighted up
 *  - a screenshot (Remotion's Chrome Headless Shell, already in the image for video renders):
 *    stored for the kit page and sampled for the colours that are actually on screen
 *  - the words: headline + description give the tone hints
 * Nothing here is an AI call; it takes 5–25 s (the screenshot is the slow part) and costs nothing.
 */

export type SiteImport = {
  url: string;
  siteName: string | null;
  headline: string | null;
  description: string | null;
  logoUrl: string | null;
  screenshotUrl: string | null;
  colors: BrandKitData["colors"];
  palette: string[];
  fonts: { heading: KitFont; body: KitFont; detected: string[] };
  tone: KitTone[];
};

const CSS_LIMIT = 400_000;
const HTML_LIMIT = 1_500_000;

export function normaliseSiteUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new Error("Enter the website address.");
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links work.");
  if (!u.hostname.includes(".")) throw new Error("That address is not public.");
  return u;
}

// ── HTML ───────────────────────────────────────────────────────────────────────

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function strip(html: string) {
  return decode(html.replace(/<[^>]+>/g, " "));
}

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return null;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Text of the first <h1>, else the biggest-looking <h2>; the site's own one-line pitch. */
function headline(html: string): string | null {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, "");
  for (const tag of ["h1", "h2"]) {
    for (const m of body.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))) {
      const t = strip(m[1]!);
      if (t.length >= 8 && t.length <= 140 && !/cookie|sign in|log in|menu|search/i.test(t)) return t;
    }
  }
  return null;
}

function headings(html: string): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
  const out: string[] = [];
  for (const m of body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = strip(m[1]!);
    if (t.length >= 4 && t.length <= 160) out.push(t);
    if (out.length >= 24) break;
  }
  return out;
}

type LogoCandidate = { url?: string; svg?: string; score: number; why: string };

/** Logo candidates in order of trust: JSON-LD Organization.logo, <img> marked "logo" in the header, inline <svg> logo, apple-touch-icon, icon. */
function logoCandidates(html: string, base: URL): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  const abs = (u: string) => {
    try {
      return new URL(u.trim(), base).toString();
    } catch {
      return null;
    }
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]!.trim());
      const nodes: unknown[] = Array.isArray(data) ? data : [data, ...(Array.isArray((data as { "@graph"?: unknown[] })["@graph"]) ? (data as { "@graph": unknown[] })["@graph"] : [])];
      for (const n of nodes) {
        const node = n as { "@type"?: string | string[]; logo?: string | { url?: string }; publisher?: { logo?: string | { url?: string } } };
        const type = Array.isArray(node["@type"]) ? node["@type"].join(",") : node["@type"] ?? "";
        const logo = node.logo ?? node.publisher?.logo;
        const url = typeof logo === "string" ? logo : logo?.url;
        if (url && /Organization|Brand|WebSite|Store|Corporation|LocalBusiness/i.test(type)) {
          const a = abs(url);
          if (a) out.push({ url: a, score: 100, why: "structured data" });
        }
      }
    } catch {}
  }
  const header = html.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? html.slice(0, 60_000);
  for (const scope of [header, html]) {
    for (const m of scope.matchAll(/<img\b[^>]*>/gi)) {
      const a = attrs(m[0]);
      const hint = `${a.class ?? ""} ${a.id ?? ""} ${a.alt ?? ""} ${a.src ?? ""} ${a["data-src"] ?? ""}`.toLowerCase();
      if (!/logo|brand|wordmark/.test(hint) || /payment|partner|badge|award|trust|client|press|stripe|visa|paypal/.test(hint)) continue;
      const src = a.src && !a.src.startsWith("data:") ? a.src : a["data-src"] ?? a.srcset?.split(",")[0]?.trim().split(" ")[0];
      const u = src ? abs(src) : null;
      if (!u) continue;
      const svg = /\.svg(\?|$)/i.test(u);
      out.push({ url: u, score: (scope === header ? 80 : 60) + (svg ? 10 : 0) + (/\blogo\b/.test(a.alt?.toLowerCase() ?? "") ? 5 : 0), why: "logo image" });
    }
    for (const m of scope.matchAll(/<(a|div|span)\b[^>]*(?:class|id|aria-label)=["'][^"']*logo[^"']*["'][^>]*>\s*(<svg[\s\S]*?<\/svg>)/gi)) {
      const svg = m[2]!;
      if (svg.length > 60_000 || !/viewBox|width/i.test(svg)) continue;
      out.push({ svg, score: scope === header ? 75 : 55, why: "inline svg" });
    }
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel ?? "").toLowerCase();
    if (!a.href) continue;
    const u = abs(a.href);
    if (!u) continue;
    if (rel.includes("apple-touch-icon")) out.push({ url: u, score: 40, why: "apple touch icon" });
    else if (rel.includes("icon") && !/\.ico(\?|$)/i.test(u)) {
      const size = Number(a.sizes?.split("x")[0] ?? 0);
      out.push({ url: u, score: 20 + Math.min(size / 32, 10), why: "icon" });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 8);
}

// ── CSS ────────────────────────────────────────────────────────────────────────

function stylesheetUrls(html: string, base: URL): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (!/stylesheet/i.test(a.rel ?? "") || !a.href) continue;
    if (/fonts\.googleapis|fonts\.gstatic|font-awesome|fontawesome/i.test(a.href)) continue;
    try {
      out.push(new URL(a.href, base).toString());
    } catch {}
  }
  return [...new Set(out)].slice(0, 6);
}

function googleFontFamilies(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const fam of m[1]!.matchAll(/family=([^&:]+)/g)) out.push(decodeURIComponent(fam[1]!.replace(/\+/g, " ")).split("|")[0]!.trim());
  }
  return out;
}

type RGB = [number, number, number];
const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

function parseColor(raw: string): RGB | null {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,4})$/);
  if (m) {
    const h = m[1]!;
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
  }
  m = s.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4, 6), 16)];
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1) : 1;
    if (a < 0.5) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (m) return hslToRgb(Number(m[1]) / 360, Number(m[2]) / 100, Number(m[3]) / 100);
  return null;
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

function hsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return { h: h * 360, s, l };
}

function distance(a: RGB, b: RGB) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

type Swatch = { rgb: RGB; hex: string; score: number; css: number; pixels: number };

/** Merge colours that are within a small RGB distance so #e65c32 and #e65d33 count once. */
function bucket(colors: Map<string, { rgb: RGB; score: number; css: number; pixels: number }>): Swatch[] {
  const out: Swatch[] = [];
  for (const c of [...colors.values()].sort((x, y) => y.score - x.score)) {
    const near = out.find((o) => distance(o.rgb, c.rgb) < 22);
    if (near) {
      near.score += c.score; near.css += c.css; near.pixels += c.pixels;
    } else out.push({ rgb: c.rgb, hex: toHex(c.rgb), score: c.score, css: c.css, pixels: c.pixels });
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Every colour and font-family in a pile of CSS, counted, with brand-ish custom properties weighted. */
function scanCss(css: string, colors: Map<string, { rgb: RGB; score: number; css: number; pixels: number }>, fonts: Map<string, number>) {
  const add = (raw: string, weight: number) => {
    const rgb = parseColor(raw);
    if (!rgb) return;
    const key = toHex(rgb);
    const cur = colors.get(key) ?? { rgb, score: 0, css: 0, pixels: 0 };
    cur.score += weight; cur.css += 1;
    colors.set(key, cur);
  };
  for (const m of css.matchAll(/(--[a-z0-9-]*)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi)) {
    const name = m[1]!.toLowerCase();
    const w = /brand|primary|accent|cta|highlight|main/.test(name) ? 12 : /secondary|muted|text|body|foreground|background|bg/.test(name) ? 3 : 2;
    add(m[2]!, w);
  }
  for (const m of css.matchAll(/(?:^|[;{\s])(?:background(?:-color)?|color|border-color|fill)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/gi)) add(m[1]!, 1);
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1]!.split(",")[0]!.replace(/["']/g, "").trim();
    if (!first || /^(inherit|initial|unset|var\(|-apple-system|system-ui|sans-serif|serif|monospace|ui-)/i.test(first)) continue;
    fonts.set(first, (fonts.get(first) ?? 0) + 1);
  }
}

// ── Screenshot ─────────────────────────────────────────────────────────────────

let chromePath: Promise<string | null> | null = null;
let chromeNoSandbox = false;
async function chrome(): Promise<string | null> {
  if (!chromePath) {
    chromePath = (async () => {
      try {
        const { ensureBrowser } = await import("@remotion/renderer");
        const status = (await ensureBrowser({ logLevel: "error", browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null })) as { type: string; path?: string };
        return status.path ?? null;
      } catch (err) {
        console.warn("[brand-import] no browser for screenshots:", err instanceof Error ? err.message : err);
        return null;
      }
    })();
  }
  return chromePath;
}

/** Full-window PNG of the page at 1440×900 after ~5 s of virtual time (lazy sections included). */
async function screenshot(url: string): Promise<Buffer | null> {
  const exe = await chrome();
  if (!exe) return null;
  const target = new URL(url);
  // Pin the hostname to the address we verified, and make internal names unresolvable, so the
  // page (and anything it loads) cannot reach our own network. See server/net.ts.
  let pinned: string;
  try {
    pinned = await assertPublicHost(target.hostname);
  } catch {
    return null;
  }
  const resolverRules = [`MAP ${target.hostname} ${pinned}`, "MAP localhost ~NOTFOUND", "MAP *.internal ~NOTFOUND", "MAP *.local ~NOTFOUND", "MAP metadata.google.internal ~NOTFOUND"].join(",");
  const dir = await mkdtemp(path.join(os.tmpdir(), "adcraft-site-"));
  const file = path.join(dir, "shot.png");
  const run = (noSandbox: boolean) =>
    new Promise<void>((resolve, reject) =>
      execFile(
        exe,
        [
          "--headless",
          "--disable-gpu",
          ...(noSandbox ? ["--no-sandbox"] : []),
          "--disable-dev-shm-usage",
          "--hide-scrollbars",
          `--user-data-dir=${path.join(dir, "profile")}`,
          "--window-size=1440,900",
          "--virtual-time-budget=5000",
          "--timeout=15000",
          `--host-resolver-rules=${resolverRules}`,
          `--user-agent=${UA}`,
          `--screenshot=${file}`,
          url,
        ],
        { timeout: 12_000 },
        // Chrome logs page console output to stderr; only a non-zero exit means it failed.
        (err) => (err ? reject(new Error(String(err.message).slice(0, 300))) : resolve()),
      ),
    );
  try {
    // Prefer Chrome's own sandbox; containers without user namespaces need it off, and that is
    // remembered for the process so only the first screenshot pays for the retry.
    if (chromeNoSandbox) await run(true);
    else {
      try {
        await run(false);
      } catch (err) {
        if (!/sandbox|namespace|SUID|setuid|No usable/i.test(String(err))) throw err;
        console.warn("[brand-import] Chrome sandbox unavailable here; continuing without it");
        chromeNoSandbox = true;
        await run(true);
      }
    }
    return await readFile(file);
  } catch (err) {
    console.warn("[brand-import] screenshot failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Sample the screenshot: how much of the screen each (quantised) colour covers. */
async function pixelColors(png: Buffer, colors: Map<string, { rgb: RGB; score: number; css: number; pixels: number }>) {
  const { data, info } = await sharp(png).resize(96, 60, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  const counts = new Map<string, { rgb: RGB; n: number }>();
  for (let i = 0; i < data.length; i += 3) {
    const rgb: RGB = [Math.round(data[i]! / 12) * 12, Math.round(data[i + 1]! / 12) * 12, Math.round(data[i + 2]! / 12) * 12];
    const key = toHex(rgb);
    const cur = counts.get(key) ?? { rgb, n: 0 };
    cur.n += 1;
    counts.set(key, cur);
  }
  for (const { rgb, n } of counts.values()) {
    const share = n / total;
    if (share < 0.004) continue;
    const key = toHex(rgb);
    const cur = colors.get(key) ?? { rgb, score: 0, css: 0, pixels: 0 };
    // Coverage matters, but photos flood the histogram: saturated colours earn more per pixel.
    const { s } = hsl(rgb);
    cur.score += share * (s > 0.35 ? 60 : 25);
    cur.pixels += share;
    colors.set(key, cur);
  }
}

// ── Assignment ─────────────────────────────────────────────────────────────────

function assignColors(swatches: Swatch[], themeColor: string | null): { colors: BrandKitData["colors"]; palette: string[] } {
  const withHsl = swatches.map((s) => ({ ...s, ...hsl(s.rgb) }));
  const light = withHsl.filter((c) => c.l > 0.82);
  const dark = withHsl.filter((c) => c.l < 0.32);
  const saturated = withHsl.filter((c) => c.s > 0.38 && c.l > 0.14 && c.l < 0.8);
  const muted = withHsl.filter((c) => c.s <= 0.38 && c.l >= 0.32 && c.l <= 0.7);

  // Most-covered light colour is the canvas — unless a lighter one is nearly as present, which
  // usually means a cookie or country modal dimmed the page and the true white sits underneath.
  const lightByCover = light.sort((a, b) => b.pixels - a.pixels);
  const top = lightByCover[0];
  const truer = top ? lightByCover.find((c) => c.l > top.l + 0.06 && c.pixels >= top.pixels * 0.3) : undefined;
  const background = (truer ?? top)?.hex ?? withHsl.sort((a, b) => b.pixels - a.pixels)[0]?.hex ?? DEFAULT_KIT.colors.background!;
  const text = dark.sort((a, b) => b.score - a.score)[0]?.hex ?? "#1d1d1b";

  const theme = themeColor ? parseColor(themeColor) : null;
  // Framework and browser defaults that show up in every stylesheet but are nobody's brand.
  const generic = ["#007aff", "#0000ee", "#0d6efd", "#1a0dab", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#1877f2", "#4285f4", "#dc3545", "#198754", "#ffc107"].map((h) => parseColor(h)!);
  const onScreen = saturated.some((c) => c.pixels > 0);
  const ranked = saturated
    .map((c) => ({
      ...c,
      score:
        c.score +
        (theme && distance(theme, c.rgb) < 30 ? 40 : 0) +
        (c.pixels > 0 ? 30 : onScreen ? -15 : 0) +
        (generic.some((g) => distance(g, c.rgb) < 18) ? -40 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  // Primary carries headlines and logo marks, accent carries buttons. The strongest brand colour
  // takes the role its lightness suits; the next distinct colour takes the other.
  const lead = ranked[0];
  const distinct = (from: (typeof ranked)[number]) => ranked.find((c) => c !== from && (Math.abs(c.h - from.h) > 35 || Math.abs(c.l - from.l) > 0.3));
  let primary: string | undefined;
  let accent: string | undefined;
  if (lead && lead.l < 0.45) {
    primary = lead.hex;
    accent = distinct(lead)?.hex ?? lead.hex;
  } else if (lead) {
    accent = lead.hex;
    primary = ranked.find((c) => c !== lead && c.l < 0.45)?.hex ?? text;
  }
  primary ??= text;
  accent ??= primary !== text ? primary : DEFAULT_KIT.colors.accent!;
  const secondary = muted.sort((a, b) => b.score - a.score)[0]?.hex ?? toHex(blend(parseColor(text)!, parseColor(background)!, 0.55));

  const palette = [...new Set([primary, accent, ...ranked.map((c) => c.hex), secondary, text, background])].slice(0, 8);
  return { colors: { primary, secondary, accent, background, text }, palette };
}

function blend(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const SERIF = /serif|playfair|garamond|georgia|times|lora|merriweather|cormorant|baskerville|fraunces|caslon|didot|bodoni|tiempos|canela|freight|minion|editorial|recoleta|domine|spectral|crimson|eb |pt serif/i;
const GEOMETRIC = /poppins|montserrat|futura|circular|gotham|avenir|proxima|brandon|sofia|outfit|urbanist|manrope|nunito|quicksand|lexend|jost|dm sans/i;
const GROTESK = /space grotesk|grotesk|founders|neue haas|monument|druk|archivo|work sans|public sans|ibm plex|suisse/i;

function mapFont(detected: string, role: "heading" | "body"): KitFont {
  const exact = (KIT_FONTS as readonly string[]).find((f) => f.toLowerCase() === detected.toLowerCase());
  if (exact) return exact as KitFont;
  if (SERIF.test(detected)) return role === "heading" ? "Playfair Display" : "Lora";
  if (GROTESK.test(detected)) return "Space Grotesk";
  if (/poppins|nunito|quicksand|jost/i.test(detected)) return "Poppins";
  if (GEOMETRIC.test(detected)) return "Montserrat";
  if (/inter|helvetica|arial|roboto|söhne|sohne|sf pro|segoe|open sans|lato|source sans|graphik|aktiv/i.test(detected)) return "Inter";
  return "DM Sans";
}

function pickFonts(counted: Map<string, number>, google: string[]): SiteImport["fonts"] {
  for (const g of google) counted.set(g, (counted.get(g) ?? 0) + 4);
  const detected = [...counted.entries()]
    .filter(([name]) => !/icon|awesome|material|glyph|symbol|emoji/i.test(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 6);
  if (!detected.length) return { heading: DEFAULT_KIT.fonts.heading as KitFont, body: DEFAULT_KIT.fonts.body as KitFont, detected };
  // The most-used family is the body face; a serif or display face among the rest is the heading.
  const body = mapFont(detected[0]!, "body");
  const display = detected.slice(1).find((f) => SERIF.test(f) || GROTESK.test(f) || GEOMETRIC.test(f)) ?? detected[0]!;
  return { heading: mapFont(display, "heading"), body: body === "Playfair Display" ? "Lora" : body, detected };
}

function guessTone(text: string, fonts: SiteImport["fonts"]): KitTone[] {
  const t = text.toLowerCase();
  const scores = new Map<KitTone, number>();
  const bump = (k: KitTone, n = 1) => scores.set(k, (scores.get(k) ?? 0) + n);
  if (/luxury|premium|exquisite|crafted|artisan|atelier|couture|heritage|fine\b|bespoke/.test(t)) bump("luxurious", 2);
  if (/simple|clean|minimal|essential|less\b|quiet|pure/.test(t)) bump("minimal", 2);
  if (/fun|play|joy|happy|wild|party|silly|😀|🎉|!/.test(t)) bump("playful", 2);
  if (/bold|fearless|power|unstoppable|strong|max|ultimate|never/.test(t)) bump("bold", 2);
  if (/calm|gentle|slow|soft|rest|breathe|balance|soothe|sleep/.test(t)) bump("calm", 2);
  if (/energy|fast|move|go\b|run|push|charge|active|fuel/.test(t)) bump("energetic", 2);
  if (/honest|real|transparent|no [a-z]+ (added|nonsense)|straight|truth|proof|science/.test(t)) bump("honest", 2);
  if (/love|care|home|family|friend|together|warm|welcome|you\b/.test(t)) bump("warm", 1);
  if (fonts.heading === "Playfair Display" || fonts.heading === "Lora" || fonts.heading === "Instrument Serif") bump("luxurious"), bump("calm");
  if (fonts.heading === "Space Grotesk") bump("bold");
  if ((text.match(/[A-Z]{4,}/g)?.length ?? 0) > 3) bump("bold");
  const picked = [...scores.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).map(([k]) => k).slice(0, 3);
  return picked.length ? picked : [...DEFAULT_KIT.voice!.tone] as KitTone[];
}

// ── Storage ────────────────────────────────────────────────────────────────────

async function storeLogo(orgId: string, cands: LogoCandidate[]): Promise<string | null> {
  const storage = getStorage();
  for (const c of cands) {
    try {
      if (c.svg) {
        const key = objectKey(orgId, "logos", "svg");
        await storage.put(key, Buffer.from(c.svg.replace(/^\s*<svg/, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'xmlns="http://www.w3.org/2000/svg"')), { contentType: "image/svg+xml" });
        return `/api/files/${key}`;
      }
      if (!c.url) continue;
      const { res, buffer: buf } = await safeFetch(c.url, { headers: { "user-agent": UA, accept: "image/*,*/*" }, timeoutMs: 10_000, maxBytes: 8 * 1024 * 1024 });
      if (!res.ok) continue;
      const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!buf.byteLength) continue;
      if (type === "image/svg+xml" || /\.svg(\?|$)/i.test(c.url)) {
        if (!/<svg/i.test(buf.subarray(0, 2000).toString())) continue;
        const key = objectKey(orgId, "logos", "svg");
        await storage.put(key, buf, { contentType: "image/svg+xml" });
        return `/api/files/${key}`;
      }
      const img = sharp(buf, { failOn: "none" });
      const info = await img.metadata();
      if (!info.width || !info.height || info.width < 32 || info.height < 16) continue;
      const png = await img.resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const key = objectKey(orgId, "logos", "png");
      await storage.put(key, png, { contentType: "image/png" });
      return `/api/files/${key}`;
    } catch (err) {
      console.warn("[brand-import] logo candidate failed", c.why, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

// ── Entry points ───────────────────────────────────────────────────────────────

/** Read a website and work out its kit. Stores the logo and screenshot; does not touch the database. */
export async function readWebsite(orgId: string, input: string): Promise<SiteImport> {
  const u = normaliseSiteUrl(input);
  const { res, url: finalUrl, buffer } = await safeFetch(u, { headers: { "user-agent": UA, accept: "text/html,*/*" }, maxBytes: 8 * 1024 * 1024 });
  if (!res.ok) throw new Error(`${u.hostname} answered ${res.status}.`);
  const html = buffer.toString("utf8").slice(0, HTML_LIMIT);

  const colors = new Map<string, { rgb: RGB; score: number; css: number; pixels: number }>();
  const fontCounts = new Map<string, number>();
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) scanCss(m[1]!.slice(0, CSS_LIMIT), colors, fontCounts);
  for (const m of html.matchAll(/style=["']([^"']{6,400})["']/gi)) scanCss(`x{${m[1]}}`, colors, fontCounts);
  const themeColor = meta(html, ["theme-color", "msapplication-TileColor"]);
  if (themeColor) scanCss(`--theme-brand:${themeColor};`, colors, fontCounts);

  const [sheets, shot, logoUrl] = await Promise.all([
    Promise.all(
      stylesheetUrls(html, finalUrl).map(async (href) => {
        try {
          const { res: r, buffer: b } = await safeFetch(href, { headers: { "user-agent": UA, accept: "text/css,*/*" }, timeoutMs: 8_000, maxBytes: 4 * 1024 * 1024 });
          return r.ok ? b.toString("utf8").slice(0, CSS_LIMIT) : "";
        } catch {
          return "";
        }
      }),
    ),
    screenshot(finalUrl.toString()),
    storeLogo(orgId, logoCandidates(html, finalUrl)),
  ]);
  for (const css of sheets) if (css) scanCss(css, colors, fontCounts);

  let screenshotUrl: string | null = null;
  if (shot) {
    try {
      await pixelColors(shot, colors);
      const jpg = await sharp(shot).resize({ width: 1280 }).jpeg({ quality: 82 }).toBuffer();
      const key = objectKey(orgId, "sites", "jpg");
      await getStorage().put(key, jpg, { contentType: "image/jpeg" });
      screenshotUrl = `/api/files/${key}`;
    } catch (err) {
      console.warn("[brand-import] screenshot processing failed", err instanceof Error ? err.message : err);
    }
  }

  const swatches = bucket(colors);
  const { colors: assigned, palette } = assignColors(swatches, themeColor);
  const fonts = pickFonts(fontCounts, googleFontFamilies(html));
  const head = headline(html);
  const description = meta(html, ["description", "og:description", "twitter:description"]);
  const titleName = decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").replace(/\s+[|\-–—·:]\s+.*$/, "").slice(0, 80);
  const siteName = meta(html, ["og:site_name", "application-name"]) ?? (titleName || null);
  const tone = guessTone([head, description, ...headings(html)].filter(Boolean).join(" "), fonts);

  return { url: finalUrl.toString(), siteName, headline: head, description, logoUrl, screenshotUrl, colors: assigned, palette, fonts, tone };
}

/** Run the import and write it as a new active kit version for the brand. Returns what was found. */
export async function importBrandKitFromWebsite(orgId: string, brandId: string, input: string): Promise<SiteImport> {
  await dbReady;
  const found = await readWebsite(orgId, input);
  const [active] = await db.select({ data: brandKits.data }).from(brandKits).where(and(eq(brandKits.brandId, brandId), eq(brandKits.isActive, true))).limit(1);
  const current = withDefaults(active?.data);
  const data: BrandKitData = {
    ...current,
    colors: found.colors,
    fonts: { heading: found.fonts.heading, body: found.fonts.body },
    logoUrl: found.logoUrl ?? current.logoUrl,
    voice: { ...current.voice!, tone: found.tone },
    tagline: current.tagline || found.headline?.slice(0, 90) || "",
    site: { url: found.url, importedAt: new Date().toISOString(), screenshotUrl: found.screenshotUrl ?? undefined, palette: found.palette, fonts: found.fonts.detected, headline: found.headline ?? undefined },
  };
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${brandKits.version}), 0)::int` })
    .from(brandKits)
    .where(and(eq(brandKits.orgId, orgId), eq(brandKits.brandId, brandId)));
  await db.update(brandKits).set({ isActive: false }).where(and(eq(brandKits.brandId, brandId), eq(brandKits.isActive, true)));
  await db.insert(brandKits).values({ orgId, brandId, version: (max ?? 0) + 1, isActive: true, data });
  await db.update(brands).set({ website: found.url }).where(eq(brands.id, brandId));
  return found;
}
