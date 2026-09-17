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
import { generateRunwayVideo, runwayVideoStatus, submitRunwayVideo } from "../runway";

/** Route by the spec's provider; fal also serves the offline placeholder when no key is set. */
export function submitVideo(req: FalVideoRequest): Promise<VideoJob> {
  const provider = getModel(req.model)?.provider;
  if (provider === "replicate") return submitReplicateVideo(req);
  if (provider === "runway") return submitRunwayVideo(req);
  return falSubmitVideo(req);
}
export function videoStatus(jobId: string): Promise<VideoJob> {
  if (jobId.startsWith("replicate::")) return replicateVideoStatus(jobId);
  if (jobId.startsWith("runway::")) return runwayVideoStatus(jobId);
  return falVideoStatus(jobId);
}
export function generateVideo(
  req: FalVideoRequest,
  opts: { pollMs?: number; timeoutMs?: number; onStatus?: (job: VideoJob) => void } = {},
): Promise<GenerationResult<GeneratedVideo>> {
  const provider = getModel(req.model)?.provider;
  if (provider === "replicate") return generateReplicateVideo(req, opts);
  if (provider === "runway") return generateRunwayVideo(req, opts);
  return falGenerateVideo(req, opts);
}
