import "server-only";

/**
 * Store the error, collapsing repeats of the same route + message into one row with a count.
 * Never throws: reporting must not turn one failure into two.
 */
export async function recordError(error: Error, request: { path: string; method: string }, context: { routePath: string }, digest?: string) {
  try {
    const { db, dbReady, errorEvents } = await import("@adcraft/db");
    const { and, eq, sql } = await import("drizzle-orm");
    await dbReady;
    const message = error.message.slice(0, 1000);
    const route = context.routePath || request.path;
    const updated = await db
      .update(errorEvents)
      .set({ count: sql`${errorEvents.count} + 1`, lastSeenAt: new Date(), digest: digest ?? null })
      .where(and(eq(errorEvents.route, route), eq(errorEvents.message, message), sql`${errorEvents.lastSeenAt} > now() - interval '24 hours'`))
      .returning({ id: errorEvents.id });
    if (updated.length) return;
    await db.insert(errorEvents).values({
      route,
      method: request.method,
      path: request.path.slice(0, 500),
      name: error.name.slice(0, 120),
      message,
      digest: digest ?? null,
      stack: (error.stack ?? "").slice(0, 4000),
      release: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    });
    // Keep the table small; 14 days is plenty to notice a pattern.
    await db.delete(errorEvents).where(sql`${errorEvents.lastSeenAt} < now() - interval '14 days'`);
  } catch (err) {
    console.warn("[error-log] could not record", err instanceof Error ? err.message : err);
  }
}
