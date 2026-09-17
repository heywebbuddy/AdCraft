import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { generateOpenAIImage, OPENAI_IMAGE_SIZES } from "../src/image/openai";

// All requests are mocked. Synthetic pixels only; no network or real API key.
test("OpenAI image adapter contract", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#d87b42" },
  })
    .png()
    .toBuffer();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const success = () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        data: [{ b64_json: png.toString("base64") }],
        usage: { input_tokens: 120, output_tokens: 320 },
      });
    };
  };
  try {
    delete process.env.OPENAI_API_KEY;
    await t.test(
      "missing configuration fails before making a request",
      async () => {
        globalThis.fetch = async () => {
          throw new Error("Unexpected network access");
        };
        await assert.rejects(
          generateOpenAIImage({
            model: "gpt-image-2.5-sunburst",
            ratio: "4:5",
            prompt: "test",
          }),
          /not connected/,
        );
      },
    );
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    success();
    await t.test(
      "generation uses documented model, quality and exact ratio",
      async () => {
        const result = await generateOpenAIImage({
          model: "gpt-image-2.5-sunburst",
          ratio: "4:5",
          prompt: "test",
        });
        const call = calls.at(-1)!;
        assert.equal(call.url, "https://api.openai.com/v1/images/generations");
        const body = JSON.parse(call.init!.body as string);
        assert.equal(body.size, "1024x1280");
        assert.equal(body.quality, "high");
        assert.equal(body.output_format, "png");
        assert.equal(body.response_format, undefined);
        assert.equal(result.usage.provider, "openai");
        assert.equal(result.usage.outputTokens, 320);
        assert.equal(result.output[0]!.bytes?.equals(png), true);
      },
    );
    await t.test(
      "private synthetic reference bytes use multipart edits",
      async () => {
        await generateOpenAIImage({
          model: "gpt-image-2.5-flare",
          ratio: "9:16",
          prompt: "test",
          references: [{ url: "/api/files/test", bytes: png }],
        });
        const call = calls.at(-1)!;
        assert.equal(call.url, "https://api.openai.com/v1/images/edits");
        assert.ok(call.init!.body instanceof FormData);
        const body = call.init!.body as FormData;
        assert.equal(body.get("quality"), "low");
        assert.equal(body.getAll("image[]").length, 1);
        assert.equal(
          (call.init!.headers as Record<string, string>)["Content-Type"],
          undefined,
        );
      },
    );
    await t.test(
      "missing references fail instead of silently dropping the product",
      async () => {
        const count = calls.length;
        await assert.rejects(
          generateOpenAIImage({
            model: "gpt-image-2.5-flare",
            ratio: "1:1",
            prompt: "test",
            references: [{ url: "/api/files/missing" }],
          }),
          /could not be loaded/,
        );
        assert.equal(calls.length, count);
      },
    );
    await t.test("quota failure is explicit and never retried", async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        return Response.json(
          { error: { message: "secret provider detail" } },
          { status: 429 },
        );
      };
      await assert.rejects(
        generateOpenAIImage({
          model: "gpt-image-2.5-flare",
          ratio: "1:1",
          prompt: "test",
        }),
        /quota/,
      );
      assert.equal(attempts, 1);
    });
    await t.test(
      "empty and malformed outputs cannot be billed as an image",
      async () => {
        globalThis.fetch = async () => Response.json({ data: [] });
        await assert.rejects(
          generateOpenAIImage({
            model: "gpt-image-2.5-flare",
            ratio: "1:1",
            prompt: "test",
          }),
          /no image/,
        );
        globalThis.fetch = async () =>
          Response.json({ data: [{ b64_json: "not-an-image" }] });
        await assert.rejects(
          generateOpenAIImage({
            model: "gpt-image-2.5-flare",
            ratio: "1:1",
            prompt: "test",
          }),
        );
      },
    );
    await t.test("all output sizes satisfy API constraints", () => {
      for (const size of Object.values(OPENAI_IMAGE_SIZES)) {
        const [w, h] = size.split("x").map(Number) as [number, number];
        assert.equal(w % 16, 0);
        assert.equal(h % 16, 0);
        assert.ok(w * h >= 655360 && w * h <= 8294400);
        assert.ok(w / h >= 1 / 3 && w / h <= 3);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
