"use client";
import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import type { ModelChoice } from "../new/static-ad-form";

export function RegenerateForm({
  action,
  mode,
  models,
  currentModel,
  sizes,
  missing,
  balance,
  disabled,
}: {
  action: (data: FormData) => Promise<void>;
  mode: "ai" | "editable";
  models: ModelChoice[];
  currentModel: string;
  sizes: number;
  missing: number;
  balance: number;
  disabled: boolean;
}) {
  const [modelId, setModelId] = useState(currentModel);
  const [retryMissing, setRetryMissing] = useState(
    mode === "ai" && missing > 0 && missing < sizes,
  );
  const [instructions, setInstructions] = useState("");
  const model = models.find((m) => m.id === modelId);
  const credits =
    (model?.credits ?? 0) *
    (mode === "ai" ? (retryMissing ? missing : sizes) : 1);
  return (
    <form action={action} className="flex flex-col gap-3">
      {mode === "ai" && (
        <>
          <p className="m-0 text-[12px] leading-relaxed text-muted">
            This ad is a finished image. Describe a change to refine its design.
            Review generated text and brand details before publishing.
          </p>
          <label className="flex flex-col gap-2 text-[11px] font-semibold">
            Refinement instructions{" "}
            <span className="font-normal text-muted">Optional</span>
            <textarea
              name="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Try a lighter background and give the headline more breathing room…"
              className="rounded-md border border-line p-3 text-[12px] font-normal outline-none focus:border-ink"
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-2 text-[11px] font-semibold">
        Image model
        <select
          name="model"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="h-11 w-full rounded-[7px] border border-line bg-white px-3 text-[12px] font-normal outline-none focus:border-ink"
        >
          {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.enabled}>
                {m.label}
                {!m.configured ? " · not connected" : ""}
              </option>
          ))}
        </select>
      </label>
      {mode === "ai" && missing > 0 && missing < sizes && (
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            name="retryMissing"
            checked={retryMissing}
            onChange={(e) => setRetryMissing(e.target.checked)}
          />
          Generate only the {missing} missing {missing === 1 ? "size" : "sizes"}
        </label>
      )}
      <PendingButton
        className="btn btn-outline h-11 text-[12px]"
        pendingLabel="Starting generation…"
        disabled={disabled || !model?.configured || model?.enabled === false || balance < credits}
      >
        {mode === "ai"
          ? instructions.trim()
            ? "Apply changes"
            : retryMissing
              ? "Generate missing sizes"
              : "Generate a new version"
          : "Regenerate background"}
      </PendingButton>
      <span aria-live="polite" className="text-[11px] text-muted">
        {credits} credits · {balance} available
      </span>
      {model && !model.configured ? (
        <p className="m-0 text-[11px] text-[#9b683a]">
          {model.label} is not connected on this server. Choose a connected model.
        </p>
      ) : null}
    </form>
  );
}
