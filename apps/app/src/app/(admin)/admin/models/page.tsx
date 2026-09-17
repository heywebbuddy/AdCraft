import Link from "next/link";
import { BUILT_IN_MODELS, IMAGE_PRESETS, TEXT_PRESETS, VIDEO_PRESETS, type Capability } from "@adcraft/ai";
import { PageHeader } from "@/components/workspace-ui";
import { requireAdmin } from "@/server/admin";
import { loadModels, USD_PER_CREDIT } from "@/server/admin-data";
import { deleteModel, setDefaultModel, toggleModel } from "@/server/admin-models";
import { Chip, Empty, Flash, Panel, Table, ago, int, money, pct } from "@/components/admin/ui";
import { ModelEditor } from "./model-editor";
import { ModelTestButton } from "./model-test-button";

export const dynamic = "force-dynamic";

const unit: Record<string, string> = { image: "per image", video: "per second", text: "per call" };
const kinds: Array<{ kind: Capability; title: string; blurb: string }> = [
  { kind: "image", title: "Image models", blurb: "Static ad scenes, AI-designed ads, product cutout references, character portraits." },
  { kind: "video", title: "Video models", blurb: "Product video clips and UGC b-roll." },
  { kind: "text", title: "Text models", blurb: "Concept and copy generation. The default writes every brief." },
];

