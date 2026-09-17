import { test } from "node:test";
import assert from "node:assert/strict";
import { FAL_IMAGE_ENDPOINTS, falImageInput } from "../src/image/fal-input";
import { generatePhotoPresenter } from "../src/presenter/photo";

test("all eight screenshot models have generation and reference-edit contracts", () => {
  assert.equal(Object.keys(FAL_IMAGE_ENDPOINTS).length, 8);
  for (const model of Object.keys(FAL_IMAGE_ENDPOINTS)) {
    const req = { model, prompt: "An adult fictional character", ratio: "9:16" as const, width: 1080, height: 1920, count: 2, seed: 17 };
    const text = falImageInput(req, []), edit = falImageInput(req, ["https://example.test/reference.png"]);
    assert.equal(text.endpoint, FAL_IMAGE_ENDPOINTS[model]!.text);
    assert.equal(edit.endpoint, FAL_IMAGE_ENDPOINTS[model]!.edit);
    assert.equal(text.input.image_urls, undefined);
    assert.deepEqual(edit.input.image_urls, ["https://example.test/reference.png"]);
    if (model === "gpt-image-2") {
      const size = text.input.image_size as { width: number; height: number };
      assert.equal(size.width % 16, 0); assert.equal(size.height % 16, 0);
      assert.equal(text.input.seed, undefined);
    }
    if (model === "flux-2-max") { assert.equal(text.calls, 2); assert.equal(text.input.num_images, undefined); }
    if (model.startsWith("seedream")) { const s = text.input.image_size as { width: number; height: number }; assert.ok(s.width * s.height > 3_600_000); }
  }
  assert.throws(() => falImageInput({ model: "invented-model", prompt: "test", ratio: "1:1", width: 1024, height: 1024, count: 1 }, []), /Unsupported/);
});

test("photo presenter uploads private bytes and uses the saved image plus exact voice track", async t => {
  const oldFetch = globalThis.fetch, oldKey = process.env.HEYGEN_API_KEY;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const req = { image: Buffer.from("synthetic image"), audio: Buffer.from("synthetic audio"), ratio: "9:16" as const, durationSec: 12 };
  try {
    delete process.env.HEYGEN_API_KEY;
    globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
    await assert.rejects(generatePhotoPresenter(req), /not connected/);
    process.env.HEYGEN_API_KEY = "test-only-key";
    let uploads = 0;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/assets")) { assert.ok(init?.body instanceof FormData); assert.equal((init.body.get("file") as File).size > 0, true); return Response.json({ data: { asset_id: `asset-${++uploads}` } }); }
      if (init?.method === "POST") return Response.json({ data: { video_id: "video-1" } });
      return Response.json({ data: { status: "completed", video_url: "https://example.test/presenter.mp4", duration: 12 } });
    };
    const result = await generatePhotoPresenter(req, { pollMs: 1 });
    const creation = calls.find(c => c.url.endsWith("/videos"))!;
    const body = JSON.parse(String(creation.init?.body));
    assert.equal(body.type, "image");
    assert.deepEqual(body.image, { type: "asset_id", asset_id: "asset-1" });
    assert.equal(body.audio_asset_id, "asset-2"); assert.equal(body.script, undefined); assert.equal(body.voice_id, undefined);
    assert.equal(body.aspect_ratio, "9:16"); assert.equal(result.output.durationSec, 12);
    await t.test("provider rejection is surfaced without a fake success or retry", async () => {
      let count = 0; globalThis.fetch = async () => { count++; return new Response("", { status: 403 }); };
      await assert.rejects(generatePhotoPresenter(req), /upload failed \(403\)/); assert.equal(count, 2);
    });
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.HEYGEN_API_KEY; else process.env.HEYGEN_API_KEY = oldKey; }
});
