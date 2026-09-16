import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db, dbReady, adAccounts } from "@adcraft/db";
import { getAdsProvider, isPlatform } from "@adcraft/ads";
import { requireOrg } from "@/server/org";
import { encryptTokens } from "@/server/crypto";
import { CONNECT_COOKIE, appOrigin, type ConnectState } from "../../shared";

/**
 * GET /api/connect/[platform]/callback — exchange the code, list the user's ad accounts and
 * upsert them with encrypted tokens, then land on /campaigns?connected=<platform>.
 */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const origin = appOrigin(req);
  const back = (q: string) => NextResponse.redirect(new URL(`/campaigns?${q}`, origin));
  if (!isPlatform(platform)) return new NextResponse("Unknown platform", { status: 404 });

  const url = new URL(req.url);
  const jar = await cookies();
  const cookie = jar.get(CONNECT_COOKIE)?.value;
  jar.delete(CONNECT_COOKIE);
  let saved: ConnectState | null = null;
  try {
    saved = cookie ? (JSON.parse(cookie) as ConnectState) : null;
  } catch {
    saved = null;
  }
  const state = url.searchParams.get("state");
  if (!saved || !state || saved.state !== state || saved.platform !== platform) return back("error=" + encodeURIComponent("The connect link expired or was tampered with. Try again."));

  const denied = url.searchParams.get("error") ?? url.searchParams.get("error_description");
  if (denied) return back("error=" + encodeURIComponent(`Connection was not granted (${denied}).`));
  // Meta and Google return `code`; TikTok returns `auth_code`.
  const code = url.searchParams.get("code") ?? url.searchParams.get("auth_code");
  if (!code) return back("error=" + encodeURIComponent("No authorisation code was returned."));

  const ctx = await requireOrg();
  if (ctx.org.id !== saved.orgId) return back("error=" + encodeURIComponent("Organisation changed during connect. Try again."));

  try {
    await dbReady;
    const provider = getAdsProvider(platform);
    const tokens = await provider.oauth.exchangeCode(code, saved.redirectUri);
    const accounts = await provider.listAdAccounts(tokens);
    if (accounts.length === 0) return back("error=" + encodeURIComponent(`${provider.label} returned no ad accounts for this login.`));
    const enc = encryptTokens(tokens);
    for (const a of accounts) {
      await db
        .insert(adAccounts)
        .values({
          orgId: ctx.org.id,
          brandId: saved.brandId,
          platform,
          externalId: a.externalId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: "connected",
          ...enc,
        })
        .onConflictDoUpdate({
          target: [adAccounts.orgId, adAccounts.platform, adAccounts.externalId],
          set: {
            name: a.name,
            currency: a.currency,
            timezone: a.timezone,
            status: "connected",
            accessTokenEnc: enc.accessTokenEnc,
            refreshTokenEnc: enc.refreshTokenEnc,
            tokenExpiresAt: enc.tokenExpiresAt,
            brandId: sql`coalesce(${adAccounts.brandId}, ${saved.brandId})`,
            updatedAt: new Date(),
          },
        });
    }
    return back(`connected=${platform}&accounts=${accounts.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[connect] ${platform} callback failed`, err);
    return back("error=" + encodeURIComponent(message.slice(0, 300)));
  }
}
