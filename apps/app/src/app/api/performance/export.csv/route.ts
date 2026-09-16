import { NextResponse } from "next/server";
import { requireOrg } from "@/server/org";
import { performanceCsv } from "@/server/ads";

/** GET /api/performance/export.csv?days=7|14|30 — one row per ad per day for the current brand. */
export async function GET(req: Request) {
  const ctx = await requireOrg();
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  const body = await performanceCsv(ctx.org.id, ctx.brand?.id ?? null, days);
  const slug = (ctx.brand?.name ?? ctx.org.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "adcraft";
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-performance-${days}d.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
