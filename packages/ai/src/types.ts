/**
 * Provider-neutral interfaces. Every vendor adapter (Anthropic, fal.ai, HeyGen,
 * ElevenLabs, ...) implements one of these; the app never imports a vendor SDK directly.
 */

export type ProviderName = "anthropic" | "openai" | "fal" | "replicate" | "heygen" | "hedra" | "elevenlabs";
export type Capability = "text" | "image" | "video" | "presenter" | "voice";
export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1";

/** Every call reports usage so `generation_events` can be recorded exactly. */
export interface Usage {
  provider: ProviderName;
  model: string;
  costUsd?: number;
  credits?: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Seconds of video, number of images, characters of speech, ... */
  units?: number;
}

export interface GenerationResult<T> {
  output: T;
  usage: Usage;
}

export interface MediaRef {
  /** Public/pre-signed URL the provider can read, or our R2 key once stored. */
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

// ---------- Text ----------

export interface TextMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TextRequest {
  system?: string;
  messages: TextMessage[];
  maxTokens?: number;
  /** Provider-specific effort/reasoning hint. */
  effort?: "low" | "medium" | "high" | "max";
}

export interface StructuredRequest<T> extends TextRequest {
  /** JSON Schema the output must conform to. */
  schema: Record<string, unknown>;
  /** Optional runtime validator (e.g. zod parse). */
  parse?: (raw: unknown) => T;
}

export interface TextProvider {
  readonly name: ProviderName;
  readonly capability: "text";
  generate(req: TextRequest): Promise<GenerationResult<string>>;
  stream(req: TextRequest): AsyncIterable<string>;
  generateStructured<T>(req: StructuredRequest<T>): Promise<GenerationResult<T>>;
}

// ---------- Image ----------

export interface ImageRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  ratio: AspectRatio;
  width?: number;
  height?: number;
  /** Product cutout / style references passed to the model so the product is not hallucinated. */
  references?: MediaRef[];
  seed?: number;
  count?: number;
}

export interface ImageProvider {
  readonly name: ProviderName;
  readonly capability: "image";
  generate(req: ImageRequest): Promise<GenerationResult<MediaRef[]>>;
  removeBackground?(image: MediaRef): Promise<GenerationResult<MediaRef>>;
  upscale?(image: MediaRef, factor: 2 | 4): Promise<GenerationResult<MediaRef>>;
}

// ---------- Video ----------

export interface VideoRequest {
  model: string;
  prompt: string;
  ratio: AspectRatio;
  durationSec: number;
  /** Image-to-video start frame. */
  image?: MediaRef;
  /** Optional end frame for models that support it. */
  endImage?: MediaRef;
  audio?: boolean;
  seed?: number;
}

export interface VideoJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  output?: MediaRef;
  error?: string;
}

export interface VideoProvider {
  readonly name: ProviderName;
  readonly capability: "video";
  /** Kick off an async generation; poll with `status`. */
  submit(req: VideoRequest): Promise<VideoJob>;
  status(jobId: string): Promise<VideoJob>;
  /** Convenience: submit + poll until done. */
  generate(req: VideoRequest): Promise<GenerationResult<MediaRef>>;
}

// ---------- Presenter (UGC avatar) ----------

export interface PresenterRequest {
  model: string;
  avatarId: string;
  script: string;
  /** Pre-rendered voice track, or let the provider synthesise from `voiceId`. */
  audio?: MediaRef;
  voiceId?: string;
  ratio: AspectRatio;
  background?: MediaRef | { color: string };
}

export interface PresenterProvider {
  readonly name: ProviderName;
  readonly capability: "presenter";
  listAvatars(): Promise<Array<{ id: string; label: string; previewUrl?: string; licensed: boolean }>>;
  generate(req: PresenterRequest): Promise<GenerationResult<MediaRef>>;
}

// ---------- Voice ----------

export interface VoiceRequest {
  model: string;
  voiceId: string;
  text: string;
  language?: string;
  speed?: number;
}

export interface VoiceProvider {
  readonly name: ProviderName;
  readonly capability: "voice";
  listVoices(): Promise<Array<{ id: string; label: string; previewUrl?: string }>>;
  synthesize(req: VoiceRequest): Promise<GenerationResult<MediaRef>>;
}