export default async function AdminModelsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; edit?: string; model?: string }> }) {
  await requireAdmin();
  const { ok, error, edit } = await searchParams;
  const { registry, unregistered } = await loadModels();
  const editing = edit === "new" ? null : edit ? registry.find((m) => m.id === edit) : undefined;
  const customCount = registry.filter((m) => m.custom).length;

  return (
    <>
      <PageHeader
        title="Models"
        description="The catalog every picker and pipeline reads. Add a model from any supported provider, set what it costs in credits, pick the default per kind, and smoke-test it before customers see it — no deploy needed."
        actions={
          <Link href="/admin/models?edit=new#model-editor" className="btn btn-dark">
            ＋ Add model
          </Link>
        }
      />

      <Flash
        ok={ok}
        error={error}
        messages={{
          "ok:saved": "Model saved. Pickers pick it up on their next load.",
          "ok:enabled": "Model enabled.",
          "ok:disabled": "Model disabled and hidden from pickers.",
          "ok:default": "Default updated.",
          "ok:deleted": "Model removed.",
          "ok:reset": "Built-in model reset to its shipped settings.",
        }}
      />

      {edit ? (
        <Panel title={editing ? `Edit ${editing.label}` : "Add a model"} eyebrow={editing ? (editing.custom ? "Custom model" : "Built-in model") : "New"} note={editing?.custom === false ? "Only the fields you change are stored; Reset returns the shipped spec." : "Custom models are stored in full."}>
          <ModelEditor key={edit} model={editing ?? undefined} builtIn={Boolean(editing && !editing.custom)} presetLists={{ image: IMAGE_PRESETS, video: VIDEO_PRESETS, text: TEXT_PRESETS }} />
        </Panel>
      ) : null}

      {kinds.map(({ kind, title, blurb }) => {
        const rows = registry.filter((m) => m.kind === kind);
        return (
          <Panel key={kind} title={title} eyebrow={`${rows.length} models`} note={blurb}>
            <Table minWidth={760}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Route</th>
                  <th className="num">Credits</th>
                  <th className="num">Usage</th>
                  <th>Status</th>
                  <th>Test</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const avgCost = m.measured?.avgCost ?? null;
                  const avgCredits = m.measured?.avgCredits ?? null;
                  const rev = avgCredits != null ? avgCredits * USD_PER_CREDIT : null;
                  const margin = rev != null && rev > 0 && avgCost != null ? (rev - avgCost) / rev : null;
                  const endpoint = m.kind === "video" ? m.endpoints?.imageToVideo ?? m.endpoints?.textToVideo : m.endpoints?.text ?? (m.provider === "fal" ? "" : m.id);
                  return (
                    <tr key={m.id} style={m.enabled ? undefined : { opacity: 0.55 }}>
                      <td>
                        <span className="cell-primary model-cell-name">
                          <strong>
                            {m.label} {m.isDefault ? <Chip plain>default</Chip> : null} {m.custom ? <Chip tone="ink">custom</Chip> : null}
                          </strong>
                          <small>
                            {m.id}
                            {m.notes ? ` · ${m.notes}` : ""}
                          </small>
                        </span>
                      </td>
                      <td>
                        <span className="model-route">
                          <span>
                            {m.provider}
                            {m.preset ? <> · {m.preset}</> : null}
                          </span>
                          {endpoint ? <code title={endpoint}>{endpoint}</code> : null}
                          {m.endpoints?.edit ? <code title={m.endpoints.edit}>edit: {m.endpoints.edit}</code> : null}
                          {m.baseUrl ? <code title={m.baseUrl}>{m.baseUrl}</code> : null}
                        </span>
                      </td>
                      <td className="num">
                        <span className="cell-primary" style={{ alignItems: "flex-end" }}>
                          <strong>
                            {m.effectiveCredits} <span className="muted" style={{ fontWeight: 400 }}>{unit[m.kind] ?? ""}</span>
                          </strong>
                          <small>{m.approxCostUsd != null ? `~${money(m.approxCostUsd, 3)} cost` : "cost unknown"}</small>
                        </span>
                      </td>
                      <td className="num">
                        {m.measured ? (
                          <span className="cell-primary" style={{ alignItems: "flex-end" }}>
                            <strong>
                              {int(m.measured.n)} {m.measured.n === 1 ? "call" : "calls"}
                              {m.measured.failed ? <span style={{ color: "var(--bad)", fontWeight: 400 }}> · {m.measured.failed} failed</span> : null}
                            </strong>
                            <small>
                              {avgCost != null ? `${money(avgCost, 4)} avg` : "no cost data"}
                              {margin != null ? ` · ${pct(margin, 0)} margin` : ""} · {m.measured.lastUsed ? ago(m.measured.lastUsed) : "never"}
                            </small>
                          </span>
                        ) : (
                          <span className="muted">never used</span>
                        )}
                      </td>
                      <td>
                        <Chip tone={!m.enabled ? "neutral" : m.connected ? "good" : "warn"}>{!m.enabled ? "disabled" : m.connected ? "ready" : "no key"}</Chip>
                      </td>
                      <td style={{ position: "relative" }}>
                        <ModelTestButton id={m.id} kind={m.kind} disabled={!m.connected || !m.enabled} />
                      </td>
                      <td>
                        <details className="model-menu">
                          <summary aria-label={`Actions for ${m.label}`}>⋯</summary>
                          <div>
                            <Link href={`/admin/models?edit=${encodeURIComponent(m.id)}#model-editor`}>Edit</Link>
                            {!m.isDefault ? (
                              <form action={setDefaultModel}>
                                <input type="hidden" name="id" value={m.id} />
                                <button type="submit">Make default</button>
                              </form>
                            ) : null}
                            <form action={toggleModel}>
                              <input type="hidden" name="id" value={m.id} />
                              <input type="hidden" name="enabled" value={m.enabled ? "0" : "1"} />
                              <button type="submit">{m.enabled ? "Disable" : "Enable"}</button>
                            </form>
                            {m.custom || m.overridden ? (
                              <form action={deleteModel}>
                                <input type="hidden" name="id" value={m.id} />
                                <button type="submit" className="danger">
                                  {m.custom ? "Delete" : "Reset to built-in"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Panel>
        );
      })}

      <Panel title="How to add a model" eyebrow="Reference" note={`${BUILT_IN_MODELS.length} built-in · ${customCount} custom`}>
        <div className="admin-panel-body">
          <p>
            <strong>fal.ai</strong> — paste the endpoint id from the model page (e.g. <code>fal-ai/flux-2-max</code>) and pick the preset whose input shape matches; use <em>Generic fal endpoint</em> plus <em>Extra options</em> for anything else. <strong>Replicate</strong> — the ref is <code>owner/name</code> (latest) or <code>owner/name:version</code>; any public image or video model works with the generic preset and options. <strong>Runway</strong> — model names like <code>gen4_image</code> / <code>gen4_turbo</code>; video is image-to-video from the scene still. <strong>OpenAI images</strong> — the id is the API model name; set quality in options. <strong>Text</strong> — Anthropic models use the Messages API; any OpenAI-compatible endpoint (OpenAI, Gemini, Groq, Ollama…) works with a base URL and the env var that holds its key. Run <em>Test</em> after saving: it performs one real, tiny generation and shows the output.
          </p>
        </div>
      </Panel>

      <Panel title="Seen in events but not in the catalog" eyebrow="Unregistered" note="Cutouts, sample models and one-offs">
        {unregistered.length === 0 ? (
          <Empty title="Every model in the events table is in the catalog" />
        ) : (
          <Table minWidth={520}>
            <thead>
              <tr>
                <th>Model id</th>
                <th className="num">Calls</th>
                <th className="num">Failed</th>
                <th className="num">Avg cost</th>
                <th>Last used</th>
              </tr>
            </thead>
            <tbody>
              {unregistered.map((u) => (
                <tr key={u.model || "(blank)"}>
                  <td>
                    <code>{u.model || "(blank)"}</code>
                  </td>
                  <td className="num">{int(u.n)}</td>
                  <td className="num">{int(u.failed)}</td>
                  <td className="num">{u.avgCost != null ? money(u.avgCost, 4) : "—"}</td>
                  <td className="muted">{u.lastUsed ? ago(u.lastUsed) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
