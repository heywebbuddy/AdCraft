/**
 * Server error reporting without an SDK: Next calls `onRequestError` for every unhandled
 * error in a request. When SENTRY_DSN is set we post a minimal Sentry event (envelope API);
 * otherwise it goes to the log with the route and a digest, which is enough to grep for.
 */
type Ctx = { routerKind: string; routePath: string; routeType: string; renderSource?: string };

export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: Ctx) {
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = (err as { digest?: string } | null)?.digest;
  const line = `[error] ${request.method} ${request.path} (${context.routePath}) ${error.name}: ${error.message}${digest ? ` digest=${digest}` : ""}`;
  console.error(line);
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    const key = u.username;
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`;
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      request: { url: request.path, method: request.method },
      tags: { route: context.routePath, kind: context.routerKind, type: context.routeType },
      exception: { values: [{ type: error.name, value: error.message, stacktrace: { frames: (error.stack ?? "").split("\n").slice(1, 30).map((l) => ({ function: l.trim() })) } }] },
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-sentry-envelope" }, body, signal: AbortSignal.timeout(3000) });
  } catch {
    /* reporting must never fail the request */
  }
}

export async function register() {
  /* no-op: hooks are the exports above */
}
