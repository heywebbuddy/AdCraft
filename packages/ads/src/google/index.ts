import { notImplementedProvider, NotImplementedError } from "../not-implemented";
import type { AdsProvider } from "../provider";

// TODO (Release 4): implement against the google marketing API.
export const NotImplemented = NotImplementedError;
export const googleProvider: AdsProvider = notImplementedProvider("google");
