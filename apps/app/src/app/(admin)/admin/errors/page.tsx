import { desc, sql } from "drizzle-orm";
import { db, dbReady, errorEvents } from "@adcraft/db";
import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { Empty, Kpi, Kpis, Panel, Table, ago, int } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Unhandled server errors, newest first. Written by instrumentation.ts on every request that
 * throws, so a customer hitting a bug leaves something readable here even when no external
 * error tracker is configured. Repeats collapse into one row with a count; 14-day retention.
 */
export default async function AdminErrorsPage() {
  await requireAdmin();
  await dbReady;
  const rows = await db.select().from(errorEvents).orderBy(desc(errorEvents.lastSeenAt)).limit(200);
  const [{ total, routes, day }] = await db
    .select({
      total: sql<number>`coalesce(sum(${errorEvents.count}), 0)::int`,
      routes: sql<number>`count(distinct ${errorEvents.route})::int`,
      day: sql<number>`coalesce(sum(case when ${errorEvents.lastSeenAt} > now() - interval '24 hours' then ${errorEvents.count} else 0 end), 0)::int`,
    })
    .from(errorEvents);

  return (
    <>
      <PageHeader
        title="Errors"
        description="Unhandled server errors, newest first. Repeats of the same route and message collapse into one row. Kept for 14 days; set SENTRY_DSN to mirror them to Sentry as well."
      />

      <Kpis label="Errors at a glance">
        <Kpi label="Last 24 hours" value={int(day)} />
        <Kpi label="Total recorded" value={int(total)} />
        <Kpi label="Routes affected" value={int(routes)} />
      </Kpis>

      <Panel title="Recent" eyebrow="Newest first" note={`${rows.length} shown`}>
        {rows.length ? (
          <Table minWidth={900}>
            <thead>
              <tr>
                <th>When</th>
                <th>Route</th>
                <th>Error</th>
                <th>Seen</th>
                <th>Release</th>
              </tr>
            </thead>
            <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="tabular whitespace-nowrap">{ago(r.lastSeenAt)}</td>
                <td>
                  <span className="block font-semibold">{r.route}</span>
                  <span className="text-[11px] text-muted">
                    {r.method} {r.path}
                  </span>
                </td>
                <td>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block max-w-[60ch] break-words text-[11px] text-muted">{r.message}</span>
                  {r.digest ? <span className="text-[11px] text-muted">digest {r.digest}</span> : null}
                </td>
                <td className="tabular">{int(r.count)}×</td>
                <td className="tabular text-[11px] text-muted">{r.release ?? "—"}</td>
              </tr>
            ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="No errors recorded">Nothing has thrown in the last 14 days.</Empty>
        )}
      </Panel>
    </>
  );
}
