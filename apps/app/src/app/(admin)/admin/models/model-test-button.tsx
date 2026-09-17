"use client";
import { useState, useTransition } from "react";
import { Spark } from "@/components/spark";
import { testModel, type ModelTestResult } from "@/server/admin-models";

/** Runs a tiny real generation and shows the result inline (thumbnail, latency, cost). */
export function ModelTestButton({ id, kind, disabled }: { id: string; kind: "image" | "video" | "text" | string; disabled?: boolean }) {
  const [result, setResult] = useState<ModelTestResult | null>(null);
  const [pending, start] = useTransition();
  const run = () => {
    if (kind === "video" && !window.confirm("This generates a real 5-second clip with the provider (typical cost $0.15–$2). Continue?")) return;
    setResult(null);
    start(async () => setResult(await testModel(id)));
  };
  return (
    <span className="model-test">
      <button type="button" className="btn btn-outline h-8 px-2.5 text-[11px]" onClick={run} disabled={disabled || pending} title={disabled ? "Provider not connected" : "Run a real smoke test"}>
        {pending ? (
          <>
            <Spark size={11} animate="spin" /> Testing…
          </>
        ) : (
          "Test"
        )}
      </button>
      {result ? (
        result.ok ? (
          <span className="model-test-result ok">
            {result.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.preview} alt="Test output" width={56} height={56} />
            ) : null}
            <span>
              <strong>OK</strong> · {(result.ms / 1000).toFixed(1)} s{result.costUsd != null ? ` · ~$${result.costUsd.toFixed(3)}` : ""}
              {result.text ? <small>{result.text}</small> : null}
            </span>
          </span>
        ) : (
          <span className="model-test-result bad">
            <strong>Failed</strong> <small>{result.error}</small>
          </span>
        )
      ) : null}
    </span>
  );
}
