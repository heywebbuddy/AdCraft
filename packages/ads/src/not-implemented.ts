import type { Platform } from "./types";
import type { AdsProvider } from "./provider";

export class NotImplementedError extends Error {
  constructor(platform: Platform, method: string) {
    super(`@adcraft/ads: ${platform}.${method} is not implemented yet (Release 4).`);
    this.name = "NotImplementedError";
  }
}

/** Stub provider that throws on every call. Replaced per platform in Release 4. */
export function notImplementedProvider(platform: Platform): AdsProvider {
  const fail = (method: string) => () => Promise.reject(new NotImplementedError(platform, method));
  return {
    platform,
    connect: fail("connect"),
    exchangeCode: fail("exchangeCode"),
    refreshTokens: fail("refreshTokens"),
    listAccounts: fail("listAccounts"),
    createCampaign: fail("createCampaign"),
    createAdSet: fail("createAdSet"),
    uploadCreative: fail("uploadCreative"),
    createAd: fail("createAd"),
    setStatus: fail("setStatus"),
    fetchInsights: fail("fetchInsights"),
    validate: fail("validate"),
  };
}
