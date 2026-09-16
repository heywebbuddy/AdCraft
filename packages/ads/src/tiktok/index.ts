import { notImplementedProvider, NotImplementedError } from "../not-implemented";
import type { AdsProvider } from "../provider";

// TODO (Release 4): implement against the tiktok marketing API.
export const NotImplemented = NotImplementedError;
export const tiktokProvider: AdsProvider = notImplementedProvider("tiktok");
