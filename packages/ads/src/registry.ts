import { googleProvider } from "./google";
import { metaProvider } from "./meta";
import { platformConfigured } from "./platforms";
import type { AdsProvider } from "./provider";
import { SandboxAdsProvider } from "./sandbox";
import { tiktokProvider } from "./tiktok";
import type { Platform } from "./types";

const real: Record<Platform, AdsProvider> = { meta: metaProvider, tiktok: tiktokProvider, google: googleProvider };
const sandboxes: Partial<Record<Platform, AdsProvider>> = {};

/**
 * The provider for a platform: the real adapter when its env is configured, otherwise a
 * sandbox that simulates the platform so the flow is demoable offline.
 */
export function getAdsProvider(platform: Platform): AdsProvider {
  if (platformConfigured(platform)) return real[platform];
  return (sandboxes[platform] ??= new SandboxAdsProvider(platform));
}

/** A provider for an already-connected account: sandbox accounts always stay sandboxed. */
export function providerForAccount(platform: Platform, accountExternalId: string): AdsProvider {
  if (accountExternalId.startsWith("sandbox-")) return (sandboxes[platform] ??= new SandboxAdsProvider(platform));
  return getAdsProvider(platform);
}

export function isSandboxAccount(accountExternalId: string) {
  return accountExternalId.startsWith("sandbox-");
}
