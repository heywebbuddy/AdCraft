import { authenticateApiKey, unauthorized } from "@/server/api-auth";
import { apiGetCreative } from "@/server/api-v1";

export const dynamic = "force-dynamic";

/** GET /api/v1/creatives/:id */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiKey(req);
  if (!principal) return unauthorized();
  const { id } = await ctx.params;
  const creative = await apiGetCreative(principal.orgId, id);
  if (!creative) return Response.json({ error: { code: "not_found", message: "No creative with that id in this organisation." } }, { status: 404 });
  return Response.json({ data: creative });
}
