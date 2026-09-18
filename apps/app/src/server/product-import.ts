import "server-only";
import { db, dbReady, products } from "@adcraft/db";
import { getStorage, objectKey } from "@adcraft/storage";
import { dispatch } from "./jobs";
import type { ProductAttributes } from "./library-data";
import "@/pipelines";

/**
 * Import a product from a public product page: name, description, price and the main image
 * from Open Graph / JSON-LD / meta tags. Used by onboarding ("paste a link, get an ad") and
 * the library's "Import from a URL".
 */
export type ImportedProduct = { name: string; description: string | null; price: string | null; imageUrl: string | null; url: string };

const UA = "Mozilla/5.0 (compatible; AdcraftBot/1.0; +https://adcraft.app)";

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[:.]/g, "\\$&")}["'][^>]*content=["']([^"']+)["']`, "i");
    const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key.replace(/[:.]/g, "\\$&")}["']`, "i");
    const m = html.match(re) ?? html.match(alt);
    if (m?.[1]) return decode(m[1]);
  }
  return null;
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
}

function jsonLdProduct(html: string): { name?: string; description?: string; image?: string; price?: string } | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]!.trim());
      const list = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const node of list) {
        if (!node || typeof node !== "object") continue;
        const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (!type.includes("Product") && !type.includes("ProductGroup")) continue;
        const image = Array.isArray(node.image) ? node.image[0] : typeof node.image === "object" ? node.image?.url : node.image;
        const variant = Array.isArray(node.hasVariant) ? node.hasVariant[0] : null;
        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers ?? (Array.isArray(variant?.offers) ? variant.offers[0] : variant?.offers);
        const price = offers?.price ?? offers?.lowPrice;
        return { name: node.name, description: node.description, image: typeof image === "string" ? image : undefined, price: price !== undefined ? `${offers?.priceCurrency ?? ""} ${price}`.trim() : undefined };
      }
    } catch {
      /* not JSON */
    }
  }
  return null;
}

/** Shopify stores answer `/products/<handle>.js` with clean product JSON — the majority of DTC brands. */
async function shopifyProduct(u: URL): Promise<ImportedProduct | null> {
  const m = u.pathname.match(/\/products\/([a-z0-9-]+)\/?$/i);
  if (!m) return null;
  try {
    const res = await fetch(new URL(`/products/${m[1]}.js`, u), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    // Shopify serves this as text/javascript; it is plain JSON.
    const d = JSON.parse(await res.text()) as { title?: string; description?: string; featured_image?: string; images?: string[]; price?: number; vendor?: string };
    if (!d.title) return null;
    const image = d.featured_image ?? d.images?.[0] ?? null;
    return {
      name: decode(d.title).slice(0, 120),
      description: d.description ? decode(d.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).slice(0, 600) : null,
      price: typeof d.price === "number" ? (d.price / 100).toFixed(2) : null,
      imageUrl: image ? new URL(image, u).toString() : null,
      url: u.toString(),
    };
  } catch {
    return null;
  }
}

export async function fetchProductPage(url: string): Promise<ImportedProduct> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links work.");
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\])/.test(u.hostname)) throw new Error("That address is not public.");
  const shopify = await shopifyProduct(u);
  if (shopify) return shopify;
  const res = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`The page answered ${res.status}.`);
  const html = (await res.text()).slice(0, 1_500_000);
  const ld = jsonLdProduct(html);
  const title = ld?.name ?? meta(html, ["og:title", "twitter:title"]) ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? u.hostname;
  const description = ld?.description ?? meta(html, ["og:description", "description", "twitter:description"]);
  const image = ld?.image ?? meta(html, ["og:image", "og:image:url", "twitter:image"]);
  const price = ld?.price ?? meta(html, ["product:price:amount", "og:price:amount"]);
  return {
    name: decode(title).replace(/\s+[|\-–—·]\s+.*$/, "").slice(0, 120),
    description: description ? decode(description).slice(0, 600) : null,
    price: price ? String(price).slice(0, 40) : null,
    imageUrl: image ? new URL(image, u).toString() : null,
    url: u.toString(),
  };
}

/** Download the page's main image into product storage; returns null if it isn't an image we can use. */
async function storeRemoteImage(orgId: string, imageUrl: string): Promise<{ key: string; attributes: Record<string, unknown> } | null> {
  const res = await fetch(imageUrl.replace(/^http:\/\//, "https://"), { headers: { "user-agent": UA, accept: "image/*,*/*" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    console.warn("[import] image fetch", res.status, imageUrl);
    return null;
  }
  const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.byteLength || buf.byteLength > 25 * 1024 * 1024) return null;
  const sharp = (await import("sharp")).default;
  try {
    const img = sharp(buf).rotate();
    const info = await img.metadata();
    if (!info.width || !info.height || info.width < 200 || info.height < 200) return null;
    const png = await img.resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const key = objectKey(orgId, "products", "png");
    await getStorage().put(key, png, { contentType: "image/png" });
    return { key, attributes: { width: Math.min(info.width, 2048), height: Math.min(info.height, 2048), bytes: png.byteLength, originalName: imageUrl.split("/").pop() ?? "image", sourceType: type } };
  } catch (err) {
    console.warn("[import] image decode failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Create a product from a URL: metadata + image + background removal. */
export async function importProductFromUrl(orgId: string, brandId: string, url: string): Promise<{ productId: string; imported: ImportedProduct; hasImage: boolean }> {
  await dbReady;
  const imported = await fetchProductPage(url);
  const stored = imported.imageUrl ? await storeRemoteImage(orgId, imported.imageUrl) : null;
  const [product] = await db
    .insert(products)
    .values({
      orgId,
      brandId,
      name: imported.name,
      description: imported.description,
      price: imported.price,
      url: imported.url,
      imageKey: stored?.key ?? null,
      attributes: { ...(stored?.attributes ?? {}), ...(stored ? { cutout: { status: "processing", updatedAt: new Date().toISOString() } } : {}) } as ProductAttributes,
    })
    .returning();
  if (stored) await dispatch("product.cutout", { orgId, productId: product!.id });
  return { productId: product!.id, imported, hasImage: Boolean(stored) };
}
