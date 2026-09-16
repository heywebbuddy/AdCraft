import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getAdsProvider, isPlatform } from "@adcraft/ads";
import { requireOrg } from "@/server/org";
import { CONNECT_COOKIE, appOrigin, type ConnectState } from "../shared";

/**
 * GET /api/connect/[platform] — start the OAuth connect flow. The state cookie carries the
 * org + brand so the callback attaches the accounts to the right workspace. Sandbox
 * providers point straight back at the callback, so the connect is instant.
 */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isPlatform(platform)) return new NextResponse("Unknown platform", { status: 404 });
  const ctx = await requireOrg();
  if (ctx.role === "viewer") return NextResponse.redirect(new URL("/campaigns?error=forbidden", appOrigin(req)));

  const state = randomBytes(18).toString("base64url");
  const redirectUri = `${appOrigin(req)}/api/connect/${platform}/callback`;
  const payload: ConnectState = { state, orgId: ctx.org.id, brandId: ctx.brand?.id ?? null, platform, redirectUri };
  const jar = await cookies();
  jar.set(CONNECT_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/connect",
    maxAge: 10 * 60,
  });

  let url: string;
  try {
    url = getAdsProvider(platform).oauth.authorizeUrl(state, redirectUri);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start connect";
    return NextResponse.redirect(new URL(`/campaigns?error=${encodeURIComponent(message)}`, appOrigin(req)));
  }
  return NextResponse.redirect(url);
}
