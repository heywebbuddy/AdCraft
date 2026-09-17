import { test } from "node:test";
import assert from "node:assert/strict";
import { falImageInput, trimPrompt } from "../src/image/fal-input";
import { BUILT_IN_IMAGE_MODELS, BUILT_IN_MODELS, defaultModel, getModel, listModels, mergeCatalog, registerModels } from "../src/models";
import { generatePhotoPresenter } from "../src/presenter/photo";

test("every built-in fal image model has generation and reference-edit contracts", () => {
  const fal = BUILT_IN_IMAGE_MODELS.filter((m) => m.provider === "fal");
  assert.equal(fal.length, 8);
  for (const spec of fal) {
    const req = { prompt: "An adult fictional character", ratio: "9:16" as const, width: 1080, height: 1920, count: 2, seed: 17 };
    const text = falImageInput(spec, req, []), edit = falImageInput(spec, req, ["https://example.test/reference.png"]);
    assert.equal(text.endpoint, spec.endpoints!.text);
    assert.equal(edit.endpoint, spec.endpoints!.edit);
    assert.equal(text.input.image_urls, undefined);
    assert.deepEqual(edit.input.image_urls, ["https://example.test/reference.png"]);
    if (spec.id === "gpt-image-2") {
      const size = text.input.image_size as { width: number; height: number };
      assert.equal(size.width % 16, 0); assert.equal(size.height % 16, 0);
      assert.equal(text.input.seed, undefined);
    }
    if (spec.id === "flux-2-max") { assert.equal(text.calls, 2); assert.equal(text.input.num_images, undefined); }
    if (spec.preset === "seedream") { const s = text.input.image_size as { width: number; height: number }; assert.ok(s.width * s.height > 3_600_000); }
  }
  const bare = { id: "invented-model", label: "Invented", kind: "image" as const, provider: "fal" as const, creditsPerUnit: 1 };
  assert.throws(() => falImageInput(bare, { prompt: "test", ratio: "1:1", width: 1024, height: 1024, count: 1 }, []), /no fal endpoint/);
});

test("a custom model from the admin catalog needs no code: preset + endpoints + options", () => {
  const custom = mergeCatalog([
    { id: "acme-image-1", kind: "image", spec: { label: "Acme Image 1", provider: "fal", preset: "fal-generic", endpoints: { text: "acme/image-1" }, options: { guidance_scale: 3 }, creditsPerUnit: 2 }, enabled: true, isDefault: true },
    { id: "nano-banana-pro", spec: { creditsPerUnit: 5 }, enabled: true, isDefault: false },
    { id: "flux-2-dev", spec: {}, enabled: false, isDefault: false },
  ]);
  registerModels(custom);
  const spec = getModel("acme-image-1")!;
  assert.equal(spec.custom, true);
  assert.equal(defaultModel("image").id, "acme-image-1");
  assert.equal(getModel("nano-banana-pro")!.default, false, "admin default replaces the built-in default");
  assert.equal(getModel("nano-banana-pro")!.creditsPerUnit, 5, "row fields override built-in fields");
  assert.ok(!listModels("image").some((m) => m.id === "flux-2-dev"), "disabled models leave the pickers");
  const plan = falImageInput(spec, { prompt: "p", ratio: "1:1", width: 1024, height: 1024, count: 1, seed: 3 }, []);
  assert.equal(plan.endpoint, "acme/image-1");
  assert.deepEqual(plan.input, { prompt: "p", image_size: { width: 1024, height: 1024 }, num_images: 1, output_format: "png", seed: 3, guidance_scale: 3 });
  const edit = falImageInput(spec, { prompt: "p", ratio: "1:1", width: 1024, height: 1024, count: 1 }, ["https://x/ref.png"]);
  assert.equal(edit.endpoint, "acme/image-1", "without an edit endpoint the text endpoint is used");
  assert.equal(edit.input.image_urls, undefined, "and references are dropped rather than sent to an endpoint that rejects them");
  registerModels(BUILT_IN_MODELS);
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

test("prompts are trimmed to a model's limit at a sentence boundary", () => {
  const long = "First sentence about the scene. Second sentence with more detail. Third sentence that will not fit at all.";
  assert.equal(trimPrompt(long, 70), "First sentence about the scene. Second sentence with more detail.");
  assert.equal(trimPrompt("short", 70), "short");
  assert.equal(trimPrompt(long), long);
});
