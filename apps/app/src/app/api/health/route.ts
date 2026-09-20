import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, dbReady } from "@adcraft/db";
import { getStorage } from "@adcraft/storage";
import { currentAdmin } from "@/server/admin";

/**
 * Liveness + dependencies, for the load balancer and uptime checks. Never leaks config;
 * returns 200 when the database and storage answer, 503 otherwise.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};
  const time = async (name: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      await fn();
      checks[name] = { ok: true, ms: Date.now() - t };
    } catch (err) {
      checks[name] = { ok: false, ms: Date.now() - t, error: err instanceof Error ? err.message.slice(0, 120) : "failed" };
    }
  };
  await Promise.all([
    time("database", async () => {
      await dbReady;
      await db.execute(sql`select 1`);
    }),
    time("storage", async () => {
      const key = `platform/health/${process.pid}.txt`;
      await getStorage().put(key, Buffer.from(String(Date.now())), { contentType: "text/plain" });
      await getStorage().delete(key).catch(() => undefined);
    }),
    time("jobs", async () => {
      if (!process.env.INNGEST_EVENT_KEY && !process.env.INNGEST_DEV) throw new Error("jobs run inline (no Inngest configured)");
    }),
  ]);
  const ok = checks.database?.ok && checks.storage?.ok;
  // Error text can name internal hosts; only platform admins see the detail.
  const detailed = Boolean(await currentAdmin());
  const safe = Object.fromEntries(Object.entries(checks).map(([name, c]) => [name, detailed ? c : { ok: c.ok, ms: c.ms }]));
  return NextResponse.json(
    { ok, version: process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", checks: safe, at: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
