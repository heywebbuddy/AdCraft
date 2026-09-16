import { authenticateApiKey, unauthorized } from "@/server/api-auth";
import { apiListCreatives } from "@/server/api-v1";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/creatives?brandId=&limit=&cursor=
 * Bearer API key → the organisation's creatives with a render URL per size.
 */
export async function GET(req: Request) {
  const principal = await authenticateApiKey(req);
  if (!principal) return unauthorized();
  const url = new URL(req.url);
  const result = await apiListCreatives(principal.orgId, {
    brandId: url.searchParams.get("brandId"),
    limit: Number(url.searchParams.get("limit") ?? 50) || 50,
    cursor: url.searchParams.get("cursor"),
  });
  return Response.json({ data: result.data, next_cursor: result.nextCursor });
}
