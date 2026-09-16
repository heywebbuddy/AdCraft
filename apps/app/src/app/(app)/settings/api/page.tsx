import { desc, eq } from "drizzle-orm";
import { db, dbReady, apiKeys, webhooks } from "@adcraft/db";
import { requireOrg } from "@/server/org";
import { addWebhook, createApiKey, deleteWebhook, revokeApiKey } from "@/server/api-keys";
import { WEBHOOK_EVENTS } from "@/server/webhooks";
import { baseUrl } from "@/server/url";
import { SettingsNav } from "@/components/settings-nav";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

const inputClass = "h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[15px] outline-none focus:border-ink";

export default async function ApiPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; created?: string; key?: string; webhook?: string; secret?: string }>;
}) {
  const ctx = await requireOrg();
  const { ok, error, created, webhook: newHook } = await searchParams;
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const reveal = (() => {
    try {
      const raw = jar.get("adcraft_reveal")?.value;
      return raw ? (JSON.parse(raw) as { kind: "key" | "webhook"; id: string; value: string }) : null;
    } catch {
      return null;
    }
  })();
  const plainKey = reveal?.kind === "key" && reveal.id === created ? reveal.value : undefined;
  const secret = reveal?.kind === "webhook" && reveal.id === newHook ? reveal.value : undefined;
  await dbReady;
  const [keys, hooks, origin] = await Promise.all([
    db.select().from(apiKeys).where(eq(apiKeys.orgId, ctx.org.id)).orderBy(desc(apiKeys.createdAt)),
    db.select().from(webhooks).where(eq(webhooks.orgId, ctx.org.id)).orderBy(desc(webhooks.createdAt)),
    baseUrl(),
  ]);
  const isOwner = ctx.role === "owner";
  const live = keys.filter((k) => !k.revokedAt);

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <div className="eyebrow">API and webhooks</div>
        <h1 className="m-0 text-[28px] font-medium leading-[1.05] tracking-[-1.4px] sm:text-[36px] sm:tracking-[-1.8px]">
          Export creative anywhere. <span className="font-serif italic text-muted">Keys, endpoints and signed webhooks.</span>
        </h1>
      </header>

      <SettingsNav active="api" role={ctx.role} />

      {error === "owner" ? <p className="m-0 text-[13px] text-orange">Only workspace owners can manage API keys and webhooks.</p> : null}
      {error === "url" ? <p className="m-0 text-[13px] text-orange">Webhook URLs must start with http:// or https://.</p> : null}
      {ok === "revoked" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Key revoked. Requests with it now get 401.</p> : null}
      {ok === "webhook_deleted" ? <p className="panel m-0 px-4 py-3 text-[13px] text-[#3f7a55]">Webhook removed.</p> : null}

      {created && plainKey ? (
        <section className="panel flex flex-col gap-3 border-ink p-5">
          <span className="eyebrow">Your new API key</span>
          <p className="m-0 text-[13px] text-muted">Copy it now. It is shown once and only a hash is stored.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[7px] border border-line bg-paper px-3 py-2 text-[12px]">{plainKey}</code>
            <CopyButton text={plainKey} label="Copy key" />
          </div>
        </section>
      ) : null}
      {newHook && secret ? (
        <section className="panel flex flex-col gap-3 border-ink p-5">
          <span className="eyebrow">Webhook signing secret</span>
          <p className="m-0 text-[13px] text-muted">
            Verify deliveries with <code className="rounded bg-paper px-1">HMAC-SHA256(secret, `{"{timestamp}.{body}"}`)</code> against the <code className="rounded bg-paper px-1">x-adcraft-signature</code> header. Shown once.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[7px] border border-line bg-paper px-3 py-2 text-[12px]">{secret}</code>
            <CopyButton text={secret} label="Copy secret" />
          </div>
        </section>
      ) : null}

      <div className="grid max-w-[1100px] items-start gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">API keys</span>
            <span className="text-[11px] text-muted">{live.length} active</span>
          </div>
          {keys.length ? (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className={`truncate font-semibold ${k.revokedAt ? "line-through text-muted" : ""}`}>{k.name}</span>
                    <span className="text-[12px] text-muted">
                      <code>{k.prefix}…</code> · {k.lastUsedAt ? `used ${k.lastUsedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "never used"}
                      {k.revokedAt ? " · revoked" : ""}
                    </span>
                  </span>
                  {isOwner && !k.revokedAt ? (
                    <form action={revokeApiKey}>
                      <input type="hidden" name="keyId" value={k.id} />
                      <button className="text-[12px] text-muted hover:text-[#b4382a]">Revoke</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted">No keys yet.</p>
          )}
          {isOwner ? (
            <form action={createApiKey} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <label className="flex min-w-[200px] flex-1 flex-col gap-2 text-sm font-medium">
                Key name
                <input name="name" placeholder="Zapier, DAM sync…" className={inputClass} />
              </label>
              <button className="btn btn-dark h-11">Create key</button>
            </form>
          ) : null}

          <div className="flex flex-col gap-2 rounded-[7px] bg-paper p-3.5 text-[12px]">
            <span className="eyebrow">Endpoints</span>
            <code className="block">GET {origin}/api/v1/creatives?brandId=&amp;limit=50&amp;cursor=</code>
            <code className="block">GET {origin}/api/v1/creatives/:id</code>
            <code className="block">GET {origin}/api/v1/files/:key</code>
            <span className="text-muted">
              Send <code>Authorization: Bearer ak_live_…</code>. Each creative lists a render per size with a download URL that accepts the same key.
            </span>
          </div>
        </section>

        <section className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Webhooks</span>
            <span className="text-[11px] text-muted">{hooks.length} endpoint{hooks.length === 1 ? "" : "s"}</span>
          </div>
          {hooks.length ? (
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {hooks.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-semibold">{h.url}</span>
                    <span className="truncate text-[12px] text-muted">
                      {h.events.length ? h.events.join(", ") : "all events"}
                      {h.lastDeliveredAt ? ` · last ${h.lastStatus} at ${h.lastDeliveredAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : " · no deliveries yet"}
                    </span>
                  </span>
                  {isOwner ? (
                    <form action={deleteWebhook}>
                      <input type="hidden" name="webhookId" value={h.id} />
                      <button className="text-[12px] text-muted hover:text-[#b4382a]">Remove</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[13px] text-muted">No webhooks yet. Get a POST when creative is rendered or approved.</p>
          )}
          {isOwner ? (
            <form action={addWebhook} className="flex flex-col gap-3 border-t border-line pt-4">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Endpoint URL
                <input name="url" type="url" required placeholder="https://hooks.zapier.com/…" className={inputClass} />
              </label>
              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className="mb-1.5 text-sm font-medium">Events</legend>
                {WEBHOOK_EVENTS.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="events" value={e.id} defaultChecked className="accent-[#e65c32]" />
                    {e.label} <code className="text-[11px] text-muted">{e.id}</code>
                  </label>
                ))}
              </fieldset>
              <button className="btn btn-dark h-11 self-start">Add webhook</button>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
