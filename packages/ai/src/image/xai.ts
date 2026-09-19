import sharp from "sharp";
import type { AspectRatio, GenerationResult } from "../types";
import type { FalImageRequest, GeneratedImage } from "./fal";
import { apiModelName, getModel, type ModelSpec } from "../models";

export const isXaiConfigured = () => Boolean(process.env.XAI_API_KEY?.trim());

/** Closest xAI-supported ratio for each of our placement ratios. */
export const XAI_ASPECT_RATIOS: Record<AspectRatio, string> = {
  "1:1": "1:1",
  "4:5": "3:4",
  "9:16": "9:16",
  "16:9": "16:9",
  "1.91:1": "2:1",
};

export function xaiImageBody(
  spec: ModelSpec,
  req: { prompt: string; ratio: AspectRatio },
  refs: Array<{ url: string }>,
): { path: "generations" | "edits"; body: Record<string, unknown> } {
  const body: Record<string, unknown> = {
    model: apiModelName(spec),
    prompt: req.prompt,
    n: 1,
    aspect_ratio: XAI_ASPECT_RATIOS[req.ratio],
    response_format: "b64_json",
    ...(spec.options ?? {}),
  };
  if (refs.length > 1) {
    return { path: "edits", body: { ...body, images: refs.slice(0, 3).map((r) => ({ url: r.url, type: "image_url" })) } };
  }
  if (refs.length === 1) {
    return { path: "edits", body: { ...body, image: { url: refs[0]!.url, type: "image_url" } } };
  }
  return { path: "generations", body };
}

/** Direct xAI Imagine adapter. Private references travel as data URIs, never localhost URLs. */
export async function generateXaiImage(req: FalImageRequest): Promise<GenerationResult<GeneratedImage[]>> {
  const spec = getModel(req.model);
  if (!spec || spec.kind !== "image" || spec.provider !== "xai") throw new Error("Unsupported xAI image model");
  const apiKey = (spec.apiKeyEnv ? process.env[spec.apiKeyEnv] : process.env.XAI_API_KEY)?.trim();
  if (!apiKey) {
    throw new Error(`Grok image generation is not connected. Add ${spec.apiKeyEnv ?? "XAI_API_KEY"} on the server.`);
  }
  if ((req.count ?? 1) !== 1) throw new Error("Generate one composition per request");
  const started = Date.now();
  const promptOnly = spec.endpoints?.edit === "none";
  const refs = promptOnly ? [] : (req.references ?? []);
  const uploaded: Array<{ url: string }> = [];
  for (const ref of refs) {
    if (!ref.bytes?.length) throw new Error("An image reference could not be loaded");
    const png = await sharp(ref.bytes)
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    uploaded.push({ url: `data:image/png;base64,${png.toString("base64")}` });
  }
  const { path, body } = xaiImageBody(spec, { prompt: req.prompt, ratio: req.ratio }, uploaded);
  const baseUrl = (spec.baseUrl ?? "https://api.x.ai/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/images/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    const reason =
      response.status === 401
        ? "Check the server API key."
        : response.status === 429
          ? "Check the xAI quota or try again later."
          : response.status === 403 || response.status === 404
            ? "Check that this API key has access to the selected Grok image model."
            : "The request could not be completed. Try adjusting the brief.";
    throw new Error(`Grok image request failed (${response.status}). ${reason}${requestId ? ` Request: ${requestId}` : ""}`);
  }
  const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = data.data?.[0];
  let raw: Buffer | undefined;
  if (first?.b64_json) raw = Buffer.from(first.b64_json, "base64");
  else if (first?.url) {
    const downloaded = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
    if (!downloaded.ok) throw new Error("Grok returned an image URL that could not be downloaded.");
    raw = Buffer.from(await downloaded.arrayBuffer());
  }
  if (!raw?.length) throw new Error("Grok returned no image. No creative was replaced.");
  const { data: bytes, info } = await sharp(raw).png().toBuffer({ resolveWithObject: true });
  return {
    output: [{ url: "", mimeType: "image/png", bytes, width: info.width, height: info.height }],
    usage: { provider: "xai", model: req.model, durationMs: Date.now() - started, units: 1 },
  };
}
