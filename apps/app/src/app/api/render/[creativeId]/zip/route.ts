import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getStorage } from "@adcraft/storage";
import { requireOrg } from "@/server/org";
import { getCreative } from "@/server/creatives";

/** Every succeeded render of a creative, zipped, named `<creative>-<ratio>-<w>x<h>.png`. */
export async function GET(_req: Request, ctx: { params: Promise<{ creativeId: string }> }) {
  const { creativeId } = await ctx.params;
  const org = await requireOrg();
  const c = await getCreative(org.org.id, creativeId);
  if (!c) return new NextResponse("Not found", { status: 404 });

  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "creative";
  const storage = getStorage();
  const zip = new JSZip();
  let n = 0;
  for (const v of c.variants) {
    if (v.render?.status !== "succeeded" || !v.render.outputKey) continue;
    const obj = await storage.get(v.render.outputKey);
    if (!obj) continue;
    zip.file(`${slug}-${v.ratio.replace(":", "x")}-${v.width}x${v.height}.png`, obj.body);
    n++;
  }
  if (n === 0) return new NextResponse("No finished renders yet", { status: 409 });

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  return new NextResponse(new Blob([bytes as BlobPart]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slug}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
