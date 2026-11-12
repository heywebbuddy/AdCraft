import { test } from "node:test";
import assert from "node:assert/strict";
import { isFalConfigured } from "../src/image/fal";
import { isFalVideoConfigured } from "../src/video/fal-video";
import { isHeyGenConfigured } from "../src/presenter/heygen";
import { isElevenLabsConfigured } from "../src/voice/elevenlabs";
import { isXaiConfigured } from "../src/image/xai";
import { isReplicateConfigured } from "../src/replicate";
import { isRunwayConfigured } from "../src/runway";
import { isAnthropicConfigured } from "../src/anthropic";

/**
 * Keys saved in Admin → Providers are applied by writing `process.env` while the server
 * runs (see apps/app/src/server/provider-keys.ts), so every "is this provider connected?"
 * check has to read the environment at call time.
 *
 * These were once `const x = Boolean(process.env.KEY)` — evaluated once at import. A key
 * added from the admin panel set the variable but the flag stayed false until a restart,
 * so the model showed "no key" and the pipelines quietly produced offline placeholders.
 */
const CHECKS: Array<{ name: string; env: string; read: () => boolean }> = [
  { name: "fal (images)", env: "FAL_KEY", read: isFalConfigured },
  { name: "fal (video)", env: "FAL_KEY", read: isFalVideoConfigured },
  { name: "HeyGen", env: "HEYGEN_API_KEY", read: isHeyGenConfigured },
  { name: "ElevenLabs", env: "ELEVENLABS_API_KEY", read: isElevenLabsConfigured },
  { name: "xAI", env: "XAI_API_KEY", read: isXaiConfigured },
  { name: "Replicate", env: "REPLICATE_API_TOKEN", read: isReplicateConfigured },
  { name: "Runway", env: "RUNWAYML_API_SECRET", read: isRunwayConfigured },
  { name: "Anthropic", env: "ANTHROPIC_API_KEY", read: isAnthropicConfigured },
];

test("provider checks follow a key set after start-up", () => {
  for (const { name, env, read } of CHECKS) {
    const original = process.env[env];
    try {
      delete process.env[env];
      assert.equal(read(), false, `${name} should be disconnected while ${env} is unset`);

      // What saving the key in Admin → Providers does.
      process.env[env] = "test-key-set-at-runtime";
      assert.equal(read(), true, `${name} must notice ${env} without a restart`);

      // Clearing it in the panel has to disconnect again.
      delete process.env[env];
      assert.equal(read(), false, `${name} must disconnect when ${env} is cleared`);
    } finally {
      if (original === undefined) delete process.env[env];
      else process.env[env] = original;
    }
  }
});

test("a blank or whitespace key does not count as connected", () => {
  for (const { name, env, read } of CHECKS) {
    const original = process.env[env];
    try {
      process.env[env] = "   ";
      assert.equal(read(), false, `${name} should treat a whitespace ${env} as unset`);
    } finally {
      if (original === undefined) delete process.env[env];
      else process.env[env] = original;
    }
  }
});
