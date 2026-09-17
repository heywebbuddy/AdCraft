export {
  isFalVideoConfigured,
  VIDEO_RATIO_SIZES,
  OFFLINE_CLIP_SECONDS,
  supportedDuration,
  buildFalVideoInput,
  placeholderVideo,
  downloadVideo,
  FalVideoProvider,
  type GeneratedVideo,
  type FalVideoRequest,
} from "./fal-video";
export { ffmpegPath, runFfmpeg, withTempDir, probeDurationSec, probeBufferDurationSec, kenBurnsMp4, silenceMp3, slideshowMp4, posterPng, evenSize, type SlideFrame } from "./ffmpeg";

import { getModel } from "../models";
import type { GenerationResult, VideoJob } from "../types";
import { generateVideo as falGenerateVideo, submitVideo as falSubmitVideo, videoStatus as falVideoStatus, type FalVideoRequest, type GeneratedVideo } from "./fal-video";
import { generateReplicateVideo, replicateVideoStatus, submitReplicateVideo } from "../replicate";

/** Route by the spec's provider; fal also serves the offline placeholder when no key is set. */
export function submitVideo(req: FalVideoRequest): Promise<VideoJob> {
  return getModel(req.model)?.provider === "replicate" ? submitReplicateVideo(req) : falSubmitVideo(req);
}
export function videoStatus(jobId: string): Promise<VideoJob> {
  return jobId.startsWith("replicate::") ? replicateVideoStatus(jobId) : falVideoStatus(jobId);
}
export function generateVideo(
  req: FalVideoRequest,
  opts: { pollMs?: number; timeoutMs?: number; onStatus?: (job: VideoJob) => void } = {},
): Promise<GenerationResult<GeneratedVideo>> {
  return getModel(req.model)?.provider === "replicate" ? generateReplicateVideo(req, opts) : falGenerateVideo(req, opts);
}
