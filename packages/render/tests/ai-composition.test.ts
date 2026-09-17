import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeDocument, documentRenderKey } from "../src/static/document";
import { renderStatic } from "../src/static/render";
const base = normalizeDocument({
  headline: "Must not be overlaid",
  cta: "Nor this",
  brand: {
    name: "Test brand",
    colors: {
      primary: "#222222",
      accent: "#ee5533",
      text: "#222222",
      background: "#ffffff",
    },
    fonts: { heading: "Does not exist", body: "Does not exist" },
  },
});
test("old documents retain editable rendering semantics", () =>
  assert.equal(base.mode, "editable"));
test("AI output uses the ratio-specific artwork without extra copy or font loading", async () => {
  const png = await sharp({
    create: { width: 80, height: 100, channels: 3, background: "#ee5533" },
  })
    .png()
    .toBuffer();
  const doc = normalizeDocument({
    ...base,
    mode: "ai",
    artwork: { "4:5": { key: "portrait" } },
  });
  const result = await renderStatic(
    doc,
    { width: 80, height: 100, ratio: "4:5" },
    {
      loadAsset: async (ref) => {
        assert.equal(ref.key, "portrait");
        return png;
      },
    },
  );
  const { data, info } = await sharp(result)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 80);
  assert.equal(info.height, 100);
  for (let i = 0; i < data.length; i += 3)
    assert.deepEqual([...data.subarray(i, i + 3)], [238, 85, 51]);
});
test("missing ratio fails instead of cropping another size or substituting a gradient", async () => {
  await assert.rejects(
    renderStatic(
      { ...base, mode: "ai", artwork: {} },
      { width: 80, height: 100, ratio: "4:5" },
    ),
    /not been generated/,
  );
});
test("artwork changes invalidate render cache, metadata does not", () => {
  const doc = {
    ...base,
    mode: "ai" as const,
    artwork: { "4:5": { key: "a" } },
  };
  assert.notEqual(
    documentRenderKey(doc),
    documentRenderKey({ ...doc, artwork: { "4:5": { key: "b" } } }),
  );
  assert.equal(
    documentRenderKey(doc),
    documentRenderKey({ ...doc, meta: { note: "updated" } }),
  );
});
