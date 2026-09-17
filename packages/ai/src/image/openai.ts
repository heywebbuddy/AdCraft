import sharp from "sharp";
import type { AspectRatio, GenerationResult } from "../types";
import type { FalImageRequest, GeneratedImage } from "./fal";

export const isOpenAIConfigured = () =>
  Boolean(process.env.OPENAI_API_KEY?.trim());
// Exact aspect ratios, multiples of 16, within the documented pixel limits.
export const OPENAI_IMAGE_SIZES: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1280",
  "9:16": "1008x1792",
  "16:9": "1792x1008",
  "1.91:1": "1536x800",
};

/** Direct Image API adapter. Private references are uploaded as bytes, never localhost URLs. */
export async function generateOpenAIImage(
  req: FalImageRequest,
): Promise<GenerationResult<GeneratedImage[]>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey)
    throw new Error(
      "OpenAI image generation is not connected. Add OPENAI_API_KEY on the server.",
    );
  if (!["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"].includes(req.model))
    throw new Error("Unsupported OpenAI image model");
  if ((req.count ?? 1) !== 1)
    throw new Error("Generate one composition per request");
  const started = Date.now();
  const fields = {
    model: req.model,
    prompt: req.prompt,
    n: 1,
    size: OPENAI_IMAGE_SIZES[req.ratio],
    output_format: "png",
    quality: req.model === "gpt-image-2.5-flare" ? "low" : "high",
  };
  const refs = req.references ?? [];
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  let body: string | FormData;
  if (refs.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
    for (const [i, ref] of refs.entries()) {
      // Resolving references belongs to the caller, which has tenant-aware storage access.
      if (!ref.bytes?.length)
        throw new Error("An image reference could not be loaded");
      const png = await sharp(ref.bytes)
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      form.append(
        "image[]",
        new Blob([new Uint8Array(png)], { type: "image/png" }),
        `reference-${i + 1}.png`,
      );
    }
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(fields);
  }
  // No automatic retry: a timed-out image request may still incur provider usage.
  const response = await fetch(
    `https://api.openai.com/v1/images/${refs.length ? "edits" : "generations"}`,
    {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(180_000),
    },
  );
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    const reason =
      response.status === 401
        ? "Check the server API key."
        : response.status === 429
          ? "Check the OpenAI quota or try again later."
          : response.status === 403 || response.status === 404
            ? "Check that this API project has access to the selected image model."
            : "The request could not be completed. Try adjusting the brief.";
    throw new Error(
      `OpenAI image request failed (${response.status}). ${reason}${requestId ? ` Request: ${requestId}` : ""}`,
    );
  }
  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64)
    throw new Error("OpenAI returned no image. No creative was replaced.");
  // Validate and normalize before storage, billing, or rendering.
  const { data: bytes, info } = await sharp(Buffer.from(b64, "base64"))
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    output: [
      {
        url: "",
        mimeType: "image/png",
        bytes,
        width: info.width,
        height: info.height,
      },
    ],
    usage: {
      provider: "openai",
      model: req.model,
      durationMs: Date.now() - started,
      units: 1,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    },
  };
}
