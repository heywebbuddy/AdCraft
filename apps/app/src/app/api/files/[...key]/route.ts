import { NextResponse } from "next/server";
import { getStorage } from "@adcraft/storage";
import { auth } from "@/auth";

/**
 * Serves stored objects. Keys are org-scoped, so a signed-in user may only read
 * objects for organisations they belong to; renders are otherwise private.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.join("/");
  if (k.includes("..")) return new NextResponse("Bad key", { status: 400 });
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const obj = await getStorage().get(k);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: { "content-type": obj.contentType, "cache-control": "private, max-age=3600" },
  });
}
