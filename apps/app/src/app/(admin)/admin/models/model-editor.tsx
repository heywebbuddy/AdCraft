"use client";
import { useState } from "react";
import Link from "next/link";
import type { Capability, ModelSpec, ProviderName } from "@adcraft/ai";
import { PendingButton } from "@/components/pending-button";
import { saveModel } from "@/server/admin-models";

/**
 * Add / edit a model. Fields appear by kind and provider; the preset picker explains what
 * each preset sends so an admin can match a new fal endpoint without reading adapter code.
 */
export type PresetOption = { id: string; label: string; provider: ProviderName; hint: string };
export type PresetLists = { image: PresetOption[]; video: PresetOption[]; text: PresetOption[] };

export function ModelEditor({ model, builtIn, presetLists }: { model?: ModelSpec; builtIn: boolean; presetLists: PresetLists }) {
  const IMAGE_PRESETS = presetLists.image, VIDEO_PRESETS = presetLists.video, TEXT_PRESETS = presetLists.text;
  const [kind, setKind] = useState<Capability>(model?.kind ?? "image");
  const [provider, setProvider] = useState<ProviderName>(model?.provider ?? "fal");
  const presets = kind === "image" ? IMAGE_PRESETS : kind === "video" ? VIDEO_PRESETS : TEXT_PRESETS;
  const providerPresets = presets.filter((p) => p.provider === provider || (provider === "openai" && p.id === "openai-chat"));
  const [preset, setPreset] = useState<string>(model?.preset ?? providerPresets[0]?.id ?? "");
  const activePreset = presets.find((p) => p.id === (providerPresets.some((p) => p.id === preset) ? preset : providerPresets[0]?.id));
  const isNew = !model;

  function pickKind(k: Capability) {
    setKind(k);
    const p = k === "text" ? "anthropic" : "fal";
    setProvider(p);
    const list = (k === "image" ? IMAGE_PRESETS : k === "video" ? VIDEO_PRESETS : TEXT_PRESETS).filter((x) => x.provider === p);
    setPreset(list[0]?.id ?? "");
  }
  function pickProvider(p: ProviderName) {
    setProvider(p);
    const list = presets.filter((x) => x.provider === p);
    setPreset(list[0]?.id ?? "");
  }

  return (
    <form action={saveModel} className="admin-panel-body admin-form" id="model-editor">
      <input type="hidden" name="existingId" value={model?.id ?? ""} />
      <div className="admin-grid-3">
        <label>
          <span>
            Kind <small>{builtIn ? "fixed for built-ins" : "what the model produces"}</small>
          </span>
          <select name="kind" value={kind} onChange={(e) => pickKind(e.target.value as Capability)} disabled={!isNew}>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="text">Text (concepts &amp; copy)</option>
          </select>
        </label>
        <label>
          <span>
            Provider <small>where the request goes</small>
          </span>
          <select name="provider" value={provider} onChange={(e) => pickProvider(e.target.value as ProviderName)}>
            {kind !== "text" ? <option value="fal">fal.ai</option> : null}
            {kind !== "text" ? <option value="replicate">Replicate</option> : null}
            {kind !== "text" ? <option value="runway">Runway</option> : null}
            <option value="openai">OpenAI {kind === "text" ? "or OpenAI-compatible" : ""}</option>
            {kind === "text" ? <option value="anthropic">Anthropic</option> : null}
          </select>
        </label>
        <label>
          <span>
            Input preset <small>{activePreset?.hint ?? ""}</small>
          </span>
          <select name="preset" value={activePreset?.id ?? ""} onChange={(e) => setPreset(e.target.value)}>
            {providerPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-grid-3">
        {isNew ? (
          <label>
            <span>
              Model id <small>stable, used in billing</small>
            </span>
            <input name="id" defaultValue="" placeholder="e.g. flux-3-pro" pattern="[a-z0-9][a-z0-9._-]{1,60}" required />
          </label>
        ) : (
          <label>
            <span>Model id</span>
            <input value={model.id} readOnly />
          </label>
        )}
        <label>
          <span>Label</span>
          <input name="label" defaultValue={model?.label ?? ""} placeholder="Shown in pickers" maxLength={60} required />
        </label>
        <label>
          <span>
            Credits per {kind === "video" ? "second" : kind === "image" ? "image" : "generation"} <small>what customers pay</small>
          </span>
          <input name="creditsPerUnit" type="number" step="0.5" min="0" defaultValue={model?.creditsPerUnit ?? (kind === "video" ? 8 : kind === "image" ? 2 : 0)} required />
        </label>
      </div>

      {kind === "image" && provider === "fal" ? (
        <div className="admin-grid-2">
          <label>
            <span>
              Text-to-image endpoint <small>fal endpoint id</small>
            </span>
            <input name="endpoint.text" defaultValue={model?.endpoints?.text ?? ""} placeholder="fal-ai/flux-2-max" required />
          </label>
          <label>
            <span>
              Edit endpoint <small>used when references are passed; optional</small>
            </span>
            <input name="endpoint.edit" defaultValue={model?.endpoints?.edit ?? ""} placeholder="fal-ai/flux-2-max/edit" />
          </label>
        </div>
      ) : null}
      {kind === "image" && (provider === "replicate" || provider === "runway") ? (
        <div className="admin-grid-2">
          <label>
            <span>
              {provider === "runway" ? "Runway model" : "Replicate model"} <small>{provider === "runway" ? "e.g. gen4_image" : "owner/name or owner/name:version"}</small>
            </span>
            <input name="endpoint.text" defaultValue={model?.endpoints?.text ?? ""} placeholder={provider === "runway" ? "gen4_image" : "black-forest-labs/flux-1.1-pro"} required />
          </label>
          <label className="check" style={{ alignSelf: "end" }}>
            <input type="checkbox" name="promptOnly" defaultChecked={model?.endpoints?.edit === "none"} /> Prompt-only (ignore reference images)
          </label>
        </div>
      ) : null}
      {kind === "video" ? (
        <>
          <div className="admin-grid-2">
            <label>
              <span>
                Image-to-video endpoint <small>start frame → clip</small>
              </span>
              <input name="endpoint.imageToVideo" defaultValue={model?.endpoints?.imageToVideo ?? ""} placeholder={provider === "replicate" ? "kwaivgi/kling-v2.1" : provider === "runway" ? "gen4_turbo" : "fal-ai/kling-video/v3/standard/image-to-video"} />
            </label>
            <label>
              <span>
                Text-to-video endpoint <small>optional</small>
              </span>
              <input name="endpoint.textToVideo" defaultValue={model?.endpoints?.textToVideo ?? ""} placeholder={provider === "replicate" ? "kwaivgi/kling-v2.1" : provider === "runway" ? "veo3 (optional)" : "fal-ai/kling-video/v3/standard/text-to-video"} />
            </label>
          </div>
          <div className="admin-grid-3">
            <label>
              <span>
                Durations <small>seconds, comma separated</small>
              </span>
              <input name="durations" defaultValue={(model?.video?.durationsSec ?? [5, 10]).join(", ")} />
            </label>
            <label>
              <span>Sizes</span>
              <span style={{ display: "flex", gap: 12, flexWrap: "wrap", fontWeight: 400 }}>
                {(["9:16", "1:1", "16:9", "4:5"] as const).map((r) => (
                  <label key={r} className="check" style={{ flexDirection: "row" }}>
                    <input type="checkbox" name="ratios" value={r} defaultChecked={(model?.video?.ratios ?? ["9:16", "1:1", "16:9"]).includes(r)} /> {r}
                  </label>
                ))}
              </span>
            </label>
            <label className="check">
              <input type="checkbox" name="audio" defaultChecked={model?.video?.audio ?? false} /> Generates audio
            </label>
          </div>
        </>
      ) : null}
      {kind === "text" || (kind === "image" && provider === "openai") ? (
        <div className="admin-grid-3">
          <label>
            <span>
              API model name <small>if different from the id</small>
            </span>
            <input name="endpoint.text" defaultValue={model?.endpoints?.text ?? ""} placeholder={kind === "text" ? "claude-haiku-4-5-20251001 / gpt-5.5" : "gpt-image-2.5-sunburst"} />
          </label>
          {provider === "openai" ? (
            <>
              <label>
                <span>
                  Base URL <small>OpenAI-compatible endpoint; blank = api.openai.com</small>
                </span>
                <input name="baseUrl" defaultValue={model?.baseUrl ?? ""} placeholder="https://generativelanguage.googleapis.com/v1beta/openai" />
              </label>
              <label>
                <span>
                  API key env var <small>blank = OPENAI_API_KEY</small>
                </span>
                <input name="apiKeyEnv" defaultValue={model?.apiKeyEnv ?? ""} placeholder="GEMINI_API_KEY" />
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="admin-grid-2">
        <label>
          <span>
            Extra options <small>JSON merged into every request</small>
          </span>
          <input name="options" defaultValue={model?.options ? JSON.stringify(model.options) : ""} placeholder='{ "quality": "low" }' />
        </label>
        <label>
          <span>
            Approx. cost <small>USD per unit, for margin reports</small>
          </span>
          <input name="approxCostUsd" type="number" step="0.001" min="0" defaultValue={model?.approxCostUsd ?? ""} placeholder="0.04" />
        </label>
        <label>
          <span>
            Max prompt length <small>characters; blank = no limit</small>
          </span>
          <input name="maxPromptChars" type="number" min="50" step="1" defaultValue={model?.maxPromptChars ?? ""} placeholder="1000" />
        </label>
        <label>
          <span>
            Notes <small>shown under the label in pickers</small>
          </span>
          <input name="notes" defaultValue={model?.notes ?? ""} maxLength={200} placeholder="Photoreal lifestyle scenes." />
        </label>
      </div>
      {kind === "image" && provider !== "openai" ? (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <label className="check">
            <input type="checkbox" name="noSeed" defaultChecked={model?.noSeed ?? false} /> Endpoint rejects a seed field
          </label>
          <label className="check">
            <input type="checkbox" name="singleImage" defaultChecked={model?.maxImagesPerCall === 1} /> Returns one image per call
          </label>
        </div>
      ) : null}
      <input type="hidden" name="enabled" value={model?.enabled === false ? "off" : "on"} />
      <div className="admin-form-actions">
        <Link href="/admin/models" className="btn btn-outline">
          Cancel
        </Link>
        <PendingButton className="btn btn-dark" pendingLabel="Saving…">
          {isNew ? "Add model" : "Save changes"}
        </PendingButton>
      </div>
    </form>
  );
}
