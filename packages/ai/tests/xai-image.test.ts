import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { BUILT_IN_IMAGE_MODELS, defaultModel, getModel } from "../src/models";
import { generateXaiImage, XAI_ASPECT_RATIOS, xaiImageBody } from "../src/image/xai";

test("Grok Imagine ships as an extra image model and is not the default", () => {
  const spec = getModel("grok-imagine-image-2");
  assert.ok(spec);
  assert.equal(spec.provider, "xai");
  assert.equal(spec.preset, "grok-imagine");
  assert.equal(spec.endpoints?.text, "grok-imagine-image-2.0");
  assert.equal(spec.default, undefined);
  assert.notEqual(defaultModel("image").id, spec.id);
  assert.equal(BUILT_IN_IMAGE_MODELS.filter((m) => m.provider === "xai").length, 1);
});

test("xAI request body uses documented Imagine fields", () => {
  const spec = getModel("grok-imagine-image-2")!;
  const gen = xaiImageBody(spec, { prompt: "A bottle on marble", ratio: "4:5" }, []);
  assert.equal(gen.path, "generations");
  assert.equal(gen.body.model, "grok-imagine-image-2.0");
  assert.equal(gen.body.aspect_ratio, "3:4");
  assert.equal(gen.body.response_format, "b64_json");
  assert.equal(gen.body.quality, "medium");
  assert.equal(gen.body.resolution, "1k");
  assert.equal(gen.body.size, undefined);

  const one = xaiImageBody(spec, { prompt: "Keep the product", ratio: "9:16" }, [{ url: "data:image/png;base64,abc" }]);
  assert.equal(one.path, "edits");
  assert.deepEqual(one.body.image, { url: "data:image/png;base64,abc", type: "image_url" });
  assert.equal(one.body.images, undefined);

  const many = xaiImageBody(spec, { prompt: "Compose", ratio: "1:1" }, [{ url: "a" }, { url: "b" }, { url: "c" }, { url: "d" }]);
  assert.equal(many.path, "edits");
  assert.equal((many.body.images as unknown[]).length, 3);
  assert.equal(many.body.image, undefined);

  assert.equal(XAI_ASPECT_RATIOS["1.91:1"], "2:1");
});

test("xAI image adapter contract", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.XAI_API_KEY;
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#1a1a1a" } }).png().toBuffer();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const success = () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ data: [{ b64_json: png.toString("base64") }] });
    };
  };
  try {
    delete process.env.XAI_API_KEY;
    await t.test("missing configuration fails before making a request", async () => {
      globalThis.fetch = async () => {
        throw new Error("Unexpected network access");
      };
      await assert.rejects(generateXaiImage({ model: "grok-imagine-image-2", ratio: "4:5", prompt: "test" }), /not connected/);
    });
    process.env.XAI_API_KEY = "synthetic-test-key";
    success();
    await t.test("generation posts JSON to Imagine with mapped ratio", async () => {
      const result = await generateXaiImage({ model: "grok-imagine-image-2", ratio: "4:5", prompt: "test" });
      const call = calls.at(-1)!;
      assert.equal(call.url, "https://api.x.ai/v1/images/generations");
      const body = JSON.parse(call.init!.body as string);
      assert.equal(body.aspect_ratio, "3:4");
      assert.equal(body.model, "grok-imagine-image-2.0");
      assert.equal(body.response_format, "b64_json");
      assert.equal(result.usage.provider, "xai");
      assert.equal(result.output[0]!.bytes?.equals(png), true);
    });
    await t.test("private synthetic reference bytes use JSON edits", async () => {
      await generateXaiImage({
        model: "grok-imagine-image-2",
        ratio: "1:1",
        prompt: "test",
        references: [{ url: "/api/files/test", bytes: png }],
      });
      const call = calls.at(-1)!;
      assert.equal(call.url, "https://api.x.ai/v1/images/edits");
      const body = JSON.parse(call.init!.body as string);
      assert.equal(typeof body.image.url, "string");
      assert.ok(String(body.image.url).startsWith("data:image/png;base64,"));
      assert.equal(body.image.type, "image_url");
    });
    await t.test("missing references fail instead of silently dropping the product", async () => {
      const count = calls.length;
      await assert.rejects(
        generateXaiImage({
          model: "grok-imagine-image-2",
          ratio: "1:1",
          prompt: "test",
          references: [{ url: "/api/files/missing" }],
        }),
        /could not be loaded/,
      );
      assert.equal(calls.length, count);
    });
    await t.test("quota failure is explicit and never retried", async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        return Response.json({ error: { message: "secret provider detail" } }, { status: 429 });
      };
      await assert.rejects(generateXaiImage({ model: "grok-imagine-image-2", ratio: "1:1", prompt: "test" }), /quota/);
      assert.equal(attempts, 1);
    });
    await t.test("empty and malformed outputs cannot be billed as an image", async () => {
      globalThis.fetch = async () => Response.json({ data: [] });
      await assert.rejects(generateXaiImage({ model: "grok-imagine-image-2", ratio: "1:1", prompt: "test" }), /no image/);
      globalThis.fetch = async () => Response.json({ data: [{ b64_json: "not-an-image" }] });
      await assert.rejects(generateXaiImage({ model: "grok-imagine-image-2", ratio: "1:1", prompt: "test" }));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = originalKey;
  }
});
