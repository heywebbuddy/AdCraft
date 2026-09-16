import { NextResponse } from "next/server";
import { getStorage } from "@adcraft/storage";
import { shareLinkCoversKey, validShareLink } from "@/server/share";

/**
 * Serves render outputs to holders of a valid share link, without a session.
 * Only keys that belong to a creative the link exposes are served.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string; key: string[] }> }) {
  const { token, key } = await ctx.params;
  const k = key.join("/");
  if (k.includes("..")) return new NextResponse("Bad key", { status: 400 });
  const v = await validShareLink(token);
  if (!v.ok) return new NextResponse("Link is no longer valid", { status: 404 });
  if (!(await shareLinkCoversKey(v.link, k))) return new NextResponse("Not found", { status: 404 });
  const obj = await getStorage().get(k);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: { "content-type": obj.contentType, "cache-control": "private, max-age=600" },
  });
}
