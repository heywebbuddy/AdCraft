import { NextResponse } from "next/server";
import { fileHeaders } from "@/server/file-headers";
import { getStorage } from "@adcraft/storage";
import { authenticateApiKey, unauthorized } from "@/server/api-auth";

/** GET /api/v1/files/:key — download a render with a bearer API key. Keys are org-prefixed. */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const principal = await authenticateApiKey(req);
  if (!principal) return unauthorized();
  const { key } = await ctx.params;
  const k = key.join("/");
  if (k.includes("..")) return new NextResponse("Bad key", { status: 400 });
  // Storage keys are `org/<orgId>/<kind>/<file>` (see @adcraft/storage objectKey); only serve this org's objects.
  if (!k.startsWith(`org/${principal.orgId}/`)) return new NextResponse("Not found", { status: 404 });
  const obj = await getStorage().get(k);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: fileHeaders(k, obj.contentType, "private, max-age=3600"),
  });
}
