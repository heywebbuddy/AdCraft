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
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return Response.json({ error: { code: "invalid_limit", message: "limit must be an integer between 1 and 200" } }, { status: 400 });
  }
  const result = await apiListCreatives(principal.orgId, {
    brandId: url.searchParams.get("brandId"),
    limit,
    cursor: url.searchParams.get("cursor"),
  });
  return Response.json({ data: result.data, next_cursor: result.nextCursor });
}
