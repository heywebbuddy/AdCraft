import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, dbReady, memberships } from "@adcraft/db";
import { getStorage } from "@adcraft/storage";
import { auth } from "@/auth";
import { currentAdmin } from "@/server/admin";
import { fileHeaders } from "@/server/file-headers";

/**
 * Serves stored objects (renders, product photos, logos) to a signed-in member of the owning
 * workspace. Keys are `org/<orgId>/<kind>/<uuid>` — being signed in is not enough, the viewer
 * must belong to that organisation, or be a platform admin.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.join("/");
  if (k.includes("..")) return new NextResponse("Bad key", { status: 400 });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const orgId = k.match(/^org\/([0-9a-f-]{36})\//i)?.[1];
  if (!orgId) return new NextResponse("Not found", { status: 404 });
  await dbReady;
  const rows = await db.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, userId));
  if (!rows.some((r) => r.orgId === orgId)) {
    // Platform admins support every workspace; everyone else gets a flat 404.
    if (!(await currentAdmin())) return new NextResponse("Not found", { status: 404 });
  }

  const obj = await getStorage().get(k);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), { headers: fileHeaders(k, obj.contentType, "private, max-age=3600") });
}
